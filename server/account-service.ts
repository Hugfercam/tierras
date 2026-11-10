import type { Database } from './db.ts';
import { isConsentRequired, listConsents, recordCurrentConsents } from './consent.ts';
import { toAuthUser, verifyPassword } from './auth.ts';
import { HttpError } from './errors.ts';
import { loadTripsForUsers } from './trip-service.ts';

interface AccountRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  home_country_code: string;
  email_verified_at: string | null;
  created_at: string;
}

function getAccount(db: Database, userId: string): AccountRow {
  const row = db
    .prepare(
      `SELECT id, name, email, password_hash, home_country_code, email_verified_at, created_at
       FROM users WHERE id = ?`,
    )
    .get(userId) as AccountRow | undefined;
  if (!row) throw new HttpError(404, 'No encontramos tu cuenta.', { code: 'USER_NOT_FOUND' });
  return row;
}

export async function updateAccount(
  db: Database,
  userId: string,
  input: {
    name?: string;
    email?: string;
    homeCountryCode?: string;
    currentPassword: string;
  },
) {
  const row = getAccount(db, userId);
  const valid = await verifyPassword(input.currentPassword, row.password_hash);
  if (!valid) {
    throw new HttpError(401, 'La contraseña actual no es correcta.', {
      code: 'BAD_CREDENTIALS',
      fieldErrors: { currentPassword: 'La contraseña actual no es correcta.' },
    });
  }

  const email = input.email?.trim().toLowerCase() || row.email;
  const name = input.name?.trim() || row.name;
  const homeCountryCode = input.homeCountryCode?.trim().toUpperCase() || row.home_country_code;
  const emailChanged = email !== row.email;
  if (email !== row.email) {
    const exists = db.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').get(email, userId);
    if (exists) {
      throw new HttpError(409, 'Ya hay una cuenta con ese email.', {
        code: 'EMAIL_TAKEN',
        fieldErrors: { email: 'Ya hay una cuenta con ese email.' },
      });
    }
  }

  db.prepare(
    `UPDATE users
     SET name = ?, email = ?, home_country_code = ?,
         email_verified_at = CASE WHEN ? THEN NULL ELSE email_verified_at END
     WHERE id = ?`,
  ).run(name, email, homeCountryCode, emailChanged ? 1 : 0, userId);
  const updated = getAccount(db, userId);
  return toAuthUser(updated, isConsentRequired(db, userId));
}

export async function deleteAccount(
  db: Database,
  userId: string,
  currentPassword: string,
): Promise<void> {
  const row = getAccount(db, userId);
  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid) {
    throw new HttpError(401, 'La contraseña actual no es correcta.', {
      code: 'BAD_CREDENTIALS',
      fieldErrors: { currentPassword: 'La contraseña actual no es correcta.' },
    });
  }

  const ownedGroups = db
    .prepare('SELECT id FROM groups WHERE owner_id = ?')
    .all(userId) as unknown as Array<{ id: string }>;

  db.exec('BEGIN');
  try {
    for (const group of ownedGroups) {
      const successor = db
        .prepare(
          `SELECT user_id FROM memberships
           WHERE group_id = ? AND user_id <> ?
           ORDER BY joined_at ASC, user_id ASC
           LIMIT 1`,
        )
        .get(group.id, userId) as { user_id: string } | undefined;
      if (successor) {
        db.prepare('UPDATE groups SET owner_id = ? WHERE id = ?').run(successor.user_id, group.id);
        db.prepare("UPDATE memberships SET role = 'owner' WHERE group_id = ? AND user_id = ?").run(
          group.id,
          successor.user_id,
        );
      } else {
        db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
      }
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function exportAccount(db: Database, userId: string) {
  const user = getAccount(db, userId);
  const groups = db
    .prepare(
      `SELECT g.id, g.name, g.owner_id, g.created_at, m.role, m.joined_at
       FROM groups g
       JOIN memberships m ON m.group_id = g.id
       WHERE m.user_id = ?
       ORDER BY g.created_at ASC`,
    )
    .all(userId);
  const trips = loadTripsForUsers(db, [userId], userId);
  return {
    format: 'tierras-account-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      name: user.name,
      email: user.email,
      homeCountryCode: user.home_country_code,
      emailVerified: Boolean(user.email_verified_at),
      createdAt: user.created_at,
    },
    groups,
    trips,
    consents: listConsents(db, userId).map((consent) => ({
      kind: consent.kind,
      version: consent.version,
      acceptedAt: consent.accepted_at,
    })),
  };
}

export function acceptCurrentConsents(db: Database, userId: string) {
  recordCurrentConsents(db, userId, new Date().toISOString());
  return { consentRequired: false };
}

export function accountConsentStatus(db: Database, userId: string) {
  return { consentRequired: isConsentRequired(db, userId), consents: listConsents(db, userId) };
}
