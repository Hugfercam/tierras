import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '../shared/types.ts';
import { isConsentRequired } from './consent.ts';
import type { Database } from './db.ts';

const scryptAsync = promisify(scrypt);
export const SESSION_COOKIE = 'tierras_session';
const SESSION_DAYS = 30;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

interface UserRow {
  id: string;
  name: string;
  email: string;
  home_country_code: string;
  created_at: string;
}

interface SessionRow extends UserRow {
  expires_at: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function hashPasswordSync(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = (await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: Database, userId: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
  db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(hashToken(token), userId, expires.toISOString(), now.toISOString());
  return token;
}

export function destroySession(db: Database, token: string | undefined): void {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/',
  });
}

export function readSessionToken(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function toAuthUser(row: UserRow, consentRequired = false): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    homeCountryCode: row.home_country_code,
    createdAt: row.created_at,
    consentRequired,
  };
}

export function findSessionUser(db: Database, token: string | undefined): AuthUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.home_country_code, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as SessionRow | undefined;
  return row ? toAuthUser(row, isConsentRequired(db, row.id)) : null;
}

export function requireAuth(db: Database) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = readSessionToken(req);
    const user = findSessionUser(db, token);
    if (!user) {
      res.status(401).json({ error: 'Tu sesión expiró. Inicia sesión de nuevo.', code: 'UNAUTHENTICATED' });
      return;
    }
    res.locals.user = user;
    res.locals.sessionToken = token;
    next();
  };
}

export function currentUser(res: Response): AuthUser {
  return res.locals.user as AuthUser;
}

export function requireConsent() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = currentUser(res);
    if (user.consentRequired) {
      res.status(403).json({
        error: 'Acepta la política de privacidad y los términos para continuar.',
        code: 'CONSENT_REQUIRED',
      });
      return;
    }
    next();
  };
}

export function currentSessionToken(res: Response): string | undefined {
  return res.locals.sessionToken as string | undefined;
}

export { toAuthUser };
