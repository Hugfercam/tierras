import { randomUUID } from 'node:crypto';
import type { Database } from './db.ts';

type HashPassword = (password: string) => string;

interface DemoVisit {
  country: string;
  date: string;
  city: string;
  lat: number;
  lng: number;
}

const DEMO_PASSWORD = 'viajar2026';

const users = [
  { key: 'lucia', name: 'Lucía Ferrer', email: 'lucia@tierras.app' },
  { key: 'mateo', name: 'Mateo Ruiz', email: 'mateo@tierras.app' },
  { key: 'sofia', name: 'Sofía Navarro', email: 'sofia@tierras.app' },
  { key: 'diego', name: 'Diego Salas', email: 'diego@tierras.app' },
] as const;

const groups = [
  {
    key: 'trotamundos',
    name: 'Los Trotamundos',
    owner: 'lucia',
    inviteCode: 'RUTA2025',
    createdAt: '2024-01-12T18:20:00.000Z',
    members: ['lucia', 'mateo', 'sofia', 'diego'],
  },
  {
    key: 'nomada',
    name: 'Casa Nómada',
    owner: 'sofia',
    inviteCode: 'CASA2025',
    createdAt: '2025-02-03T10:10:00.000Z',
    members: ['sofia', 'lucia', 'mateo'],
  },
] as const;

const visitsByGroup: Record<string, Record<string, DemoVisit[]>> = {
  trotamundos: {
    lucia: [
      { country: 'ES', date: '2023-01-02', city: 'Madrid', lat: 40.4168, lng: -3.7038 },
      { country: 'PT', date: '2023-03-18', city: 'Lisboa', lat: 38.7223, lng: -9.1393 },
      { country: 'FR', date: '2023-06-02', city: 'París', lat: 48.8566, lng: 2.3522 },
      { country: 'IT', date: '2023-09-10', city: 'Roma', lat: 41.9028, lng: 12.4964 },
      { country: 'MA', date: '2024-02-14', city: 'Marrakech', lat: 31.6295, lng: -7.9811 },
      { country: 'JP', date: '2024-07-22', city: 'Tokio', lat: 35.6762, lng: 139.6503 },
      { country: 'MX', date: '2025-01-05', city: 'Ciudad de México', lat: 19.4326, lng: -99.1332 },
      { country: 'US', date: '2025-08-19', city: 'Nueva York', lat: 40.7128, lng: -74.006 },
      { country: 'GB', date: '2026-04-02', city: 'Londres', lat: 51.5074, lng: -0.1278 },
    ],
    mateo: [
      { country: 'ES', date: '2023-02-11', city: 'Madrid', lat: 40.4168, lng: -3.7038 },
      { country: 'DE', date: '2023-04-21', city: 'Berlín', lat: 52.52, lng: 13.405 },
      { country: 'NL', date: '2023-04-26', city: 'Ámsterdam', lat: 52.3676, lng: 4.9041 },
      { country: 'TH', date: '2024-01-11', city: 'Bangkok', lat: 13.7563, lng: 100.5018 },
      { country: 'VN', date: '2024-01-25', city: 'Hanói', lat: 21.0278, lng: 105.8342 },
      { country: 'JP', date: '2024-02-02', city: 'Tokio', lat: 35.6762, lng: 139.6503 },
      { country: 'GB', date: '2025-05-16', city: 'Londres', lat: 51.5074, lng: -0.1278 },
      { country: 'IS', date: '2026-02-10', city: 'Reikiavik', lat: 64.1466, lng: -21.9426 },
    ],
    sofia: [
      { country: 'ES', date: '2023-03-03', city: 'Madrid', lat: 40.4168, lng: -3.7038 },
      { country: 'MX', date: '2023-12-08', city: 'Ciudad de México', lat: 19.4326, lng: -99.1332 },
      { country: 'CO', date: '2024-03-14', city: 'Bogotá', lat: 4.711, lng: -74.0721 },
      { country: 'PE', date: '2024-06-21', city: 'Lima', lat: -12.0464, lng: -77.0428 },
      { country: 'CL', date: '2024-07-02', city: 'Santiago', lat: -33.4489, lng: -70.6693 },
      { country: 'AR', date: '2024-07-12', city: 'Buenos Aires', lat: -34.6037, lng: -58.3816 },
      { country: 'BR', date: '2024-11-20', city: 'Río de Janeiro', lat: -22.9068, lng: -43.1729 },
      { country: 'US', date: '2025-06-15', city: 'Miami', lat: 25.7617, lng: -80.1918 },
    ],
    diego: [
      { country: 'ES', date: '2023-04-05', city: 'Madrid', lat: 40.4168, lng: -3.7038 },
      { country: 'PT', date: '2023-08-12', city: 'Lisboa', lat: 38.7223, lng: -9.1393 },
      { country: 'MA', date: '2024-01-20', city: 'Marrakech', lat: 31.6295, lng: -7.9811 },
      { country: 'IS', date: '2024-09-18', city: 'Reikiavik', lat: 64.1466, lng: -21.9426 },
      { country: 'NO', date: '2024-09-24', city: 'Oslo', lat: 59.9139, lng: 10.7522 },
      { country: 'TR', date: '2025-02-13', city: 'Estambul', lat: 41.0082, lng: 28.9784 },
      { country: 'GR', date: '2025-06-07', city: 'Atenas', lat: 37.9838, lng: 23.7275 },
      { country: 'EG', date: '2025-10-09', city: 'El Cairo', lat: 30.0444, lng: 31.2357 },
      { country: 'ZA', date: '2026-03-21', city: 'Ciudad del Cabo', lat: -33.9249, lng: 18.4241 },
      { country: 'KE', date: '2026-07-14', city: 'Nairobi', lat: -1.2921, lng: 36.8219 },
    ],
  },
  nomada: {
    sofia: [
      { country: 'ES', date: '2025-03-01', city: 'Madrid', lat: 40.4168, lng: -3.7038 },
      { country: 'PT', date: '2025-04-12', city: 'Lisboa', lat: 38.7223, lng: -9.1393 },
      { country: 'FR', date: '2025-08-22', city: 'París', lat: 48.8566, lng: 2.3522 },
    ],
    lucia: [
      { country: 'ES', date: '2025-03-01', city: 'Madrid', lat: 40.4168, lng: -3.7038 },
      { country: 'FR', date: '2025-05-10', city: 'París', lat: 48.8566, lng: 2.3522 },
      { country: 'IT', date: '2025-07-01', city: 'Roma', lat: 41.9028, lng: 12.4964 },
      { country: 'PT', date: '2025-09-14', city: 'Lisboa', lat: 38.7223, lng: -9.1393 },
    ],
    mateo: [
      { country: 'ES', date: '2025-03-01', city: 'Madrid', lat: 40.4168, lng: -3.7038 },
      { country: 'DE', date: '2025-06-18', city: 'Berlín', lat: 52.52, lng: 13.405 },
      { country: 'NL', date: '2025-06-24', city: 'Ámsterdam', lat: 52.3676, lng: 4.9041 },
    ],
  },
};

export function seedDemo(db: Database, hashPassword: HashPassword): void {
  const userIds = new Map<string, string>();
  const insertUser = db.prepare(
    'INSERT INTO users (id, name, email, password_hash, home_country_code, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertGroup = db.prepare(
    'INSERT INTO groups (id, name, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const insertMembership = db.prepare(
    'INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
  );
  const insertVisit = db.prepare(
    `INSERT INTO visits
      (id, group_id, user_id, country_code, city_name, lat, lng, visited_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertVisitCity = db.prepare(
    `INSERT INTO visit_cities (id, visit_id, city_name, lat, lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const passwordHash = hashPassword(DEMO_PASSWORD);

  db.exec('BEGIN');
  try {
    for (const [index, user] of users.entries()) {
      const id = randomUUID();
      userIds.set(user.key, id);
      insertUser.run(
        id,
        user.name,
        user.email,
        passwordHash,
        'ES',
        `2025-01-0${index + 1}T09:00:00.000Z`,
      );
    }

    for (const group of groups) {
      const groupId = randomUUID();
      insertGroup.run(
        groupId,
        group.name,
        userIds.get(group.owner)!,
        group.inviteCode,
        group.createdAt,
      );

      for (const [index, memberKey] of group.members.entries()) {
        insertMembership.run(
          groupId,
          userIds.get(memberKey)!,
          memberKey === group.owner ? 'owner' : 'member',
          `2024-0${Math.min(index + 1, 9)}-15T11:00:00.000Z`,
        );
      }

      for (const [memberKey, visits] of Object.entries(visitsByGroup[group.key] || {})) {
        const userId = userIds.get(memberKey);
        if (!userId) continue;
        for (const visit of visits) {
          const visitId = randomUUID();
          const createdAt = `${visit.date}T12:00:00.000Z`;
          insertVisit.run(
            visitId,
            groupId,
            userId,
            visit.country,
            visit.city,
            visit.lat,
            visit.lng,
            visit.date,
            createdAt,
          );
          insertVisitCity.run(
            randomUUID(),
            visitId,
            visit.city,
            visit.lat,
            visit.lng,
            createdAt,
          );
        }
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export const DEMO_ACCOUNT = {
  email: 'lucia@tierras.app',
  password: DEMO_PASSWORD,
};
