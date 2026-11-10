import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database } from './db.ts';
import { sendMail, verificationEmail } from './mail.ts';

export type AuthTokenType = 'verify_email' | 'reset_password';

const TTL_MS: Record<AuthTokenType, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function issueAuthToken(
  db: Database,
  userId: string,
  type: AuthTokenType,
): string {
  const raw = randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + TTL_MS[type]);
  db.prepare(
    "DELETE FROM auth_tokens WHERE user_id = ? AND type = ? AND used_at IS NULL",
  ).run(userId, type);
  db.prepare(
    `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, type, hashToken(raw), expires.toISOString(), now.toISOString());
  return raw;
}

export function consumeAuthToken(
  db: Database,
  rawToken: string,
  type: AuthTokenType,
): { userId: string } | null {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT id, user_id FROM auth_tokens
       WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > ?`,
    )
    .get(hashToken(rawToken), type, now) as { id: string; user_id: string } | undefined;
  if (!row) return null;
  const result = db
    .prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .run(now, row.id);
  if (result.changes === 0) return null;
  return { userId: row.user_id };
}

export function markEmailVerified(db: Database, userId: string): void {
  db.prepare(
    'UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?',
  ).run(new Date().toISOString(), userId);
}

export function purgeExpiredTokens(db: Database): number {
  const result = db
    .prepare('DELETE FROM auth_tokens WHERE expires_at <= ? OR used_at IS NOT NULL')
    .run(new Date().toISOString());
  return Number(result.changes);
}

export async function sendVerificationEmail(
  db: Database,
  user: { id: string; name: string; email: string },
): Promise<void> {
  const token = issueAuthToken(db, user.id, 'verify_email');
  const message = verificationEmail(user.name, token);
  message.to = user.email;
  await sendMail(message);
}
