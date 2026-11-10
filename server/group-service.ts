import { randomUUID } from 'node:crypto';
import { getCountry } from '../shared/countries.ts';
import type {
  GroupMember,
  GroupOverview,
  GroupRole,
  GroupSummary,
  Visit,
  VisitCity,
} from '../shared/types.ts';
import type { Database } from './db.ts';
import { HttpError } from './errors.ts';
import { generateInviteCode, normalizeInviteCode } from './invite.ts';
import {
  addStopToTripCountry,
  createTrip,
  groupVisitsForMember,
  loadTripsForUsers,
  removeCountryFromTrip,
  removeStopFromTrip,
  statsForTrips,
  visitForTripCountry,
} from './trip-service.ts';

interface GroupRow {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
}

interface MemberRow {
  id: string;
  name: string;
  home_country_code: string;
  role: GroupRole;
  joined_at: string;
}

interface GroupListRow extends GroupRow {
  role: GroupRole;
  member_count: number;
  country_count: number;
}

export function getMembership(
  db: Database,
  groupId: string,
  userId: string,
): { role: GroupRole; joined_at: string } | undefined {
  return db
    .prepare('SELECT role, joined_at FROM memberships WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId) as { role: GroupRole; joined_at: string } | undefined;
}

export function listGroups(db: Database, userId: string): GroupSummary[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.name, g.owner_id, g.invite_code, g.created_at, m.role,
        (SELECT COUNT(*) FROM memberships mm WHERE mm.group_id = g.id) AS member_count,
        (SELECT COUNT(DISTINCT tc.country_code)
         FROM trip_countries tc
         JOIN trip_participants tp ON tp.trip_id = tc.trip_id AND tp.status = 'accepted'
         JOIN memberships mm ON mm.user_id = tp.user_id AND mm.group_id = g.id) AS country_count
       FROM groups g
       JOIN memberships m ON m.group_id = g.id
       WHERE m.user_id = ?
       ORDER BY g.created_at DESC`,
    )
    .all(userId) as unknown as GroupListRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
    memberCount: row.member_count,
    countryCount: row.country_count,
    myRole: row.role,
  }));
}

export function createGroup(
  db: Database,
  userId: string,
  name: string,
): GroupSummary {
  const id = randomUUID();
  const now = new Date().toISOString();
  let inviteCode = generateInviteCode();

  db.exec('BEGIN');
  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const exists = db
        .prepare('SELECT 1 AS found FROM groups WHERE invite_code = ?')
        .get(inviteCode);
      if (!exists) break;
      inviteCode = generateInviteCode();
      if (attempt === 11) {
        throw new HttpError(500, 'No pudimos generar un código de invitación. Intenta de nuevo.');
      }
    }

    db.prepare(
      'INSERT INTO groups (id, name, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, name, userId, inviteCode, now);
    db.prepare(
      'INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
    ).run(id, userId, 'owner', now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    id,
    name,
    ownerId: userId,
    inviteCode,
    createdAt: now,
    memberCount: 1,
    countryCount: 0,
    myRole: 'owner',
  };
}

export function joinGroup(db: Database, userId: string, rawCode: string): GroupSummary {
  const inviteCode = normalizeInviteCode(rawCode);
  const group = db
    .prepare('SELECT id, name, owner_id, invite_code, created_at FROM groups WHERE invite_code = ?')
    .get(inviteCode) as GroupRow | undefined;

  if (!group) {
    throw new HttpError(404, 'Ese código de invitación no existe o ya no está activo.', {
      code: 'INVITE_NOT_FOUND',
    });
  }

  const existing = getMembership(db, group.id, userId);
  if (existing) {
    throw new HttpError(409, 'Ya formas parte de este grupo.', { code: 'ALREADY_MEMBER' });
  }

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
  ).run(group.id, userId, 'member', now);

  const aggregate = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM memberships WHERE group_id = ?) AS member_count,
        (SELECT COUNT(DISTINCT tc.country_code)
         FROM trip_countries tc
         JOIN trip_participants tp ON tp.trip_id = tc.trip_id
         JOIN memberships mm ON mm.user_id = tp.user_id AND mm.group_id = ?) AS country_count`,
    )
    .get(group.id, group.id) as { member_count: number; country_count: number };

  return {
    id: group.id,
    name: group.name,
    ownerId: group.owner_id,
    inviteCode: group.invite_code,
    createdAt: group.created_at,
    memberCount: aggregate.member_count,
    countryCount: aggregate.country_count,
    myRole: 'member',
  };
}

export function getGroupOverview(
  db: Database,
  groupId: string,
  userId: string,
): GroupOverview {
  const membership = getMembership(db, groupId, userId);
  if (!membership) {
    throw new HttpError(404, 'No encontramos ese grupo o no tienes acceso.', {
      code: 'GROUP_NOT_FOUND',
    });
  }

  const group = db
    .prepare('SELECT id, name, owner_id, invite_code, created_at FROM groups WHERE id = ?')
    .get(groupId) as GroupRow | undefined;
  if (!group) {
    throw new HttpError(404, 'No encontramos ese grupo.', { code: 'GROUP_NOT_FOUND' });
  }

  const memberRows = db
    .prepare(
      `SELECT u.id, u.name, u.home_country_code, m.role, m.joined_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY m.joined_at ASC, u.name ASC`,
    )
    .all(groupId) as unknown as MemberRow[];

  const memberIds = memberRows.map((member) => member.id);
  const trips = loadTripsForUsers(db, memberIds, userId);

  const members: GroupMember[] = memberRows.map((member) => {
    const memberTrips = trips.filter((trip) =>
      trip.participants.some((participant) => participant.id === member.id),
    );
    return {
      id: member.id,
      name: member.name,
      homeCountryCode: member.home_country_code,
      role: member.role,
      joinedAt: member.joined_at,
      stats: statsForTrips(memberTrips, member.home_country_code),
    };
  });

  const visits = memberRows
    .flatMap((member) => groupVisitsForMember(trips, member.id, userId))
    .sort(
      (a, b) =>
        b.visitedAt.localeCompare(a.visitedAt) ||
        a.countryCode.localeCompare(b.countryCode) ||
        a.userId.localeCompare(b.userId),
    );

  const uniqueCountries = new Set(visits.map((visit) => visit.countryCode));
  const continents = new Set<string>();
  for (const code of uniqueCountries) {
    const region = getCountry(code)?.region;
    if (region) continents.add(region);
  }
  const kilometers = members.reduce((total, member) => total + member.stats.kilometers, 0);
  const tripCount = new Set(trips.map((trip) => trip.id)).size;

  return {
    group: {
      id: group.id,
      name: group.name,
      ownerId: group.owner_id,
      inviteCode: group.invite_code,
      createdAt: group.created_at,
    },
    me: { role: membership.role },
    members,
    visits,
    stats: {
      countries: uniqueCountries.size,
      kilometers,
      continents: continents.size,
      visits: visits.length,
      trips: tripCount,
    },
  };
}

export interface CreateVisitInput {
  countryCode: string;
  cityName?: string | null;
  lat?: number;
  lng?: number;
  visitedAt: string;
}

export function createVisit(
  db: Database,
  groupId: string,
  userId: string,
  input: CreateVisitInput,
): Visit {
  if (!getMembership(db, groupId, userId)) {
    throw new HttpError(404, 'No encontramos ese grupo o no tienes acceso.', {
      code: 'GROUP_NOT_FOUND',
    });
  }

  const country = getCountry(input.countryCode);
  if (!country) {
    throw new HttpError(400, 'Ese país no está en el atlas.', { code: 'INVALID_COUNTRY' });
  }

  const trip = createTrip(db, userId, {
    startDate: input.visitedAt,
    endDate: input.visitedAt,
    stops: [
      {
        countryCode: country.iso2,
        cityName: input.cityName,
        lat: input.lat,
        lng: input.lng,
      },
    ],
    participantIds: [],
  });
  return visitForTripCountry(db, trip.id, country.iso2, userId, userId);
}

export interface AddVisitCityInput {
  name: string;
  lat?: number;
  lng?: number;
}

export function addVisitCity(
  db: Database,
  groupId: string,
  userId: string,
  visitId: string,
  input: AddVisitCityInput,
): VisitCity {
  if (!getMembership(db, groupId, userId)) {
    throw new HttpError(404, 'No encontramos ese grupo o no tienes acceso.', {
      code: 'GROUP_NOT_FOUND',
    });
  }
  return addStopToTripCountry(db, userId, visitId, input);
}

export function deleteVisitCity(
  db: Database,
  groupId: string,
  userId: string,
  visitId: string,
  cityId: string,
): void {
  if (!getMembership(db, groupId, userId)) {
    throw new HttpError(404, 'No encontramos ese grupo o no tienes acceso.', {
      code: 'GROUP_NOT_FOUND',
    });
  }
  removeStopFromTrip(db, userId, visitId, cityId);
}

export function deleteVisit(
  db: Database,
  groupId: string,
  userId: string,
  visitId: string,
): void {
  if (!getMembership(db, groupId, userId)) {
    throw new HttpError(404, 'No encontramos ese grupo o no tienes acceso.', {
      code: 'GROUP_NOT_FOUND',
    });
  }
  removeCountryFromTrip(db, userId, visitId);
}

