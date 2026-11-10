import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireConsent } from '../auth.ts';
import type { Database } from '../db.ts';
import { HttpError, parseWith } from '../errors.ts';
import {
  addVisitCity,
  createGroup,
  createVisit,
  deleteVisit,
  deleteVisitCity,
  getGroupOverview,
  joinGroup,
  listGroups,
} from '../group-service.ts';
import { normalizeInviteCode } from '../invite.ts';

const groupNameSchema = z
  .string()
  .trim()
  .min(2, 'Pon un nombre de al menos 2 caracteres.')
  .max(60, 'Máximo 60 caracteres.');

const createGroupSchema = z.object({
  name: groupNameSchema,
});

const joinGroupSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(4, 'Introduce el código de invitación.')
    .max(14, 'El código es demasiado largo.')
    .transform(normalizeInviteCode),
});

const latestAllowedDate = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha con formato AAAA-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Esa fecha no existe.')
  .refine((value) => value >= '1950-01-01', 'La fecha no puede ser anterior a 1950.')
  .refine((value) => value <= latestAllowedDate(), 'Todavía no puedes marcar una fecha futura.');

const createVisitSchema = z
  .object({
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'País inválido.'),
    cityName: z.string().trim().max(80, 'Máximo 80 caracteres.').optional().nullable(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    visitedAt: dateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.lat === undefined) !== (value.lng === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['lat'],
        message: 'Latitud y longitud deben ir juntas.',
      });
    }
  });

const addVisitCitySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Introduce el nombre de la ciudad.')
      .max(80, 'Máximo 80 caracteres.'),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.lat === undefined) !== (value.lng === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['lat'],
        message: 'Latitud y longitud deben ir juntas.',
      });
    }
  });

export function groupRoutes(db: Database): Router {
  const router = Router();
  router.use(requireAuth(db));
  router.use(requireConsent());

  router.get('/', (_req, res) => {
    const user = currentUser(res);
    res.json({ groups: listGroups(db, user.id) });
  });

  router.post('/', (req, res) => {
    const user = currentUser(res);
    const input = parseWith(createGroupSchema, req.body);
    const group = createGroup(db, user.id, input.name);
    res.status(201).json({ group });
  });

  router.post('/join', (req, res) => {
    const user = currentUser(res);
    const input = parseWith(joinGroupSchema, req.body);
    const group = joinGroup(db, user.id, input.inviteCode);
    res.json({ group });
  });

  router.get('/:groupId', (req, res) => {
    const user = currentUser(res);
    const overview = getGroupOverview(db, req.params.groupId, user.id);
    res.json(overview);
  });

  router.post('/:groupId/visits', (req, res) => {
    const user = currentUser(res);
    const input = parseWith(createVisitSchema, req.body);
    const visit = createVisit(db, req.params.groupId, user.id, {
      countryCode: input.countryCode,
      cityName: input.cityName,
      lat: input.lat,
      lng: input.lng,
      visitedAt: input.visitedAt || new Date().toISOString().slice(0, 10),
    });
    res.status(201).json({ visit });
  });

  router.post('/:groupId/visits/:visitId/cities', (req, res) => {
    const user = currentUser(res);
    const input = parseWith(addVisitCitySchema, req.body);
    const city = addVisitCity(db, req.params.groupId, user.id, req.params.visitId, input);
    res.status(201).json({ city });
  });

  router.delete('/:groupId/visits/:visitId/cities/:cityId', (req, res) => {
    const user = currentUser(res);
    deleteVisitCity(
      db,
      req.params.groupId,
      user.id,
      req.params.visitId,
      req.params.cityId,
    );
    res.status(204).end();
  });

  router.delete('/:groupId/visits/:visitId', (req, res) => {
    const user = currentUser(res);
    deleteVisit(db, req.params.groupId, user.id, req.params.visitId);
    res.status(204).end();
  });

  router.use((_req, _res, next) => {
    next(new HttpError(404, 'Ruta no encontrada.', { code: 'NOT_FOUND' }));
  });

  return router;
}
