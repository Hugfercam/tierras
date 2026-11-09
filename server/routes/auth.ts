import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { isCountryCode } from '../../shared/countries.ts';
import type { AuthUser } from '../../shared/types.ts';
import {
  clearSessionCookie,
  createSession,
  currentUser,
  destroySession,
  findSessionUser,
  hashPassword,
  readSessionToken,
  requireAuth,
  setSessionCookie,
  toAuthUser,
  verifyPassword,
} from '../auth.ts';
import type { Database } from '../db.ts';
import { HttpError, parseWith } from '../errors.ts';

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Ingresá tu email.')
  .max(160, 'El email es demasiado largo.')
  .email('Ingresá un email válido.')
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(8, 'La contraseña necesita al menos 8 caracteres.')
  .max(128, 'La contraseña es demasiado larga.');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Ingresá tu nombre.').max(60, 'Máximo 60 caracteres.'),
  email: emailSchema,
  password: passwordSchema,
  homeCountryCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isCountryCode, 'Elegí un país de residencia válido.'),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Ingresá tu contraseña.').max(128),
});

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  home_country_code: string;
  created_at: string;
}

export function authRoutes(db: Database): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const input = parseWith(registerSchema, req.body);

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(input.email) as { id: string } | undefined;
    if (existing) {
      throw new HttpError(409, 'Ya hay una cuenta con ese email.', {
        code: 'EMAIL_TAKEN',
        fieldErrors: { email: 'Ya hay una cuenta con ese email.' },
      });
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);

    try {
      db.prepare(
        `INSERT INTO users (id, name, email, password_hash, home_country_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, input.name, input.email, passwordHash, input.homeCountryCode, now);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: users.email')) {
        throw new HttpError(409, 'Ya hay una cuenta con ese email.', {
          code: 'EMAIL_TAKEN',
          fieldErrors: { email: 'Ya hay una cuenta con ese email.' },
        });
      }
      throw error;
    }

    const user: AuthUser = {
      id,
      name: input.name,
      email: input.email,
      homeCountryCode: input.homeCountryCode,
      createdAt: now,
    };
    const token = createSession(db, id);
    setSessionCookie(res, token);
    res.status(201).json({ user });
  });

  router.post('/login', async (req, res) => {
    const input = parseWith(loginSchema, req.body);
    const row = db
      .prepare(
        'SELECT id, name, email, password_hash, home_country_code, created_at FROM users WHERE email = ?',
      )
      .get(input.email) as UserRow | undefined;

    const valid = row ? await verifyPassword(input.password, row.password_hash) : false;
    if (!row || !valid) {
      throw new HttpError(401, 'Email o contraseña incorrectos.', { code: 'BAD_CREDENTIALS' });
    }

    const token = createSession(db, row.id);
    setSessionCookie(res, token);
    res.json({ user: toAuthUser(row) });
  });

  router.get('/me', requireAuth(db), (_req, res) => {
    res.json({ user: currentUser(res) });
  });

  router.post('/logout', (req, res) => {
    const token = readSessionToken(req);
    if (token && findSessionUser(db, token)) {
      destroySession(db, token);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  return router;
}
