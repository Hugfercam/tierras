import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { Server } from 'node:http';
import { createApp } from '../server/app.ts';
import { openDatabase, type Database } from '../server/db.ts';
import type { GroupOverview, GroupSummary, Visit, VisitCity } from '../shared/types.ts';

let server: Server;
let db: Database;
let baseUrl = '';

before(async () => {
  const bundle = createApp({
    dbFile: ':memory:',
    seedDemo: false,
    demoMode: false,
    serveStatic: false,
  });
  db = bundle.db;
  await new Promise<void>((resolveListen) => {
    server = bundle.app.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de prueba sin puerto');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  db.close();
});

function cookieFrom(response: Response): string {
  const value = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  assert.ok(value, 'La respuesta debería establecer una cookie');
  return value.split(';')[0];
}

async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<{ response: Response; data: T }> {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = (await response.json().catch(() => null)) as T;
  return { response, data };
}

function schemaVersion(database: Database): number {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

function createLegacyDatabase(file: string, options: { withCitiesTable?: boolean } = {}): void {
  const raw = new DatabaseSync(file);
  raw.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      home_country_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE memberships (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );
    CREATE TABLE visits (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      city_name TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      visited_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (group_id, user_id, country_code)
    );
    INSERT INTO users VALUES
      ('u', 'Usuario legado', 'u@example.test', 'hash', 'ES', '2024-01-01T00:00:00Z');
    INSERT INTO groups VALUES
      ('g', 'Grupo legado', 'u', 'LEGACY01', '2024-01-01T00:00:00Z');
    INSERT INTO memberships VALUES
      ('g', 'u', 'owner', '2024-01-01T00:00:00Z');
  `);
  if (options.withCitiesTable) {
    raw.exec(`
      CREATE TABLE visit_cities (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL,
        city_name TEXT NOT NULL COLLATE NOCASE,
        lat REAL,
        lng REAL,
        created_at TEXT NOT NULL,
        UNIQUE (visit_id, city_name)
      );
    `);
  }
  raw
    .prepare(
      `INSERT INTO visits
         (id, group_id, user_id, country_code, city_name, lat, lng, visited_at, created_at)
       VALUES
         ('legacy-visit', 'g', 'u', 'BE', 'Bruselas', 50.85, 4.35, '2024-01-01', '2024-01-02T00:00:00Z')`,
    )
    .run();
  raw.close();
}

async function removeDatabase(file: string): Promise<void> {
  await Promise.all([
    rm(file, { force: true }),
    rm(`${file}-shm`, { force: true }),
    rm(`${file}-wal`, { force: true }),
  ]);
}

test('las ciudades se agregan, se listan y no alteran los km', async () => {
  const luciaRegistration = await api<{ user: { id: string } }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Lucía Ciudades',
      email: 'lucia.ciudades@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
    },
  });
  assert.equal(luciaRegistration.response.status, 201);
  const luciaCookie = cookieFrom(luciaRegistration.response);

  const mateoRegistration = await api<{ user: { id: string } }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Mateo Ciudades',
      email: 'mateo.ciudades@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
    },
  });
  const mateoCookie = cookieFrom(mateoRegistration.response);

  const groupResponse = await api<{ group: GroupSummary }>('/groups', {
    method: 'POST',
    cookie: luciaCookie,
    body: { name: 'Bélgica en grupo' },
  });
  const group = groupResponse.data.group;

  const joinResponse = await api('/groups/join', {
    method: 'POST',
    cookie: mateoCookie,
    body: { inviteCode: group.inviteCode },
  });
  assert.equal(joinResponse.response.status, 200);

  const createdVisit = await api<{ visit: Visit }>(`/groups/${group.id}/visits`, {
    method: 'POST',
    cookie: luciaCookie,
    body: {
      countryCode: 'BE',
      cityName: 'Bruselas',
      lat: 50.8503,
      lng: 4.3517,
      visitedAt: '2025-05-03',
    },
  });
  assert.equal(createdVisit.response.status, 201);
  assert.equal(createdVisit.data.visit.cities.length, 1);
  assert.equal(createdVisit.data.visit.cities[0].name, 'Bruselas');

  const beforeOverview = await api<GroupOverview>(`/groups/${group.id}`, {
    cookie: luciaCookie,
  });
  const kilometersBefore = beforeOverview.data.members.find(
    (member) => member.name === 'Lucía Ciudades',
  )!.stats.kilometers;

  const gante = await api<{ city: VisitCity }>(
    `/groups/${group.id}/visits/${createdVisit.data.visit.id}/cities`,
    {
      method: 'POST',
      cookie: luciaCookie,
      body: { name: 'Gante', lat: 51.0543, lng: 3.7174 },
    },
  );
  assert.equal(gante.response.status, 201);

  const brujas = await api<{ city: VisitCity }>(
    `/groups/${group.id}/visits/${createdVisit.data.visit.id}/cities`,
    {
      method: 'POST',
      cookie: luciaCookie,
      body: { name: 'Brujas' },
    },
  );
  assert.equal(brujas.response.status, 201);
  assert.equal(brujas.data.city.lat, null);

  const duplicate = await api<{ code: string }>(
    `/groups/${group.id}/visits/${createdVisit.data.visit.id}/cities`,
    {
      method: 'POST',
      cookie: luciaCookie,
      body: { name: 'GANTE' },
    },
  );
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.data.code, 'CITY_ALREADY_ADDED');

  const afterOverview = await api<GroupOverview>(`/groups/${group.id}`, {
    cookie: luciaCookie,
  });
  const luciaVisit = afterOverview.data.visits.find(
    (visit) => visit.id === createdVisit.data.visit.id,
  );
  assert.ok(luciaVisit);
  assert.deepEqual(
    luciaVisit.cities.map((city) => city.name),
    ['Brujas', 'Bruselas', 'Gante'],
  );
  assert.equal(
    afterOverview.data.members.find((member) => member.name === 'Lucía Ciudades')!.stats
      .kilometers,
    kilometersBefore,
  );
  assert.equal(afterOverview.data.stats.countries, 1);

  const mateoTriesToEdit = await api<{ code: string }>(
    `/groups/${group.id}/visits/${createdVisit.data.visit.id}/cities`,
    {
      method: 'POST',
      cookie: mateoCookie,
      body: { name: 'Amberes' },
    },
  );
  assert.equal(mateoTriesToEdit.response.status, 404);
  assert.equal(mateoTriesToEdit.data.code, 'TRIP_NOT_FOUND');

  const removed = await api<null>(
    `/groups/${group.id}/visits/${createdVisit.data.visit.id}/cities/${gante.data.city.id}`,
    { method: 'DELETE', cookie: luciaCookie },
  );
  assert.equal(removed.response.status, 204);

  const tripId = createdVisit.data.visit.tripId;
  assert.ok(tripId);
  const citiesBeforeCountryDelete = db
    .prepare('SELECT COUNT(*) AS count FROM trip_stops WHERE trip_id = ?')
    .get(tripId) as { count: number };
  assert.equal(citiesBeforeCountryDelete.count, 2);

  const countryDelete = await api<null>(
    `/groups/${group.id}/visits/${createdVisit.data.visit.id}`,
    { method: 'DELETE', cookie: luciaCookie },
  );
  assert.equal(countryDelete.response.status, 204);

  const citiesAfterCountryDelete = db
    .prepare('SELECT COUNT(*) AS count FROM trip_stops WHERE trip_id = ?')
    .get(tripId) as { count: number };
  assert.equal(citiesAfterCountryDelete.count, 0);
});

test('la semilla demo crea una ciudad por cada visita', async () => {
  const file = resolve(`data/cities-seed-${randomUUID()}.db`);
  const bundle = createApp({
    dbFile: file,
    seedDemo: true,
    demoMode: true,
    serveStatic: false,
  });
  try {
    const trips = bundle.db.prepare('SELECT COUNT(*) AS count FROM trips').get() as {
      count: number;
    };
    const tripsWithStops = bundle.db
      .prepare('SELECT COUNT(DISTINCT trip_id) AS count FROM trip_stops')
      .get() as { count: number };
    assert.ok(trips.count > 0);
    assert.equal(tripsWithStops.count, trips.count);
  } finally {
    bundle.db.close();
    await Promise.all([
      rm(file, { force: true }),
      rm(`${file}-shm`, { force: true }),
      rm(`${file}-wal`, { force: true }),
    ]);
  }
});

test('la migración convierte visits.city_name en la primera ciudad', async () => {
  const file = resolve(`data/cities-migration-${randomUUID()}.db`);
  createLegacyDatabase(file);

  try {
    const migrated = openDatabase({ file, seedDemo: false });
    const rows = migrated
      .prepare('SELECT city_name, lat, lng FROM trip_stops WHERE trip_id = ?')
      .all('legacy-visit') as Array<{ city_name: string; lat: number; lng: number }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].city_name, 'Bruselas');
    assert.equal(rows[0].lat, 50.85);
    assert.equal(schemaVersion(migrated), 6);
    migrated.close();

    const reopened = openDatabase({ file, seedDemo: false });
    const count = reopened
      .prepare('SELECT COUNT(*) AS count FROM trip_stops WHERE trip_id = ?')
      .get('legacy-visit') as { count: number };
    assert.equal(count.count, 1, 'La migración debe ser idempotente');
    assert.equal(schemaVersion(reopened), 6);
    reopened.close();
  } finally {
    await removeDatabase(file);
  }
});

test('una migración ya aplicada no restaura ciudades borradas al reabrir', async () => {
  const file = resolve(`data/cities-deleted-${randomUUID()}.db`);
  createLegacyDatabase(file);

  try {
    const migrated = openDatabase({ file, seedDemo: false });
    try {
      const initial = migrated
        .prepare('SELECT COUNT(*) AS count FROM trip_stops WHERE trip_id = ?')
        .get('legacy-visit') as { count: number };
      assert.equal(initial.count, 1);

      migrated.prepare('DELETE FROM trip_stops WHERE trip_id = ?').run('legacy-visit');
      const deleted = migrated
        .prepare('SELECT COUNT(*) AS count FROM trip_stops WHERE trip_id = ?')
        .get('legacy-visit') as { count: number };
      assert.equal(deleted.count, 0);
    } finally {
      migrated.close();
    }

    const reopened = openDatabase({ file, seedDemo: false });
    try {
      const count = reopened
        .prepare('SELECT COUNT(*) AS count FROM trip_stops WHERE trip_id = ?')
        .get('legacy-visit') as { count: number };
      assert.equal(count.count, 0, 'Las ciudades borradas no deben resucitar');
      assert.equal(schemaVersion(reopened), 6);
    } finally {
      reopened.close();
    }
  } finally {
    await removeDatabase(file);
  }
});

test('una base existente con visit_cities vacía no se backfillea al actualizar', async () => {
  const file = resolve(`data/cities-existing-schema-${randomUUID()}.db`);
  createLegacyDatabase(file, { withCitiesTable: true });

  try {
    const upgraded = openDatabase({ file, seedDemo: false });
    try {
      const count = upgraded
        .prepare('SELECT COUNT(*) AS count FROM trip_stops WHERE trip_id = ?')
        .get('legacy-visit') as { count: number };
      assert.equal(count.count, 0, 'La actualización no debe recuperar ciudades borradas');
      assert.equal(schemaVersion(upgraded), 6);
    } finally {
      upgraded.close();
    }
  } finally {
    await removeDatabase(file);
  }
});
