import assert from 'node:assert/strict';
import test from 'node:test';
import type { GroupOverview, Visit } from '../shared/types.ts';
import { buildCityMarkers } from '../src/lib/cityMarkers.ts';

function visit(overrides: Partial<Visit> & Pick<Visit, 'id' | 'userId' | 'countryCode'>): Visit {
  return {
    countryName: 'Bélgica',
    countryFlag: '🇧🇪',
    cityName: null,
    lat: 50.5,
    lng: 4.5,
    visitedAt: '2025-05-03',
    createdAt: '2025-05-03T12:00:00.000Z',
    cities: [],
    ...overrides,
  };
}

const overview: GroupOverview = {
  group: {
    id: 'g',
    name: 'Grupo',
    ownerId: 'lucia',
    inviteCode: 'ABCD1234',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  me: { role: 'member' },
  members: [
    {
      id: 'lucia',
      name: 'Lucía',
      homeCountryCode: 'ES',
      role: 'owner',
      joinedAt: '2024-01-01T00:00:00.000Z',
      stats: { countries: 1, kilometers: 100, continents: 1, percentWorld: 0.5 },
    },
    {
      id: 'mateo',
      name: 'Mateo',
      homeCountryCode: 'ES',
      role: 'member',
      joinedAt: '2024-01-02T00:00:00.000Z',
      stats: { countries: 1, kilometers: 100, continents: 1, percentWorld: 0.5 },
    },
  ],
  visits: [
    visit({
      id: 'v1',
      userId: 'lucia',
      countryCode: 'BE',
      cities: [
        { id: 'c1', name: 'Brujas', lat: 51.2093, lng: 3.2247 },
        { id: 'c2', name: 'Gante', lat: 51.0543, lng: 3.7174 },
        { id: 'c3', name: 'Sin coordenadas', lat: null, lng: null },
      ],
    }),
    visit({
      id: 'v2',
      userId: 'mateo',
      countryCode: 'BE',
      cities: [
        { id: 'c4', name: 'Brujas', lat: 51.2093, lng: 3.2247 },
        { id: 'c5', name: 'Bruselas', lat: 50.8503, lng: 4.3517 },
      ],
    }),
  ],
  stats: { countries: 1, kilometers: 200, continents: 1, visits: 2 },
};

test('la vista de grupo agrupa ciudades por coordenadas y omite las que no tienen ubicación', () => {
  const markers = buildCityMarkers(overview, 'group');
  assert.deepEqual(
    markers.map((marker) => marker.cityName),
    ['Brujas', 'Bruselas', 'Gante'],
  );
  const brujas = markers.find((marker) => marker.cityName === 'Brujas');
  assert.ok(brujas);
  assert.deepEqual(brujas.memberNames, ['Lucía', 'Mateo']);
  assert.equal(brujas.isGroup, true);
  assert.equal(brujas.color, '#f7dca4');
});

test('la vista de miembro muestra solo sus ciudades y usa su color', () => {
  const markers = buildCityMarkers(overview, 'lucia');
  assert.deepEqual(
    markers.map((marker) => marker.cityName),
    ['Brujas', 'Gante'],
  );
  assert.equal(markers.every((marker) => marker.isGroup === false), true);
  assert.equal(markers.every((marker) => marker.color === '#ff8a6b'), true);
});
