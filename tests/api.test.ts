import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../server/app.ts';
import type { Database } from '../server/db.ts';
import type {
  AuthUser,
  GroupOverview,
  GroupSummary,
  PersonalOverview,
  Trip,
} from '../shared/types.ts';

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
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
    },
  });
  assert.equal(registerLucia.response.status, 201);
  const luciaCookie = cookieFrom(registerLucia.response);
  const luciaId = registerLucia.data.user.id;

  const registerMateo = await api<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Mateo Prueba',
      email: 'mateo@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
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
  assert.equal(duplicateVisit.response.status, 201, 'Ahora se permiten varios viajes al mismo país');

  const overview = await api<GroupOverview>('/groups/' + created.data.group.id, {
    cookie: luciaCookie,
  });
  assert.equal(overview.response.status, 200);
  assert.equal(overview.data.members.length, 2);
  assert.equal(overview.data.stats.countries, 2);
  assert.equal(overview.data.stats.visits, 3);
  assert.equal(overview.data.stats.trips, 3);
  const lucia = overview.data.members.find((member) => member.name === 'Lucía Prueba');
  assert.ok(lucia);
  assert.equal(lucia.stats.countries, 1);
  assert.ok(lucia.stats.kilometers > 500);
  assert.equal(lucia.stats.percentWorld, 0.5);
  assert.equal(lucia.stats.trips, 2);

  const luciaVisitToRemove = overview.data.visits.find((visit) => visit.userId === luciaId);
  assert.ok(luciaVisitToRemove);
  const removed = await api<null>(
    `/groups/${created.data.group.id}/visits/${luciaVisitToRemove.id}`,
    { method: 'DELETE', cookie: luciaCookie },
  );
  assert.equal(removed.response.status, 204);

  const afterRemove = await api<GroupOverview>('/groups/' + created.data.group.id, {
    cookie: luciaCookie,
  });
  assert.equal(afterRemove.data.stats.visits, 2);
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
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
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

test('viajes multipaís, participantes y varios viajes al mismo país', async () => {
  const ana = await api<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Ana Viajes',
      email: 'ana.viajes@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
    },
  });
  const anaCookie = cookieFrom(ana.response);
  const beto = await api<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Beto Viajes',
      email: 'beto.viajes@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
    },
  });
  const betoCookie = cookieFrom(beto.response);
  const betoId = beto.data.user.id;

  const groupResponse = await api<{ group: GroupSummary }>('/groups', {
    method: 'POST',
    cookie: anaCookie,
    body: { name: 'Viajes compartidos' },
  });
  const group = groupResponse.data.group;
  await api('/groups/join', {
    method: 'POST',
    cookie: betoCookie,
    body: { inviteCode: group.inviteCode },
  });

  const collective = await api<{ trip: Trip }>('/trips', {
    method: 'POST',
    cookie: anaCookie,
    body: {
      title: 'Bélgica y Países Bajos',
      startDate: '2026-11-03',
      endDate: '2026-11-07',
      stops: [
        { countryCode: 'BE', cityName: 'Brujas', lat: 51.2089, lng: 3.2242, startDate: '2026-11-03' },
        { countryCode: 'BE', cityName: 'Bruselas', lat: 50.8505, lng: 4.3488, startDate: '2026-11-05' },
        { countryCode: 'NL', cityName: 'Ámsterdam', lat: 52.3676, lng: 4.9041, startDate: '2026-11-07' },
      ],
      participantIds: [betoId],
    },
  });
  assert.equal(collective.response.status, 201);
  assert.deepEqual(collective.data.trip.countries.sort(), ['BE', 'NL']);
  assert.equal(collective.data.trip.participants.length, 2);
  assert.deepEqual(
    collective.data.trip.stops.map((stop) => stop.cityName),
    ['Brujas', 'Bruselas', 'Ámsterdam'],
  );

  const anaPersonal = await api<PersonalOverview>('/me/overview', { cookie: anaCookie });
  const betoPending = await api<PersonalOverview>('/me/overview', { cookie: betoCookie });
  assert.equal(anaPersonal.data.stats.countries, 2);
  assert.equal(anaPersonal.data.stats.trips, 1);
  assert.equal(anaPersonal.data.visits.length, 2);
  assert.equal(betoPending.data.stats.countries, 0, 'Una invitación pendiente no suma países');
  assert.equal(betoPending.data.stats.trips, 0);
  assert.equal(betoPending.data.pendingInvitations.length, 1);
  assert.equal(
    betoPending.data.pendingInvitations[0]?.participants.find(
      (participant) => participant.id === betoId,
    )?.status,
    'pending',
  );

  const accepted = await api<{ trip: Trip }>(
    '/me/invitations/' + collective.data.trip.id + '/accept',
    { method: 'POST', cookie: betoCookie },
  );
  assert.equal(accepted.response.status, 200);
  assert.equal(
    accepted.data.trip.participants.find((participant) => participant.id === betoId)?.status,
    'accepted',
  );

  const betoPersonal = await api<PersonalOverview>('/me/overview', { cookie: betoCookie });
  assert.equal(betoPersonal.data.stats.countries, 2);
  assert.equal(betoPersonal.data.stats.trips, 1);
  assert.equal(betoPersonal.data.visits.length, 2);
  assert.equal(betoPersonal.data.pendingInvitations.length, 0);

  const groupOverview = await api<GroupOverview>('/groups/' + group.id, {
    cookie: anaCookie,
  });
  assert.equal(groupOverview.data.stats.countries, 2);
  assert.equal(groupOverview.data.stats.trips, 1);
  assert.equal(groupOverview.data.visits.length, 4);
  for (const member of groupOverview.data.members) {
    assert.equal(member.stats.countries, 2);
    assert.equal(member.stats.trips, 1);
  }

  const secondBelgium = await api<{ trip: Trip }>('/trips', {
    method: 'POST',
    cookie: anaCookie,
    body: {
      title: 'Bélgica en 2028',
      startDate: '2028-03-01',
      endDate: '2028-03-03',
      stops: [{ countryCode: 'BE', cityName: 'Gante', lat: 51.05, lng: 3.7167 }],
    },
  });
  assert.equal(secondBelgium.response.status, 201);

  const afterSecond = await api<PersonalOverview>('/me/overview', { cookie: anaCookie });
  assert.equal(afterSecond.data.stats.countries, 2);
  assert.equal(afterSecond.data.stats.trips, 2);
  assert.equal(
    afterSecond.data.stats.kilometers,
    anaPersonal.data.stats.kilometers,
    'Un segundo viaje al mismo país no debe duplicar los kilómetros del ranking',
  );
  const belgium = afterSecond.data.visits.find((visit) => visit.countryCode === 'BE');
  assert.ok(belgium);
  assert.equal(belgium.tripCount, 2);

  const groupAfterSecond = await api<GroupOverview>('/groups/' + group.id, {
    cookie: anaCookie,
  });
  assert.equal(groupAfterSecond.data.stats.trips, 2);
  assert.equal(groupAfterSecond.data.stats.countries, 2);
  assert.equal(
    groupAfterSecond.data.visits.filter((visit) => visit.userId === ana.data.user.id).length,
    3,
  );

  const patched = await api<{ trip: Trip }>(`/trips/${secondBelgium.data.trip.id}`, {
    method: 'PATCH',
    cookie: anaCookie,
    body: {
      title: 'Bélgica y Países Bajos en 2028',
      startDate: '2028-03-01',
      endDate: '2028-03-05',
      stops: [
        { countryCode: 'BE', cityName: 'Gante', lat: 51.05, lng: 3.7167 },
        { countryCode: 'NL', cityName: 'Róterdam', lat: 51.9244, lng: 4.4777 },
      ],
      participantIds: [betoId],
    },
  });
  assert.equal(patched.response.status, 200);
  assert.deepEqual(patched.data.trip.countries.sort(), ['BE', 'NL']);
  assert.equal(patched.data.trip.participants.length, 2);

  const betoAfterPatch = await api<PersonalOverview>('/me/overview', { cookie: betoCookie });
  assert.equal(betoAfterPatch.data.stats.trips, 1, 'La nueva invitación no cuenta todavía');
  assert.equal(betoAfterPatch.data.pendingInvitations.length, 1);
  await api('/me/invitations/' + secondBelgium.data.trip.id + '/accept', {
    method: 'POST',
    cookie: betoCookie,
  });
  const betoAcceptedPatch = await api<PersonalOverview>('/me/overview', { cookie: betoCookie });
  assert.equal(betoAcceptedPatch.data.stats.trips, 2);
  assert.equal(betoAcceptedPatch.data.stats.countries, 2);

  const rejectedTrip = await api<{ trip: Trip }>('/trips', {
    method: 'POST',
    cookie: anaCookie,
    body: {
      title: 'Viaje que Beto rechaza',
      startDate: '2029-01-10',
      endDate: '2029-01-12',
      stops: [{ countryCode: 'PT', cityName: 'Lisboa', lat: 38.7223, lng: -9.1393 }],
      participantIds: [betoId],
    },
  });
  const forcedAccept = await api('/me/invitations/' + rejectedTrip.data.trip.id + '/accept', {
    method: 'POST',
    cookie: anaCookie,
  });
  assert.equal(forcedAccept.response.status, 404, 'El propietario no puede aceptar por otra persona');
  const rejected = await api('/me/invitations/' + rejectedTrip.data.trip.id + '/reject', {
    method: 'POST',
    cookie: betoCookie,
  });
  assert.equal(rejected.response.status, 204);
  const afterReject = await api<PersonalOverview>('/me/overview', { cookie: betoCookie });
  assert.equal(afterReject.data.pendingInvitations.length, 0);
  assert.equal(afterReject.data.stats.trips, 2);

  const left = await api('/me/trips/' + secondBelgium.data.trip.id + '/participation', {
    method: 'DELETE',
    cookie: betoCookie,
  });
  assert.equal(left.response.status, 204);
  const afterLeave = await api<PersonalOverview>('/me/overview', { cookie: betoCookie });
  assert.equal(afterLeave.data.stats.trips, 1);
});

test('RGPD: consentimiento, exportación, rectificación y supresión', async () => {
  const registration = await api<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Privacidad Prueba',
      email: 'privacidad@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
    },
  });
  assert.equal(registration.response.status, 201);
  const cookie = cookieFrom(registration.response);
  const userId = registration.data.user.id;

  const me = await api<{ user: AuthUser }>('/auth/me', { cookie });
  assert.equal(me.response.status, 200);
  assert.equal(me.data.user.consentRequired, false);

  db.prepare('DELETE FROM user_consents WHERE user_id = ?').run(userId);
  const consentPending = await api<{ user: AuthUser }>('/auth/me', { cookie });
  assert.equal(consentPending.data.user.consentRequired, true);
  const blockedOverview = await api('/me/overview', { cookie });
  assert.equal(blockedOverview.response.status, 403);
  const accepted = await api<{ consentRequired: boolean }>('/account/consent', {
    method: 'POST',
    cookie,
  });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.data.consentRequired, false);

  const updated = await api<{ user: AuthUser }>('/account', {
    method: 'PATCH',
    cookie,
    body: { name: 'Privacidad Actualizada', currentPassword: 'secreto123' },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.user.name, 'Privacidad Actualizada');

  const exportedResponse = await fetch(`${baseUrl}/api/account/export`, {
    headers: { Cookie: cookie },
  });
  assert.equal(exportedResponse.status, 200);
  assert.match(exportedResponse.headers.get('content-disposition') ?? '', /attachment/);
  const exported = (await exportedResponse.json()) as {
    account: { email: string };
    consents: unknown[];
  };
  assert.equal(exported.account.email, 'privacidad@prueba.test');
  assert.ok(exported.consents.length >= 3);
  assert.equal(JSON.stringify(exported).includes('password_hash'), false);

  const removed = await api<null>('/account', {
    method: 'DELETE',
    cookie,
    body: { currentPassword: 'secreto123' },
  });
  assert.equal(removed.response.status, 204);
  const afterDelete = await api('/auth/me', { cookie });
  assert.equal(afterDelete.response.status, 401);
  const deletedRow = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  assert.equal(deletedRow, undefined);
});

test('RGPD: al eliminar una cuenta, el grupo pasa a otra persona', async () => {
  const owner = await api<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Dueña Temporal',
      email: 'duena@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
    },
  });
  const member = await api<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Miembro Temporal',
      email: 'miembro@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
    },
  });
  const ownerCookie = cookieFrom(owner.response);
  const memberCookie = cookieFrom(member.response);
  const created = await api<{ group: GroupSummary }>('/groups', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: 'Grupo heredado' },
  });
  const joined = await api('/groups/join', {
    method: 'POST',
    cookie: memberCookie,
    body: { inviteCode: created.data.group.inviteCode },
  });
  assert.equal(joined.response.status, 200);
  const beforeDelete = await api<{ groups: GroupSummary[] }>('/groups', { cookie: memberCookie });
  assert.equal(beforeDelete.data.groups.length, 1);
  assert.equal(beforeDelete.data.groups[0]?.myRole, 'member');

  const removed = await api<null>('/account', {
    method: 'DELETE',
    cookie: ownerCookie,
    body: { currentPassword: 'secreto123' },
  });
  assert.equal(removed.response.status, 204);

  const groups = await api<{ groups: GroupSummary[] }>('/groups', { cookie: memberCookie });
  const inherited = groups.data.groups.find((group) => group.id === created.data.group.id);
  assert.equal(inherited?.myRole, 'owner');
});

test('el pasaporte personal funciona sin grupo', async () => {
  const solo = await api<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      name: 'Solo Viajes',
      email: 'solo.viajes@prueba.test',
      password: 'secreto123',
      homeCountryCode: 'ES',
      acceptPrivacy: true,
      acceptTerms: true,
      ageConfirmed: true,
    },
  });
  const cookie = cookieFrom(solo.response);

  const empty = await api<PersonalOverview>('/me/overview', { cookie });
  assert.equal(empty.response.status, 200);
  assert.equal(empty.data.stats.trips, 0);
  assert.equal(empty.data.stats.countries, 0);
  assert.deepEqual(empty.data.visits, []);

  const created = await api<{ trip: Trip }>('/trips', {
    method: 'POST',
    cookie,
    body: {
      title: 'Escapada sola',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      stops: [{ countryCode: 'PT', cityName: 'Lisboa', lat: 38.7223, lng: -9.1393 }],
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.trip.participants.length, 1);

  const after = await api<PersonalOverview>('/me/overview', { cookie });
  assert.equal(after.data.stats.trips, 1);
  assert.equal(after.data.stats.countries, 1);
  assert.equal(after.data.visits[0].tripCount, 1);
});
