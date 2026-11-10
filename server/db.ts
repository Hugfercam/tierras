import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { countryName } from '../shared/countries.ts';
import { hashPasswordSync } from './auth.ts';
import { seedDemo } from './seed.ts';

export type Database = DatabaseSync;

export interface DatabaseOptions {
  file: string;
  seedDemo?: boolean;
}

export function openDatabase({ file, seedDemo: shouldSeed = false }: DatabaseOptions): Database {
  if (file !== ':memory:') {
    mkdirSync(dirname(resolve(file)), { recursive: true });
  }

  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db);

  if (shouldSeed && isEmpty(db)) {
    seedDemo(db, hashPasswordSync);
  }

  return db;
}

function isEmpty(db: Database): boolean {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  return row.count === 0;
}

interface MigrationContext {
  hadVisitCitiesTable: boolean;
}

interface Migration {
  version: number;
  name: string;
  up: (db: Database, context: MigrationContext) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'backfill-legacy-visit-cities',
    up(db, { hadVisitCitiesTable }) {
      // Si `visit_cities` ya existía, esta base pasó por el código anterior.
      // Aquel código ya intentó el backfill en cada arranque, así que no lo
      // repetimos: de lo contrario resucitaríamos ciudades borradas a mano.
      // Solo las bases anteriores al modelo de ciudades necesitan la conversión.
      if (!hadVisitCitiesTable) backfillLegacyVisitCities(db);
    },
  },
  {
    version: 2,
    name: 'trips-from-country-visits',
    up(db) {
      backfillTripsFromVisits(db);
    },
  },
  {
    version: 3,
    name: 'privacy-consents',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_consents (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('privacy', 'terms', 'age')),
          version TEXT NOT NULL,
          accepted_at TEXT NOT NULL,
          UNIQUE (user_id, kind, version)
        );
        CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents(user_id);
      `);
    },
  },
];

function migrate(db: Database): void {
  const hadVisitCitiesTable = tableExists(db, 'visit_cities');
  ensureBaseSchema(db);
  runMigrations(db, { hadVisitCitiesTable });
}

function ensureBaseSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      home_country_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invite_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memberships (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      joined_at TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      country_code TEXT NOT NULL,
      city_name TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      visited_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (group_id, user_id, country_code)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visit_cities (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      city_name TEXT NOT NULL COLLATE NOCASE,
      lat REAL,
      lng REAL,
      created_at TEXT NOT NULL,
      UNIQUE (visit_id, city_name)
    );

    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trip_countries (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      country_code TEXT NOT NULL,
      UNIQUE (trip_id, country_code)
    );

    CREATE TABLE IF NOT EXISTS trip_stops (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      country_code TEXT NOT NULL,
      city_name TEXT,
      lat REAL,
      lng REAL,
      position INTEGER NOT NULL,
      start_date TEXT,
      end_date TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trip_participants (
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      joined_at TEXT NOT NULL,
      PRIMARY KEY (trip_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
    CREATE INDEX IF NOT EXISTS idx_visits_group ON visits(group_id);
    CREATE INDEX IF NOT EXISTS idx_visits_user_group ON visits(user_id, group_id);
    CREATE INDEX IF NOT EXISTS idx_visit_cities_visit ON visit_cities(visit_id);
    CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips(owner_id);
    CREATE INDEX IF NOT EXISTS idx_trip_countries_trip ON trip_countries(trip_id);
    CREATE INDEX IF NOT EXISTS idx_trip_stops_trip ON trip_stops(trip_id, position);
    CREATE INDEX IF NOT EXISTS idx_trip_participants_user ON trip_participants(user_id, trip_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
}

function tableExists(db: Database, name: string): boolean {
  return Boolean(
    db
      .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name),
  );
}

function schemaVersion(db: Database): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

function runMigrations(db: Database, context: MigrationContext): void {
  const current = schemaVersion(db);
  const latest = migrations[migrations.length - 1]?.version ?? 0;
  if (current > latest) {
    throw new Error(
      `La base de datos usa la versión de esquema ${current}, más nueva que la soportada (${latest}).`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= current) continue;

    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db, context);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/**
 * Las versiones anteriores guardaban una sola ciudad en visits.city_name.
 * La convertimos en la primera fila de visit_cities sin borrar ni modificar
 * la columna original, que sigue formando parte de la compatibilidad de la API.
 *
 * Solo se llama desde la migración versión 1 cuando la tabla visit_cities
 * todavía no existía. La transacción la abre el runner de migraciones.
 */
function backfillLegacyVisitCities(db: Database): void {
  const pending = db
    .prepare(
      `SELECT v.id, TRIM(v.city_name) AS city_name, v.lat, v.lng, v.created_at
       FROM visits v
       WHERE v.city_name IS NOT NULL
         AND TRIM(v.city_name) <> ''
         AND NOT EXISTS (SELECT 1 FROM visit_cities c WHERE c.visit_id = v.id)`,
    )
    .all() as unknown as Array<{
    id: string;
    city_name: string;
    lat: number;
    lng: number;
    created_at: string;
  }>;

  if (pending.length === 0) return;

  const insert = db.prepare(
    `INSERT INTO visit_cities (id, visit_id, city_name, lat, lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (const visit of pending) {
    insert.run(
      randomUUID(),
      visit.id,
      visit.city_name,
      Number.isFinite(visit.lat) ? visit.lat : null,
      Number.isFinite(visit.lng) ? visit.lng : null,
      visit.created_at,
    );
  }
}

interface LegacyVisitRow {
  id: string;
  user_id: string;
  country_code: string;
  visited_at: string;
  created_at: string;
}

interface LegacyCityRow {
  id: string;
  visit_id: string;
  city_name: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

/**
 * Convierte el modelo antiguo de marcas de país en viajes personales.
 * Las marcas duplicadas de la misma persona, país y fecha (por ejemplo, la
 * misma visita registrada en dos grupos) se colapsan en un único viaje.
 */
function backfillTripsFromVisits(db: Database): void {
  const visitRows = db
    .prepare(
      `SELECT id, user_id, country_code, visited_at, created_at
       FROM visits
       ORDER BY user_id ASC, country_code ASC, visited_at ASC, created_at ASC`,
    )
    .all() as unknown as LegacyVisitRow[];
  if (visitRows.length === 0) return;

  const cityRows = db
    .prepare(
      `SELECT id, visit_id, city_name, lat, lng, created_at
       FROM visit_cities
       ORDER BY created_at ASC, city_name COLLATE NOCASE ASC`,
    )
    .all() as unknown as LegacyCityRow[];
  const citiesByVisit = new Map<string, LegacyCityRow[]>();
  for (const city of cityRows) {
    const bucket = citiesByVisit.get(city.visit_id) ?? [];
    bucket.push(city);
    citiesByVisit.set(city.visit_id, bucket);
  }

  interface TripBucket {
    ownerId: string;
    countryCode: string;
    date: string;
    createdAt: string;
    visits: LegacyVisitRow[];
  }
  const buckets = new Map<string, TripBucket>();
  for (const visit of visitRows) {
    const key = `${visit.user_id}|${visit.country_code}|${visit.visited_at}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.visits.push(visit);
      if (visit.created_at < existing.createdAt) existing.createdAt = visit.created_at;
    } else {
      buckets.set(key, {
        ownerId: visit.user_id,
        countryCode: visit.country_code.toUpperCase(),
        date: visit.visited_at,
        createdAt: visit.created_at,
        visits: [visit],
      });
    }
  }

  const insertTrip = db.prepare(
    `INSERT INTO trips (id, owner_id, title, start_date, end_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertCountry = db.prepare(
    `INSERT INTO trip_countries (id, trip_id, country_code) VALUES (?, ?, ?)`,
  );
  const insertStop = db.prepare(
    `INSERT INTO trip_stops
       (id, trip_id, country_code, city_name, lat, lng, position, start_date, end_date, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  );
  const insertParticipant = db.prepare(
    `INSERT INTO trip_participants (trip_id, user_id, role, joined_at)
     VALUES (?, ?, 'owner', ?)`,
  );

  for (const bucket of buckets.values()) {
    const tripId = bucket.visits[0].id;
    insertTrip.run(
      tripId,
      bucket.ownerId,
      `Viaje a ${countryName(bucket.countryCode)}`,
      bucket.date,
      bucket.date,
      bucket.createdAt,
    );
    insertCountry.run(randomUUID(), tripId, bucket.countryCode);
    insertParticipant.run(tripId, bucket.ownerId, bucket.createdAt);

    const stops = new Map<
      string,
      { id: string; cityName: string; lat: number | null; lng: number | null; createdAt: string }
    >();
    for (const visit of bucket.visits) {
      const cities = citiesByVisit.get(visit.id) ?? [];
      for (const city of cities) {
        const cityName = city.city_name.trim();
        if (!cityName) continue;
        const key = cityName.toLocaleLowerCase('es');
        const existing = stops.get(key);
        if (existing) {
          if (existing.lat === null && city.lat !== null) existing.lat = city.lat;
          if (existing.lng === null && city.lng !== null) existing.lng = city.lng;
        } else {
          stops.set(key, {
            id: city.id,
            cityName,
            lat: city.lat,
            lng: city.lng,
            createdAt: city.created_at,
          });
        }
      }
    }

    let position = 0;
    for (const stop of stops.values()) {
      insertStop.run(
        stop.id,
        tripId,
        bucket.countryCode,
        stop.cityName,
        stop.lat,
        stop.lng,
        position,
        bucket.date,
        bucket.date,
        stop.createdAt,
      );
      position += 1;
    }
  }
}
