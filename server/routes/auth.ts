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
import { isConsentRequired, recordCurrentConsents } from '../consent.ts';
import {
  consumeAuthToken,
  issueAuthToken,
  markEmailVerified,
  sendVerificationEmail,
} from '../auth-tokens.ts';
import { HttpError, parseWith } from '../errors.ts';
import { emailKey, rateLimit } from '../rate-limit.ts';
import { resetEmail, sendMail } from '../mail.ts';

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Introduce tu email.')
  .max(160, 'El email es demasiado largo.')
  .email('Introduce un email válido.')
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(8, 'La contraseña necesita al menos 8 caracteres.')
  .max(128, 'La contraseña es demasiado larga.');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Introduce tu nombre.').max(60, 'Máximo 60 caracteres.'),
  email: emailSchema,
  password: passwordSchema,
  homeCountryCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isCountryCode, 'Elige un país de residencia válido.'),
  acceptPrivacy: z.literal(true, 'Debes aceptar la política de privacidad.'),
  acceptTerms: z.literal(true, 'Debes aceptar los términos de uso.'),
  ageConfirmed: z.literal(true, 'Debes confirmar que tienes al menos 14 años.'),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Introduce tu contraseña.').max(128),
});

const emailOnlySchema = z.object({ email: emailSchema });
const tokenSchema = z.object({
  token: z.string().trim().min(20, 'Enlace no válido.').max(200),
});
const resetSchema = tokenSchema.extend({ password: passwordSchema });

const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Demasiados registros desde esta conexión. Prueba más tarde.',
});
const loginIpLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Demasiados intentos de acceso. Espera unos minutos.',
});
const loginEmailLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: emailKey,
  message: 'Demasiados intentos para este email. Espera unos minutos.',
});
const forgotLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Demasiadas solicitudes de recuperación. Prueba más tarde.',
});
const forgotEmailLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  key: emailKey,
  message: 'Demasiadas solicitudes para este email. Prueba más tarde.',
});
const tokenLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Demasiados intentos con enlaces. Prueba más tarde.',
});
const resendLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Has pedido demasiados emails. Espera un poco.',
});

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  home_country_code: string;
  email_verified_at: string | null;
  created_at: string;
}

export function authRoutes(db: Database): Router {
  const router = Router();

  router.post('/register', registerLimit, async (req, res) => {
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

    db.exec('BEGIN');
    try {
      db.prepare(
        `INSERT INTO users (id, name, email, password_hash, home_country_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, input.name, input.email, passwordHash, input.homeCountryCode, now);
      recordCurrentConsents(db, id, now);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
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
      emailVerified: false,
      consentRequired: false,
    };
    await sendVerificationEmail(db, { id, name: input.name, email: input.email }).catch((error) => {
      console.error('[auth] no se pudo enviar la verificación:', error);
    });
    const token = createSession(db, id);
    setSessionCookie(res, token);
    res.status(201).json({ user });
  });

  router.post('/login', loginIpLimit, loginEmailLimit, async (req, res) => {
    const input = parseWith(loginSchema, req.body);
    const row = db
      .prepare(
        'SELECT id, name, email, password_hash, home_country_code, email_verified_at, created_at FROM users WHERE email = ?',
      )
      .get(input.email) as UserRow | undefined;

    const valid = row ? await verifyPassword(input.password, row.password_hash) : false;
    if (!row || !valid) {
      throw new HttpError(401, 'Email o contraseña incorrectos.', { code: 'BAD_CREDENTIALS' });
    }

    const token = createSession(db, row.id);
    setSessionCookie(res, token);
    res.json({ user: toAuthUser(row, isConsentRequired(db, row.id)) });
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


  router.post('/forgot-password', forgotLimit, forgotEmailLimit, async (req, res) => {
    const input = parseWith(emailOnlySchema, req.body);
    const row = db
      .prepare('SELECT id, name, email FROM users WHERE email = ?')
      .get(input.email) as { id: string; name: string; email: string } | undefined;
    if (row) {
      const token = issueAuthToken(db, row.id, 'reset_password');
      const message = resetEmail(row.name, token);
      message.to = row.email;
      await sendMail(message).catch((error) => {
        console.error('[auth] no se pudo enviar el reset:', error);
      });
    }
    res.json({ ok: true });
  });

  router.post('/reset-password', tokenLimit, async (req, res) => {
    const input = parseWith(resetSchema, req.body);
    const consumed = consumeAuthToken(db, input.token, 'reset_password');
    if (!consumed) {
      throw new HttpError(400, 'El enlace no es válido o ha caducado.', {
        code: 'INVALID_TOKEN',
      });
    }
    const passwordHash = await hashPassword(input.password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      passwordHash,
      consumed.userId,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(consumed.userId);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.post('/verify-email', tokenLimit, (req, res) => {
    const input = parseWith(tokenSchema, req.body);
    const consumed = consumeAuthToken(db, input.token, 'verify_email');
    if (!consumed) {
      throw new HttpError(400, 'El enlace no es válido o ha caducado.', {
        code: 'INVALID_TOKEN',
      });
    }
    markEmailVerified(db, consumed.userId);
    res.json({ ok: true });
  });

  router.post('/resend-verification', resendLimit, requireAuth(db), async (_req, res) => {
    const user = currentUser(res);
    if (user.emailVerified) {
      throw new HttpError(400, 'Tu email ya está verificado.', { code: 'EMAIL_VERIFIED' });
    }
    await sendVerificationEmail(db, user);
    res.json({ ok: true });
  });

  return router;
}
