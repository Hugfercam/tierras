import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../server/app.ts';
import type { Database } from '../server/db.ts';
import type { GroupOverview, GroupSummary, AuthUser } from '../shared/types.ts';

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
  await new Promise<void>((resolve) => {
    server = bundle.app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de prueba sin puerto');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  db.close();
});

function cookieFrom(response: Response): string {
  const value = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  assert.ok(value, 'La respuesta debería establecer una cookie de sesión');
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

test('flujo principal: registro, grupo, invitación, visitas y ranking', async () => {
  const registerLucia = await api<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Lucía Prueba',
      email: 'lucia@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
    },
  });
  assert.equal(registerLucia.response.status, 201);
  const luciaCookie = cookieFrom(registerLucia.response);

  const registerMateo = await api<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Mateo Prueba',
      email: 'mateo@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
    },
  });
  assert.equal(registerMateo.response.status, 201);
  const mateoCookie = cookieFrom(registerMateo.response);

  const created = await api<{ group: GroupSummary }>('/groups', {
    method: 'POST',
    cookie: luciaCookie,
    body: { name: 'Grupo de prueba' },
  });
  assert.equal(created.response.status, 201);
  assert.match(created.data.group.inviteCode, /^[A-Z0-9]{8}$/);

  const joined = await api<{ group: GroupSummary }>('/groups/join', {
    method: 'POST',
    cookie: mateoCookie,
    body: { inviteCode: created.data.group.inviteCode.replace(/(.{4})/, '$1-') },
  });
  assert.equal(joined.response.status, 200);
  assert.equal(joined.data.group.id, created.data.group.id);

  const duplicateJoin = await api<{ code: string }>('/groups/join', {
    method: 'POST',
    cookie: mateoCookie,
    body: { inviteCode: created.data.group.inviteCode },
  });
  assert.equal(duplicateJoin.response.status, 409);
  assert.equal(duplicateJoin.data.code, 'ALREADY_MEMBER');

  const luciaVisit = await api('/groups/' + created.data.group.id + '/visits', {
    method: 'POST',
    cookie: luciaCookie,
    body: {
      countryCode: 'FR',
      cityName: 'París',
      lat: 48.8566,
      lng: 2.3522,
      visitedAt: '2024-03-10',
    },
  });
  assert.equal(luciaVisit.response.status, 201);

  const mateoVisit = await api('/groups/' + created.data.group.id + '/visits', {
    method: 'POST',
    cookie: mateoCookie,
    body: {
      countryCode: 'DE',
      cityName: 'Berlín',
      lat: 52.52,
      lng: 13.405,
      visitedAt: '2024-05-01',
    },
  });
  assert.equal(mateoVisit.response.status, 201);

  const duplicateVisit = await api<{ code: string }>(
    '/groups/' + created.data.group.id + '/visits',
    {
      method: 'POST',
      cookie: luciaCookie,
      body: { countryCode: 'FR', visitedAt: '2024-04-10' },
    },
  );
  assert.equal(duplicateVisit.response.status, 409);
  assert.equal(duplicateVisit.data.code, 'ALREADY_VISITED');

  const overview = await api<GroupOverview>('/groups/' + created.data.group.id, {
    cookie: luciaCookie,
  });
  assert.equal(overview.response.status, 200);
  assert.equal(overview.data.members.length, 2);
  assert.equal(overview.data.stats.countries, 2);
  assert.equal(overview.data.stats.visits, 2);
  const lucia = overview.data.members.find((member) => member.name === 'Lucía Prueba');
  assert.ok(lucia);
  assert.equal(lucia.stats.countries, 1);
  assert.ok(lucia.stats.kilometers > 500);
  assert.equal(lucia.stats.percentWorld, 0.5);

  const removed = await api<null>(
    `/groups/${created.data.group.id}/visits/${overview.data.visits[0].id}`,
    { method: 'DELETE', cookie: luciaCookie },
  );
  assert.equal(removed.response.status, 204);

  const afterRemove = await api<GroupOverview>('/groups/' + created.data.group.id, {
    cookie: luciaCookie,
  });
  assert.equal(afterRemove.data.stats.visits, 1);
});

test('validación y acceso: sin sesión y grupos ajenos', async () => {
  const anonymous = await api<{ code: string }>('/groups');
  assert.equal(anonymous.response.status, 401);

  const invalidRegister = await api<{ code: string; fieldErrors: Record<string, string> }>(
    '/auth/register',
    {
      method: 'POST',
      body: {
        name: 'X',
        email: 'no-es-email',
        password: 'corta',
        homeCountryCode: 'ZZ',
      },
    },
  );
  assert.equal(invalidRegister.response.status, 400);
  assert.equal(invalidRegister.data.code, 'VALIDATION_ERROR');
  assert.ok(invalidRegister.data.fieldErrors.email);

  const register = await api<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Diego Prueba',
      email: 'diego@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
    },
  });
  const diegoCookie = cookieFrom(register.response);

  const luciaLogin = await api<{ user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: { email: 'lucia@prueba.test', password: 'secreto123' },
  });
  const luciaCookie = cookieFrom(luciaLogin.response);
  const groups = await api<{ groups: GroupSummary[] }>('/groups', { cookie: luciaCookie });
  const group = groups.data.groups[0];
  assert.ok(group);

  const foreign = await api<{ code: string }>('/groups/' + group.id, { cookie: diegoCookie });
  assert.equal(foreign.response.status, 404);
  assert.equal(foreign.data.code, 'GROUP_NOT_FOUND');
});
