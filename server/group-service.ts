import { randomUUID } from 'node:crypto';
import {
  countryFlag,
  countryName,
  getCountry,
  TOTAL_COUNTRIES,
} from '../shared/countries.ts';
import { computeMemberStats, isValidCoordinates } from '../shared/geo.ts';
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

interface VisitRow {
  id: string;
  user_id: string;
  country_code: string;
  city_name: string | null;
  lat: number;
  lng: number;
  visited_at: string;
  created_at: string;
}

interface VisitCityRow {
  id: string;
  visit_id: string;
  city_name: string;
  lat: number | null;
  lng: number | null;
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
        (SELECT COUNT(DISTINCT v.country_code) FROM visits v WHERE v.group_id = g.id) AS country_count
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
        throw new HttpError(500, 'No pudimos generar un código de invitación. Intentá de nuevo.');
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
    throw new HttpError(409, 'Ya formás parte de este grupo.', { code: 'ALREADY_MEMBER' });
  }

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
  ).run(group.id, userId, 'member', now);

  const aggregate = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM memberships WHERE group_id = ?) AS member_count,
        (SELECT COUNT(DISTINCT country_code) FROM visits WHERE group_id = ?) AS country_count`,
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
    throw new HttpError(404, 'No encontramos ese grupo o no tenés acceso.', {
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

  const visitRows = db
    .prepare(
      `SELECT id, user_id, country_code, city_name, lat, lng, visited_at, created_at
       FROM visits
       WHERE group_id = ?
       ORDER BY visited_at ASC, created_at ASC`,
    )
    .all(groupId) as unknown as VisitRow[];

  const cityRows = db
    .prepare(
      `SELECT c.id, c.visit_id, c.city_name, c.lat, c.lng
       FROM visit_cities c
       JOIN visits v ON v.id = c.visit_id
       WHERE v.group_id = ?
       ORDER BY c.city_name COLLATE NOCASE ASC, c.created_at ASC`,
    )
    .all(groupId) as unknown as VisitCityRow[];

  const citiesByVisit = new Map<string, VisitCity[]>();
  for (const city of cityRows) {
    const bucket = citiesByVisit.get(city.visit_id) || [];
    bucket.push({
      id: city.id,
      name: city.city_name,
      lat: city.lat,
      lng: city.lng,
    });
    citiesByVisit.set(city.visit_id, bucket);
  }

  const visitsByUser = new Map<string, VisitRow[]>();
  for (const visit of visitRows) {
    const bucket = visitsByUser.get(visit.user_id) || [];
    bucket.push(visit);
    visitsByUser.set(visit.user_id, bucket);
  }

  const members: GroupMember[] = memberRows.map((member) => {
    const ownVisits = visitsByUser.get(member.id) || [];
    return {
      id: member.id,
      name: member.name,
      homeCountryCode: member.home_country_code,
      role: member.role,
      joinedAt: member.joined_at,
      stats: computeMemberStats(
        ownVisits.map((visit) => ({
          countryCode: visit.country_code,
          lat: visit.lat,
          lng: visit.lng,
          visitedAt: visit.visited_at,
          createdAt: visit.created_at,
        })),
        member.home_country_code,
        TOTAL_COUNTRIES,
      ),
    };
  });

  const visits: Visit[] = visitRows.map((visit) => ({
    id: visit.id,
    userId: visit.user_id,
    countryCode: visit.country_code,
    countryName: countryName(visit.country_code),
    countryFlag: countryFlag(visit.country_code),
    cityName: visit.city_name,
    lat: visit.lat,
    lng: visit.lng,
    visitedAt: visit.visited_at,
    createdAt: visit.created_at,
    cities: citiesByVisit.get(visit.id) ?? [],
  }));

  const uniqueCountries = new Set(visits.map((visit) => visit.countryCode));
  const continents = new Set<string>();
  for (const code of uniqueCountries) {
    const region = getCountry(code)?.region;
    if (region) continents.add(region);
  }
  const kilometers = members.reduce((total, member) => total + member.stats.kilometers, 0);

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

function insertVisitCity(
  db: Database,
  visitId: string,
  name: string,
  lat: number | null,
  lng: number | null,
  createdAt: string,
): VisitCity {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO visit_cities (id, visit_id, city_name, lat, lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, visitId, name, lat, lng, createdAt);
  return { id, name, lat, lng };
}

export function createVisit(
  db: Database,
  groupId: string,
  userId: string,
  input: CreateVisitInput,
): Visit {
  if (!getMembership(db, groupId, userId)) {
    throw new HttpError(404, 'No encontramos ese grupo o no tenés acceso.', {
      code: 'GROUP_NOT_FOUND',
    });
  }

  const country = getCountry(input.countryCode);
  if (!country) {
    throw new HttpError(400, 'Ese país no está en el atlas.', { code: 'INVALID_COUNTRY' });
  }

  const hasCoords = isValidCoordinates(input.lat, input.lng);
  const lat = hasCoords ? (input.lat as number) : country.lat;
  const lng = hasCoords ? (input.lng as number) : country.lng;
  const cityName = input.cityName?.trim() || null;
  const now = new Date().toISOString();
  const id = randomUUID();
  const cities: VisitCity[] = [];

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO visits
        (id, group_id, user_id, country_code, city_name, lat, lng, visited_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, groupId, userId, country.iso2, cityName, lat, lng, input.visitedAt, now);

    if (cityName) {
      cities.push(insertVisitCity(db, id, cityName, lat, lng, now));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: visits')) {
      throw new HttpError(409, 'Ya marcaste este país en el grupo.', {
        code: 'ALREADY_VISITED',
      });
    }
    throw error;
  }

  return {
    id,
    userId,
    countryCode: country.iso2,
    countryName: country.name,
    countryFlag: country.flag,
    cityName,
    lat,
    lng,
    visitedAt: input.visitedAt,
    createdAt: now,
    cities,
  };
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
    throw new HttpError(404, 'No encontramos ese grupo o no tenés acceso.', {
      code: 'GROUP_NOT_FOUND',
    });
  }

  const visit = db
    .prepare('SELECT id FROM visits WHERE id = ? AND group_id = ? AND user_id = ?')
    .get(visitId, groupId, userId) as { id: string } | undefined;
  if (!visit) {
    throw new HttpError(404, 'No encontramos esa visita en tu recorrido.', {
      code: 'VISIT_NOT_FOUND',
    });
  }

  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, 'Ingresá el nombre de la ciudad.', { code: 'INVALID_CITY' });
  }

  const count = (
    db.prepare('SELECT COUNT(*) AS count FROM visit_cities WHERE visit_id = ?').get(visitId) as {
      count: number;
    }
  ).count;
  if (count >= 20) {
    throw new HttpError(400, 'Podés guardar hasta 20 ciudades por país.', {
      code: 'CITY_LIMIT_REACHED',
    });
  }

  let lat: number | null = null;
  let lng: number | null = null;
  if (input.lat !== undefined || input.lng !== undefined) {
    if (!isValidCoordinates(input.lat, input.lng)) {
      throw new HttpError(400, 'Las coordenadas de la ciudad no son válidas.', {
        code: 'INVALID_CITY_COORDINATES',
      });
    }
    lat = input.lat as number;
    lng = input.lng as number;
  }

  try {
    return insertVisitCity(db, visitId, name, lat, lng, new Date().toISOString());
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('UNIQUE constraint failed: visit_cities')
    ) {
      throw new HttpError(409, 'Esa ciudad ya está en este país.', {
        code: 'CITY_ALREADY_ADDED',
      });
    }
    throw error;
  }
}

export function deleteVisitCity(
  db: Database,
  groupId: string,
  userId: string,
  visitId: string,
  cityId: string,
): void {
  if (!getMembership(db, groupId, userId)) {
    throw new HttpError(404, 'No encontramos ese grupo o no tenés acceso.', {
      code: 'GROUP_NOT_FOUND',
    });
  }

  const visit = db
    .prepare('SELECT id FROM visits WHERE id = ? AND group_id = ? AND user_id = ?')
    .get(visitId, groupId, userId) as { id: string } | undefined;
  if (!visit) {
    throw new HttpError(404, 'No encontramos esa visita en tu recorrido.', {
      code: 'VISIT_NOT_FOUND',
    });
  }

  const result = db
    .prepare('DELETE FROM visit_cities WHERE id = ? AND visit_id = ?')
    .run(cityId, visitId);

  if (result.changes === 0) {
    throw new HttpError(404, 'Esa ciudad ya no estaba en la lista.', {
      code: 'CITY_NOT_FOUND',
    });
  }
}

export function deleteVisit(
  db: Database,
  groupId: string,
  userId: string,
  visitId: string,
): void {
  if (!getMembership(db, groupId, userId)) {
    throw new HttpError(404, 'No encontramos ese grupo o no tenés acceso.', {
      code: 'GROUP_NOT_FOUND',
    });
  }

  const result = db
    .prepare('DELETE FROM visits WHERE id = ? AND group_id = ? AND user_id = ?')
    .run(visitId, groupId, userId);

  if (result.changes === 0) {
    throw new HttpError(404, 'Ese país ya no estaba marcado por vos.', {
      code: 'VISIT_NOT_FOUND',
    });
  }
}

