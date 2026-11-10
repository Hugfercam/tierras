import { randomUUID } from 'node:crypto';
import {
  countryFlag,
  countryName,
  getCountry,
  TOTAL_COUNTRIES,
} from '../shared/countries.ts';
import { computeMemberStats, isValidCoordinates } from '../shared/geo.ts';
import { PRIVACY_VERSION } from '../shared/legal.ts';
import type {
  MemberStats,
  PersonalOverview,
  Trip,
  TripParticipant,
  TripParticipantStatus,
  TripStop,
  Visit,
  VisitCity,
} from '../shared/types.ts';
import type { Database } from './db.ts';
import { HttpError } from './errors.ts';

interface TripRow {
  id: string;
  owner_id: string;
  title: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

interface TripCountryRow {
  id: string;
  trip_id: string;
  country_code: string;
}

interface TripStopRow {
  id: string;
  trip_id: string;
  country_code: string;
  city_name: string | null;
  lat: number | null;
  lng: number | null;
  position: number;
  start_date: string | null;
  end_date: string | null;
  note: string | null;
  created_at: string;
}

interface ParticipantRow {
  trip_id: string;
  user_id: string;
  role: 'owner' | 'member';
  status: TripParticipantStatus;
  invited_at: string | null;
  responded_at: string | null;
  consent_version: string | null;
  name: string;
  home_country_code: string;
}

interface UserRow {
  id: string;
  name: string;
  home_country_code: string;
}

export interface LoadedTrip extends Trip {
  countryIds: Record<string, string>;
}

export interface TripStopInput {
  countryCode: string;
  cityName?: string | null;
  lat?: number;
  lng?: number;
  startDate?: string | null;
  endDate?: string | null;
  note?: string | null;
}

export interface TripInput {
  title?: string | null;
  startDate: string;
  endDate: string;
  stops: TripStopInput[];
  participantIds?: string[];
}

interface NormalizedStop {
  countryCode: string;
  cityName: string | null;
  lat: number | null;
  lng: number | null;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
}

interface NormalizedTrip {
  title: string;
  startDate: string;
  endDate: string;
  stops: NormalizedStop[];
  participantIds: string[];
}

const MAX_STOPS = 50;

function normalizeTripInput(db: Database, ownerId: string, input: TripInput): NormalizedTrip {
  const startDate = input.startDate.trim();
  const endDate = (input.endDate || input.startDate).trim();
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new HttpError(400, 'Las fechas del viaje no son válidas.', {
      code: 'INVALID_TRIP_DATES',
    });
  }
  if (startDate > endDate) {
    throw new HttpError(400, 'La fecha de fin no puede ser anterior a la de inicio.', {
      code: 'INVALID_TRIP_DATES',
    });
  }

  if (!Array.isArray(input.stops) || input.stops.length === 0) {
    throw new HttpError(400, 'Añade al menos una parada al viaje.', {
      code: 'TRIP_WITHOUT_STOPS',
    });
  }
  if (input.stops.length > MAX_STOPS) {
    throw new HttpError(400, `Un viaje no puede tener más de ${MAX_STOPS} paradas.`, {
      code: 'TOO_MANY_STOPS',
    });
  }

  const stops: NormalizedStop[] = input.stops.map((stop) => {
    const country = getCountry(stop.countryCode.trim().toUpperCase());
    if (!country) {
      throw new HttpError(400, 'Una de las paradas tiene un país inválido.', {
        code: 'INVALID_COUNTRY',
      });
    }
    const cityName = stop.cityName?.trim() || null;
    if (cityName && cityName.length > 80) {
      throw new HttpError(400, 'El nombre de la ciudad es demasiado largo.', {
        code: 'INVALID_CITY',
      });
    }
    const hasLat = stop.lat !== undefined;
    const hasLng = stop.lng !== undefined;
    if (hasLat !== hasLng || (hasLat && !isValidCoordinates(stop.lat, stop.lng))) {
      throw new HttpError(400, 'Las coordenadas de la parada no son válidas.', {
        code: 'INVALID_STOP_COORDINATES',
      });
    }
    const stopStart = stop.startDate?.trim() || null;
    const stopEnd = stop.endDate?.trim() || stopStart;
    if (stopStart && !isIsoDate(stopStart)) {
      throw new HttpError(400, 'La fecha de una parada no es válida.', {
        code: 'INVALID_STOP_DATES',
      });
    }
    if (stopStart && stopEnd && stopStart > stopEnd) {
      throw new HttpError(400, 'Las fechas de una parada están invertidas.', {
        code: 'INVALID_STOP_DATES',
      });
    }
    if (stopStart && (stopStart < startDate || stopStart > endDate)) {
      throw new HttpError(400, 'Las fechas de una parada deben estar dentro del viaje.', {
        code: 'STOP_OUTSIDE_TRIP',
      });
    }
    if (stopEnd && (stopEnd < startDate || stopEnd > endDate)) {
      throw new HttpError(400, 'Las fechas de una parada deben estar dentro del viaje.', {
        code: 'STOP_OUTSIDE_TRIP',
      });
    }
    const note = stop.note?.trim() || null;
    if (note && note.length > 500) {
      throw new HttpError(400, 'La nota de una parada es demasiado larga.', {
        code: 'INVALID_STOP_NOTE',
      });
    }
    return {
      countryCode: country.iso2,
      cityName,
      lat: hasLat ? (stop.lat as number) : null,
      lng: hasLng ? (stop.lng as number) : null,
      startDate: stopStart,
      endDate: stopEnd,
      note,
    };
  });

  const requestedParticipants = [...new Set(input.participantIds ?? [])].filter(
    (id) => id !== ownerId,
  );
  for (const participantId of requestedParticipants) {
    const person = db
      .prepare('SELECT id, name, home_country_code FROM users WHERE id = ?')
      .get(participantId) as UserRow | undefined;
    if (!person) {
      throw new HttpError(400, 'Uno de los participantes no existe.', {
        code: 'INVALID_PARTICIPANT',
      });
    }
    if (!sharesGroup(db, ownerId, participantId)) {
      throw new HttpError(400, 'Solo puedes añadir a personas de tus grupos.', {
        code: 'PARTICIPANT_NOT_IN_GROUP',
      });
    }
  }

  const title = input.title?.trim() || defaultTitle(stops);
  if (title.length > 100) {
    throw new HttpError(400, 'El título del viaje es demasiado largo.', {
      code: 'INVALID_TRIP_TITLE',
    });
  }

  return {
    title,
    startDate,
    endDate,
    stops,
    participantIds: [ownerId, ...requestedParticipants],
  };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sharesGroup(db: Database, ownerId: string, participantId: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 AS found
         FROM memberships mine
         JOIN memberships other ON other.group_id = mine.group_id
         WHERE mine.user_id = ? AND other.user_id = ?
         LIMIT 1`,
      )
      .get(ownerId, participantId),
  );
}

function defaultTitle(stops: NormalizedStop[]): string {
  const countries = [...new Set(stops.map((stop) => stop.countryCode))];
  const names = countries.map((code) => countryName(code));
  if (names.length === 1) return `Viaje a ${names[0]}`;
  if (names.length === 2) return `Viaje a ${names[0]} y ${names[1]}`;
  return `Ruta por ${names.length} países`;
}

function insertTripChildren(
  db: Database,
  tripId: string,
  normalized: NormalizedTrip,
  createdAt: string,
): void {
  const seenCountries = new Set<string>();
  const insertCountry = db.prepare(
    'INSERT INTO trip_countries (id, trip_id, country_code) VALUES (?, ?, ?)',
  );
  const insertStop = db.prepare(
    `INSERT INTO trip_stops
       (id, trip_id, country_code, city_name, lat, lng, position, start_date, end_date, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const stop of normalized.stops) {
    if (!seenCountries.has(stop.countryCode)) {
      insertCountry.run(randomUUID(), tripId, stop.countryCode);
      seenCountries.add(stop.countryCode);
    }
  }

  normalized.stops.forEach((stop, position) => {
    insertStop.run(
      randomUUID(),
      tripId,
      stop.countryCode,
      stop.cityName,
      stop.lat,
      stop.lng,
      position,
      stop.startDate,
      stop.endDate,
      stop.note,
      createdAt,
    );
  });
}

function insertAcceptedOwner(
  db: Database,
  tripId: string,
  ownerId: string,
  at: string,
): void {
  db.prepare(
    `INSERT INTO trip_participants
       (trip_id, user_id, role, joined_at, status, invited_at, responded_at, consent_version)
     VALUES (?, ?, 'owner', ?, 'accepted', ?, ?, ?)`,
  ).run(tripId, ownerId, at, at, at, PRIVACY_VERSION);
}

function insertPendingParticipant(
  db: Database,
  tripId: string,
  userId: string,
  invitedAt: string,
): void {
  db.prepare(
    `INSERT INTO trip_participants
       (trip_id, user_id, role, joined_at, status, invited_at)
     VALUES (?, ?, 'member', ?, 'pending', ?)`,
  ).run(tripId, userId, invitedAt, invitedAt);
}

function syncTripParticipants(
  db: Database,
  tripId: string,
  ownerId: string,
  participantIds: string[],
  now: string,
): void {
  const existing = db
    .prepare(
      `SELECT user_id, status, invited_at, responded_at, consent_version
       FROM trip_participants WHERE trip_id = ?`,
    )
    .all(tripId) as unknown as Array<{
    user_id: string;
    status: TripParticipantStatus;
    invited_at: string | null;
    responded_at: string | null;
    consent_version: string | null;
  }>;
  const previous = new Map(existing.map((row) => [row.user_id, row]));

  db.prepare('DELETE FROM trip_participants WHERE trip_id = ?').run(tripId);
  insertAcceptedOwner(db, tripId, ownerId, previous.get(ownerId)?.invited_at ?? now);

  for (const participantId of participantIds) {
    if (participantId === ownerId) continue;
    const prior = previous.get(participantId);
    if (prior?.status === 'accepted') {
      db.prepare(
        `INSERT INTO trip_participants
           (trip_id, user_id, role, joined_at, status, invited_at, responded_at, consent_version)
         VALUES (?, ?, 'member', ?, 'accepted', ?, ?, ?)`,
      ).run(
        tripId,
        participantId,
        prior.invited_at ?? now,
        prior.invited_at ?? now,
        prior.responded_at ?? now,
        prior.consent_version ?? PRIVACY_VERSION,
      );
    } else {
      insertPendingParticipant(db, tripId, participantId, now);
    }
  }
}

export function loadTripsForUsers(
  db: Database,
  userIds: string[],
  viewerId: string,
  status: 'accepted' | 'pending' = 'accepted',
): LoadedTrip[] {
  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length === 0) return [];
  const placeholders = uniqueUserIds.map(() => '?').join(', ');
  const tripRows = db
    .prepare(
      `SELECT DISTINCT t.id, t.owner_id, t.title, t.start_date, t.end_date, t.created_at
       FROM trips t
       JOIN trip_participants tp ON tp.trip_id = t.id
       WHERE tp.user_id IN (${placeholders}) AND tp.status = ?
       ORDER BY t.start_date DESC, t.created_at DESC`,
    )
    .all(...uniqueUserIds, status) as unknown as TripRow[];
  if (tripRows.length === 0) return [];

  const tripIds = tripRows.map((trip) => trip.id);
  const tripPlaceholders = tripIds.map(() => '?').join(', ');
  const countryRows = db
    .prepare(
      `SELECT id, trip_id, country_code
       FROM trip_countries
       WHERE trip_id IN (${tripPlaceholders})
       ORDER BY country_code ASC`,
    )
    .all(...tripIds) as unknown as TripCountryRow[];
  const stopRows = db
    .prepare(
      `SELECT id, trip_id, country_code, city_name, lat, lng, position, start_date, end_date, note, created_at
       FROM trip_stops
       WHERE trip_id IN (${tripPlaceholders})
       ORDER BY position ASC, created_at ASC`,
    )
    .all(...tripIds) as unknown as TripStopRow[];
  const participantRows = db
    .prepare(
      `SELECT tp.trip_id, tp.user_id, tp.role, tp.status, tp.invited_at, tp.responded_at,
              tp.consent_version, u.name, u.home_country_code
       FROM trip_participants tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.trip_id IN (${tripPlaceholders})
       ORDER BY CASE tp.role WHEN 'owner' THEN 0 ELSE 1 END, u.name ASC`,
    )
    .all(...tripIds) as unknown as ParticipantRow[];

  const countriesByTrip = new Map<string, TripCountryRow[]>();
  for (const country of countryRows) {
    const bucket = countriesByTrip.get(country.trip_id) ?? [];
    bucket.push(country);
    countriesByTrip.set(country.trip_id, bucket);
  }
  const stopsByTrip = new Map<string, TripStopRow[]>();
  for (const stop of stopRows) {
    const bucket = stopsByTrip.get(stop.trip_id) ?? [];
    bucket.push(stop);
    stopsByTrip.set(stop.trip_id, bucket);
  }
  const participantsByTrip = new Map<string, ParticipantRow[]>();
  for (const participant of participantRows) {
    const bucket = participantsByTrip.get(participant.trip_id) ?? [];
    bucket.push(participant);
    participantsByTrip.set(participant.trip_id, bucket);
  }

  return tripRows.map((trip) => {
    const countries = countriesByTrip.get(trip.id) ?? [];
    const countryIds = Object.fromEntries(
      countries.map((country) => [country.country_code, country.id]),
    );
    const participants: TripParticipant[] = (participantsByTrip.get(trip.id) ?? []).map(
      (participant) => ({
        id: participant.user_id,
        name: participant.name,
        homeCountryCode: participant.home_country_code,
        role: participant.role,
        status: participant.status,
        invitedAt: participant.invited_at ?? undefined,
        respondedAt: participant.responded_at ?? undefined,
        consentVersion: participant.consent_version ?? undefined,
      }),
    );
    const stops: TripStop[] = (stopsByTrip.get(trip.id) ?? []).map((stop) => ({
      id: stop.id,
      countryCode: stop.country_code,
      countryName: countryName(stop.country_code),
      countryFlag: countryFlag(stop.country_code),
      cityName: stop.city_name,
      lat: stop.lat,
      lng: stop.lng,
      position: stop.position,
      startDate: stop.start_date,
      endDate: stop.end_date,
      note: stop.note,
    }));
    return {
      id: trip.id,
      ownerId: trip.owner_id,
      title: trip.title,
      startDate: trip.start_date,
      endDate: trip.end_date,
      createdAt: trip.created_at,
      countries: countries.map((country) => country.country_code),
      countryIds,
      stops,
      participants,
      isOwner: trip.owner_id === viewerId,
    };
  });
}

export function listTripsForUser(db: Database, userId: string): Trip[] {
  return loadTripsForUsers(db, [userId], userId);
}

export function listPendingInvitations(db: Database, userId: string): Trip[] {
  return loadTripsForUsers(db, [userId], userId, 'pending');
}

export function createTrip(db: Database, ownerId: string, input: TripInput): Trip {
  const normalized = normalizeTripInput(db, ownerId, input);
  const now = new Date().toISOString();
  const id = randomUUID();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO trips (id, owner_id, title, start_date, end_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, ownerId, normalized.title, normalized.startDate, normalized.endDate, now);
    insertTripChildren(db, id, normalized, now);
    insertAcceptedOwner(db, id, ownerId, now);
    normalized.participantIds.forEach((participantId) => {
      if (participantId === ownerId) return;
      insertPendingParticipant(db, id, participantId, now);
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return loadTripsForUsers(db, [ownerId], ownerId).find((trip) => trip.id === id)!;
}

export function updateTrip(
  db: Database,
  ownerId: string,
  tripId: string,
  input: TripInput,
): Trip {
  const trip = db
    .prepare('SELECT id FROM trips WHERE id = ? AND owner_id = ?')
    .get(tripId, ownerId) as { id: string } | undefined;
  if (!trip) {
    throw new HttpError(404, 'No encontramos ese viaje o no puedes editarlo.', {
      code: 'TRIP_NOT_FOUND',
    });
  }
  const normalized = normalizeTripInput(db, ownerId, input);

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE trips SET title = ?, start_date = ?, end_date = ? WHERE id = ?`,
    ).run(normalized.title, normalized.startDate, normalized.endDate, tripId);
    db.prepare('DELETE FROM trip_stops WHERE trip_id = ?').run(tripId);
    db.prepare('DELETE FROM trip_countries WHERE trip_id = ?').run(tripId);
    const now = new Date().toISOString();
    insertTripChildren(db, tripId, normalized, now);
    syncTripParticipants(db, tripId, ownerId, normalized.participantIds, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return loadTripsForUsers(db, [ownerId], ownerId).find((item) => item.id === tripId)!;
}

export function acceptTripInvitation(
  db: Database,
  userId: string,
  tripId: string,
): Trip {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE trip_participants
       SET status = 'accepted', responded_at = ?, consent_version = ?
       WHERE trip_id = ? AND user_id = ? AND role = 'member' AND status = 'pending'`,
    )
    .run(now, PRIVACY_VERSION, tripId, userId);
  if (result.changes === 0) {
    throw new HttpError(404, 'No encontramos esa invitación pendiente.', {
      code: 'INVITATION_NOT_FOUND',
    });
  }
  return loadTripsForUsers(db, [userId], userId).find((trip) => trip.id === tripId)!;
}

export function rejectTripInvitation(db: Database, userId: string, tripId: string): void {
  const result = db
    .prepare(
      `UPDATE trip_participants
       SET status = 'rejected', responded_at = ?
       WHERE trip_id = ? AND user_id = ? AND role = 'member' AND status = 'pending'`,
    )
    .run(new Date().toISOString(), tripId, userId);
  if (result.changes === 0) {
    throw new HttpError(404, 'No encontramos esa invitación pendiente.', {
      code: 'INVITATION_NOT_FOUND',
    });
  }
}

export function leaveTrip(db: Database, userId: string, tripId: string): void {
  const result = db
    .prepare(
      `DELETE FROM trip_participants
       WHERE trip_id = ? AND user_id = ? AND role = 'member' AND status = 'accepted'`,
    )
    .run(tripId, userId);
  if (result.changes === 0) {
    throw new HttpError(404, 'No participas en ese viaje.', { code: 'PARTICIPATION_NOT_FOUND' });
  }
}

export function deleteTrip(db: Database, ownerId: string, tripId: string): void {
  const result = db.prepare('DELETE FROM trips WHERE id = ? AND owner_id = ?').run(tripId, ownerId);
  if (result.changes === 0) {
    throw new HttpError(404, 'No encontramos ese viaje o no puedes borrarlo.', {
      code: 'TRIP_NOT_FOUND',
    });
  }
}

export function countTripsForUser(db: Database, userId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM trip_participants WHERE user_id = ? AND status = 'accepted'",
    )
    .get(userId) as { count: number };
  return row.count;
}

interface CountryMark {
  countryCode: string;
  lat: number;
  lng: number;
  visitedAt: string;
  createdAt: string;
}

export function countryMarksForTrips(trips: LoadedTrip[]): CountryMark[] {
  const marks = new Map<string, CountryMark>();
  for (const trip of trips) {
    for (const code of trip.countries) {
      const country = getCountry(code);
      const stop = trip.stops.find(
        (item) =>
          item.countryCode === code &&
          item.lat !== null &&
          item.lng !== null,
      );
      const point = stop
        ? { lat: stop.lat as number, lng: stop.lng as number }
        : { lat: country?.lat ?? 0, lng: country?.lng ?? 0 };
      const existing = marks.get(code);
      if (!existing || trip.startDate < existing.visitedAt) {
        marks.set(code, {
          countryCode: code,
          lat: point.lat,
          lng: point.lng,
          visitedAt: trip.startDate,
          createdAt: trip.createdAt,
        });
      }
    }
  }
  return [...marks.values()];
}

export function statsForTrips(
  trips: LoadedTrip[],
  homeCountryCode: string,
): MemberStats {
  return {
    ...computeMemberStats(countryMarksForTrips(trips), homeCountryCode, TOTAL_COUNTRIES),
    trips: trips.length,
  };
}

function citiesForCountry(trip: LoadedTrip, countryCode: string): VisitCity[] {
  const seen = new Set<string>();
  const cities: VisitCity[] = [];
  for (const stop of trip.stops) {
    if (stop.countryCode !== countryCode || !stop.cityName) continue;
    const key = stop.cityName.toLocaleLowerCase('es');
    if (seen.has(key)) continue;
    seen.add(key);
    cities.push({ id: stop.id, name: stop.cityName, lat: stop.lat, lng: stop.lng });
  }
  return cities.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function visitBase(
  trip: LoadedTrip,
  countryCode: string,
  userId: string,
  viewerId: string,
): Omit<Visit, 'id'> {
  const country = getCountry(countryCode);
  const cities = citiesForCountry(trip, countryCode);
  const stop = trip.stops.find(
    (item) => item.countryCode === countryCode && item.lat !== null && item.lng !== null,
  );
  const primary = cities[0] ?? null;
  const tripCountryId = trip.countryIds[countryCode];
  return {
    tripCountryId,
    tripId: trip.id,
    tripTitle: trip.title,
    userId,
    countryCode,
    countryName: countryName(countryCode),
    countryFlag: countryFlag(countryCode),
    cityName: primary?.name ?? null,
    lat: stop?.lat ?? primary?.lat ?? country?.lat ?? 0,
    lng: stop?.lng ?? primary?.lng ?? country?.lng ?? 0,
    visitedAt: trip.startDate,
    createdAt: trip.createdAt,
    cities,
    startDate: trip.startDate,
    endDate: trip.endDate,
    participants: trip.participants,
    canEdit: trip.ownerId === viewerId,
  };
}

export function groupVisitsForMember(
  trips: LoadedTrip[],
  memberId: string,
  viewerId: string,
): Visit[] {
  const visits: Visit[] = [];
  for (const trip of trips) {
    if (
      !trip.participants.some(
        (participant) => participant.id === memberId && participant.status === 'accepted',
      )
    ) {
      continue;
    }
    for (const code of trip.countries) {
      const countryId = trip.countryIds[code];
      visits.push({
        ...visitBase(trip, code, memberId, viewerId),
        id: `${countryId}:${memberId}`,
      });
    }
  }
  return visits;
}

export function getPersonalOverview(db: Database, userId: string): PersonalOverview {
  const user = db
    .prepare('SELECT id, name, home_country_code FROM users WHERE id = ?')
    .get(userId) as UserRow | undefined;
  if (!user) {
    throw new HttpError(404, 'No encontramos tu cuenta.', { code: 'USER_NOT_FOUND' });
  }

  const trips = loadTripsForUsers(db, [userId], userId);
  const pendingInvitations = listPendingInvitations(db, userId);
  const countryBuckets = new Map<
    string,
    {
      earliest: string;
      latest: string;
      createdAt: string;
      tripIds: Set<string>;
      cities: Map<string, VisitCity>;
      lat: number;
      lng: number;
      tripCountryId?: string;
    }
  >();

  for (const trip of trips) {
    for (const code of trip.countries) {
      const country = getCountry(code);
      const stop = trip.stops.find(
        (item) => item.countryCode === code && item.lat !== null && item.lng !== null,
      );
      const coords = stop
        ? { lat: stop.lat as number, lng: stop.lng as number }
        : { lat: country?.lat ?? 0, lng: country?.lng ?? 0 };
      const bucket = countryBuckets.get(code);
      if (!bucket) {
        countryBuckets.set(code, {
          earliest: trip.startDate,
          latest: trip.startDate,
          createdAt: trip.createdAt,
          tripIds: new Set([trip.id]),
          cities: new Map(
            citiesForCountry(trip, code).map((city) => [
              city.name.toLocaleLowerCase('es'),
              city,
            ]),
          ),
          lat: coords.lat,
          lng: coords.lng,
          tripCountryId: trip.countryIds[code],
        });
        continue;
      }
      if (
        trip.startDate < bucket.earliest ||
        (trip.startDate === bucket.earliest && trip.createdAt < bucket.createdAt)
      ) {
        bucket.earliest = trip.startDate;
        bucket.createdAt = trip.createdAt;
        bucket.lat = coords.lat;
        bucket.lng = coords.lng;
      }
      if (trip.startDate > bucket.latest) {
        bucket.latest = trip.startDate;
        bucket.tripCountryId = trip.countryIds[code];
      }
      bucket.tripIds.add(trip.id);
      for (const city of citiesForCountry(trip, code)) {
        const key = city.name.toLocaleLowerCase('es');
        if (!bucket.cities.has(key)) bucket.cities.set(key, city);
      }
    }
  }

  const visits: Visit[] = [...countryBuckets.entries()]
    .map(([code, bucket]) => {
      const cities = [...bucket.cities.values()];
      const primary = cities[0] ?? null;
      return {
        id: `personal:${code}`,
        tripCountryId: bucket.tripCountryId,
        userId,
        countryCode: code,
        countryName: countryName(code),
        countryFlag: countryFlag(code),
        cityName: primary?.name ?? null,
        lat: bucket.lat,
        lng: bucket.lng,
        visitedAt: bucket.latest,
        createdAt: bucket.createdAt,
        cities,
        tripCount: bucket.tripIds.size,
      };
    })
    .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));

  const marks: CountryMark[] = [...countryBuckets.entries()].map(([code, bucket]) => ({
    countryCode: code,
    lat: bucket.lat,
    lng: bucket.lng,
    visitedAt: bucket.earliest,
    createdAt: bucket.createdAt,
  }));

  const uniqueCities = new Set<string>();
  let days = 0;
  for (const trip of trips) {
    const start = new Date(`${trip.startDate}T00:00:00.000Z`).getTime();
    const end = new Date(`${trip.endDate}T00:00:00.000Z`).getTime();
    if (Number.isFinite(start) && Number.isFinite(end)) {
      days += Math.max(1, Math.round((end - start) / 86_400_000) + 1);
    }
    for (const stop of trip.stops) {
      if (!stop.cityName) continue;
      uniqueCities.add(`${stop.countryCode}:${stop.cityName.toLocaleLowerCase('es')}`);
    }
  }

  const stats = {
    ...computeMemberStats(marks, user.home_country_code, TOTAL_COUNTRIES),
    trips: trips.length,
    days,
    cities: uniqueCities.size,
  };

  return {
    user: { id: user.id, name: user.name, homeCountryCode: user.home_country_code },
    stats,
    trips,
    pendingInvitations,
    visits,
  };
}

export function addStopToTripCountry(
  db: Database,
  userId: string,
  rawTripCountryId: string,
  input: { name: string; lat?: number; lng?: number },
): VisitCity {
  const target = resolveTripCountry(db, rawTripCountryId);
  const trip = db
    .prepare('SELECT id, owner_id, start_date, end_date FROM trips WHERE id = ?')
    .get(target.tripId) as
    | { id: string; owner_id: string; start_date: string; end_date: string }
    | undefined;
  if (!trip || trip.owner_id !== userId) {
    throw new HttpError(404, 'No encontramos ese viaje o no puedes editarlo.', {
      code: 'TRIP_NOT_FOUND',
    });
  }
  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, 'Introduce el nombre de la ciudad.', { code: 'INVALID_CITY' });
  }
  const duplicate = db
    .prepare(
      `SELECT 1 AS found FROM trip_stops
       WHERE trip_id = ? AND country_code = ? AND city_name = ? COLLATE NOCASE`,
    )
    .get(trip.id, target.countryCode, name);
  if (duplicate) {
    throw new HttpError(409, 'Esa ciudad ya está en este viaje.', {
      code: 'CITY_ALREADY_ADDED',
    });
  }
  const max = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS position FROM trip_stops WHERE trip_id = ?')
    .get(trip.id) as { position: number };
  const id = randomUUID();
  db.prepare(
    `INSERT INTO trip_stops
       (id, trip_id, country_code, city_name, lat, lng, position, start_date, end_date, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    id,
    trip.id,
    target.countryCode,
    name,
    input.lat ?? null,
    input.lng ?? null,
    max.position + 1,
    trip.start_date,
    trip.end_date,
    new Date().toISOString(),
  );
  return { id, name, lat: input.lat ?? null, lng: input.lng ?? null };
}

export function removeStopFromTrip(
  db: Database,
  userId: string,
  rawTripCountryId: string,
  stopId: string,
): void {
  const target = resolveTripCountry(db, rawTripCountryId);
  const trip = db
    .prepare('SELECT owner_id FROM trips WHERE id = ?')
    .get(target.tripId) as { owner_id: string } | undefined;
  if (!trip || trip.owner_id !== userId) {
    throw new HttpError(404, 'No encontramos ese viaje o no puedes editarlo.', {
      code: 'TRIP_NOT_FOUND',
    });
  }
  const result = db
    .prepare('DELETE FROM trip_stops WHERE id = ? AND trip_id = ?')
    .run(stopId, target.tripId);
  if (result.changes === 0) {
    throw new HttpError(404, 'Esa parada ya no estaba en el viaje.', {
      code: 'STOP_NOT_FOUND',
    });
  }
}

export function removeCountryFromTrip(
  db: Database,
  userId: string,
  rawTripCountryId: string,
): void {
  const target = resolveTripCountry(db, rawTripCountryId);
  const trip = db
    .prepare('SELECT id, owner_id FROM trips WHERE id = ?')
    .get(target.tripId) as { id: string; owner_id: string } | undefined;
  if (!trip || trip.owner_id !== userId) {
    throw new HttpError(404, 'No encontramos ese viaje o no puedes editarlo.', {
      code: 'TRIP_NOT_FOUND',
    });
  }

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM trip_stops WHERE trip_id = ? AND country_code = ?').run(
      trip.id,
      target.countryCode,
    );
    db.prepare('DELETE FROM trip_countries WHERE id = ?').run(target.id);
    const remaining = db
      .prepare('SELECT COUNT(*) AS count FROM trip_countries WHERE trip_id = ?')
      .get(trip.id) as { count: number };
    if (remaining.count === 0) {
      db.prepare('DELETE FROM trips WHERE id = ?').run(trip.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function resolveTripCountry(
  db: Database,
  rawId: string,
): { id: string; tripId: string; countryCode: string } {
  const direct = db
    .prepare('SELECT id, trip_id, country_code FROM trip_countries WHERE id = ?')
    .get(rawId) as { id: string; trip_id: string; country_code: string } | undefined;
  if (direct) {
    return {
      id: direct.id,
      tripId: direct.trip_id,
      countryCode: direct.country_code,
    };
  }
  const [countryId] = rawId.split(':');
  const parsed = db
    .prepare('SELECT id, trip_id, country_code FROM trip_countries WHERE id = ?')
    .get(countryId) as { id: string; trip_id: string; country_code: string } | undefined;
  if (!parsed) {
    throw new HttpError(404, 'No encontramos esa visita en tu recorrido.', {
      code: 'VISIT_NOT_FOUND',
    });
  }
  return {
    id: parsed.id,
    tripId: parsed.trip_id,
    countryCode: parsed.country_code,
  };
}

export function visitForTripCountry(
  db: Database,
  tripId: string,
  countryCode: string,
  userId: string,
  viewerId: string,
): Visit {
  const trip = loadTripsForUsers(db, [userId], viewerId).find((item) => item.id === tripId);
  if (!trip) {
    throw new HttpError(404, 'No encontramos ese viaje.', { code: 'TRIP_NOT_FOUND' });
  }
  const countryId = trip.countryIds[countryCode];
  return {
    ...visitBase(trip, countryCode, userId, viewerId),
    id: `${countryId}:${userId}`,
  };
}
