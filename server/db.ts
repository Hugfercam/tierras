import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
    CREATE INDEX IF NOT EXISTS idx_visits_group ON visits(group_id);
    CREATE INDEX IF NOT EXISTS idx_visits_user_group ON visits(user_id, group_id);
    CREATE INDEX IF NOT EXISTS idx_visit_cities_visit ON visit_cities(visit_id);
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
