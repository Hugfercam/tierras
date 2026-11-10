import { randomUUID } from 'node:crypto';
import { CURRENT_CONSENTS } from '../shared/legal.ts';
import type { Database } from './db.ts';

export function isConsentRequired(db: Database, userId: string): boolean {
  for (const consent of CURRENT_CONSENTS) {
    const row = db
      .prepare(
        `SELECT 1 AS found FROM user_consents
         WHERE user_id = ? AND kind = ? AND version = ?`,
      )
      .get(userId, consent.kind, consent.version);
    if (!row) return true;
  }
  return false;
}

export function recordCurrentConsents(
  db: Database,
  userId: string,
  acceptedAt = new Date().toISOString(),
): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO user_consents (id, user_id, kind, version, accepted_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const consent of CURRENT_CONSENTS) {
    insert.run(randomUUID(), userId, consent.kind, consent.version, acceptedAt);
  }
}

export function listConsents(db: Database, userId: string) {
  return db
    .prepare(
      `SELECT kind, version, accepted_at
       FROM user_consents
       WHERE user_id = ?
       ORDER BY accepted_at ASC, kind ASC`,
    )
    .all(userId) as unknown as Array<{
    kind: 'privacy' | 'terms' | 'age';
    version: string;
    accepted_at: string;
  }>;
}
