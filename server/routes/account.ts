import { Router } from 'express';
import { z } from 'zod';
import { isCountryCode } from '../../shared/countries.ts';
import { clearSessionCookie, currentUser, requireAuth } from '../auth.ts';
import { sendVerificationEmail } from '../auth-tokens.ts';
import type { Database } from '../db.ts';
import { parseWith } from '../errors.ts';
import {
  acceptCurrentConsents,
  accountConsentStatus,
  deleteAccount,
  exportAccount,
  updateAccount,
} from '../account-service.ts';

const updateSchema = z
  .object({
    name: z.string().trim().min(2, 'Introduce tu nombre.').max(60, 'Máximo 60 caracteres.').optional(),
    email: z.string().trim().email('Introduce un email válido.').max(160).optional(),
    homeCountryCode: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isCountryCode, 'Elige un país válido.')
      .optional(),
    currentPassword: z.string().min(1, 'Introduce tu contraseña actual.'),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.email !== undefined ||
      value.homeCountryCode !== undefined,
    {
    message: 'Indica al menos un dato para cambiar.',
  });

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Introduce tu contraseña actual.'),
});

export function accountRoutes(db: Database): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(db));

  router.get('/export', (_req, res) => {
    const user = currentUser(res);
    const data = exportAccount(db, user.id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tierras-datos-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.send(JSON.stringify(data, null, 2));
  });

  router.patch('/', async (req, res) => {
    const user = currentUser(res);
    const input = parseWith(updateSchema, req.body);
    const updated = await updateAccount(db, user.id, input);
    if (!updated.emailVerified) {
      await sendVerificationEmail(db, updated).catch((error) => {
        console.error('[account] no se pudo enviar la verificación:', error);
      });
    }
    res.json({ user: updated });
  });

  router.delete('/', async (req, res) => {
    const user = currentUser(res);
    const input = parseWith(passwordSchema, req.body);
    await deleteAccount(db, user.id, input.currentPassword);
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.get('/consent', (_req, res) => {
    const user = currentUser(res);
    res.json(accountConsentStatus(db, user.id));
  });

  router.post('/consent', (_req, res) => {
    const user = currentUser(res);
    res.json(acceptCurrentConsents(db, user.id));
  });

  return router;
}
