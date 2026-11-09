import assert from 'node:assert/strict';
import test from 'node:test';
import { getCountry } from '../shared/countries.ts';
import { computeMemberStats, haversineKm } from '../shared/geo.ts';
import { LEADERBOARD_METRICS, sortMembers } from '../shared/leaderboard.ts';
import type { GroupMember } from '../shared/types.ts';

const homes = getCountry('ES')!;

test('haversine calcula la distancia entre Madrid y París con tolerancia', () => {
  const distance = haversineKm(
    { lat: 40.4168, lng: -3.7038 },
    { lat: 48.8566, lng: 2.3522 },
  );
  assert.ok(distance > 1000 && distance < 1100, `distancia inesperada: ${distance}`);
});

test('las métricas cuentan países únicos y continentes', () => {
  const stats = computeMemberStats(
    [
      {
        countryCode: 'FR',
        lat: 48.8566,
        lng: 2.3522,
        visitedAt: '2024-01-01',
        createdAt: '2024-01-02T00:00:00.000Z',
      },
      {
        countryCode: 'JP',
        lat: 35.6762,
        lng: 139.6503,
        visitedAt: '2024-02-01',
        createdAt: '2024-02-02T00:00:00.000Z',
      },
    ],
    'ES',
    197,
  );
  assert.equal(stats.countries, 2);
  assert.equal(stats.continents, 2);
  assert.equal(stats.percentWorld, 1);
  assert.ok(stats.kilometers > 10_000);
});

test('los kilómetros se ordenan por fecha y salen del país base', () => {
  const later = {
    countryCode: 'FR',
    lat: 48.8566,
    lng: 2.3522,
    visitedAt: '2024-06-01',
    createdAt: '2024-06-02T00:00:00.000Z',
  };
  const earlier = {
    countryCode: 'PT',
    lat: 38.7223,
    lng: -9.1393,
    visitedAt: '2024-01-01',
    createdAt: '2024-01-02T00:00:00.000Z',
  };
  const expected = Math.round(
    haversineKm({ lat: homes.lat, lng: homes.lng }, { lat: earlier.lat, lng: earlier.lng }) +
      haversineKm({ lat: earlier.lat, lng: earlier.lng }, { lat: later.lat, lng: later.lng }),
  );
  const stats = computeMemberStats([later, earlier], 'ES', 197);
  assert.equal(stats.kilometers, expected);
});

test('el registro del país base fija el punto de partida y no suma una pierna', () => {
  const stats = computeMemberStats(
    [
      {
        countryCode: 'ES',
        lat: 40.4168,
        lng: -3.7038,
        visitedAt: '2024-01-01',
        createdAt: '2024-01-02T00:00:00.000Z',
      },
      {
        countryCode: 'FR',
        lat: 48.8566,
        lng: 2.3522,
        visitedAt: '2024-02-01',
        createdAt: '2024-02-02T00:00:00.000Z',
      },
    ],
    'ES',
    197,
  );
  const expected = Math.round(
    haversineKm({ lat: 40.4168, lng: -3.7038 }, { lat: 48.8566, lng: 2.3522 }),
  );
  assert.equal(stats.kilometers, expected);
  assert.equal(stats.countries, 2);
});

test('el desempate del ranking usa países, kilómetros y nombre', () => {
  const members: GroupMember[] = [
    {
      id: 'a',
      name: 'Ana',
      homeCountryCode: 'ES',
      role: 'member',
      joinedAt: '',
      stats: { countries: 4, kilometers: 100, continents: 2, percentWorld: 2 },
    },
    {
      id: 'b',
      name: 'Beto',
      homeCountryCode: 'ES',
      role: 'member',
      joinedAt: '',
      stats: { countries: 4, kilometers: 200, continents: 2, percentWorld: 2 },
    },
    {
      id: 'c',
      name: 'Carla',
      homeCountryCode: 'ES',
      role: 'member',
      joinedAt: '',
      stats: { countries: 7, kilometers: 50, continents: 2, percentWorld: 3.5 },
    },
  ];
  const sorted = sortMembers(members, 'countries');
  assert.deepEqual(
    sorted.map((member) => member.name),
    ['Carla', 'Beto', 'Ana'],
  );
  assert.equal(LEADERBOARD_METRICS.length, 3);
});
