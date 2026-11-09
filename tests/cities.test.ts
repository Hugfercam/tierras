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

test('las ciudades se agregan, se listan y no alteran los km', async () => {
  const luciaRegistration = await api<{ user: { id: string } }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Lucía Ciudades',
      email: 'lucia.ciudades@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
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
  assert.equal(mateoTriesToEdit.data.code, 'VISIT_NOT_FOUND');

  const removed = await api<null>(
    `/groups/${group.id}/visits/${createdVisit.data.visit.id}/cities/${gante.data.city.id}`,
    { method: 'DELETE', cookie: luciaCookie },
  );
  assert.equal(removed.response.status, 204);

  const citiesBeforeCountryDelete = db
    .prepare('SELECT COUNT(*) AS count FROM visit_cities WHERE visit_id = ?')
    .get(createdVisit.data.visit.id) as { count: number };
  assert.equal(citiesBeforeCountryDelete.count, 2);

  const countryDelete = await api<null>(
    `/groups/${group.id}/visits/${createdVisit.data.visit.id}`,
    { method: 'DELETE', cookie: luciaCookie },
  );
  assert.equal(countryDelete.response.status, 204);

  const citiesAfterCountryDelete = db
    .prepare('SELECT COUNT(*) AS count FROM visit_cities WHERE visit_id = ?')
    .get(createdVisit.data.visit.id) as { count: number };
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
    const visits = bundle.db.prepare('SELECT COUNT(*) AS count FROM visits').get() as {
      count: number;
    };
    const cities = bundle.db.prepare('SELECT COUNT(*) AS count FROM visit_cities').get() as {
      count: number;
    };
    assert.ok(visits.count > 0);
    assert.equal(cities.count, visits.count);
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
  const raw = new DatabaseSync(file);
  raw.exec(`
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
    INSERT INTO visits
      (id, group_id, user_id, country_code, city_name, lat, lng, visited_at, created_at)
    VALUES
      ('legacy-visit', 'g', 'u', 'BE', 'Bruselas', 50.85, 4.35, '2024-01-01', '2024-01-02T00:00:00Z');
  `);
  raw.close();

  try {
    const migrated = openDatabase({ file, seedDemo: false });
    const rows = migrated
      .prepare('SELECT city_name, lat, lng FROM visit_cities WHERE visit_id = ?')
      .all('legacy-visit') as Array<{ city_name: string; lat: number; lng: number }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].city_name, 'Bruselas');
    assert.equal(rows[0].lat, 50.85);
    migrated.close();

    const reopened = openDatabase({ file, seedDemo: false });
    const count = reopened
      .prepare('SELECT COUNT(*) AS count FROM visit_cities WHERE visit_id = ?')
      .get('legacy-visit') as { count: number };
    assert.equal(count.count, 1, 'La migración debe ser idempotente');
    reopened.close();
  } finally {
    await Promise.all([
      rm(file, { force: true }),
      rm(`${file}-shm`, { force: true }),
      rm(`${file}-wal`, { force: true }),
    ]);
  }
});
