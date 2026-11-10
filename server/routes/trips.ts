import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireConsent } from '../auth.ts';
import type { Database } from '../db.ts';
import { parseWith } from '../errors.ts';
import {
  acceptTripInvitation,
  createTrip,
  deleteTrip,
  getPersonalOverview,
  leaveTrip,
  listPendingInvitations,
  listTripsForUser,
  loadTripsForUsers,
  rejectTripInvitation,
  updateTrip,
} from '../trip-service.ts';

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha con formato AAAA-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Esa fecha no existe.');

const stopSchema = z
  .object({
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'País inválido.'),
    cityName: z.string().trim().max(80, 'Máximo 80 caracteres.').optional().nullable(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    startDate: isoDate.optional().nullable(),
    endDate: isoDate.optional().nullable(),
    note: z.string().trim().max(500, 'Máximo 500 caracteres.').optional().nullable(),
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

const tripSchema = z
  .object({
    title: z.string().trim().max(100, 'Máximo 100 caracteres.').optional().nullable(),
    startDate: isoDate,
    endDate: isoDate,
    visibility: z.enum(['private', 'group']).optional(),
    stops: z.array(stopSchema).min(1, 'Añade al menos una parada.').max(50, 'Máximo 50 paradas.'),
    participantIds: z.array(z.string().min(1)).max(50).optional(),
  })
  .refine((value) => value.startDate <= value.endDate, {
    path: ['endDate'],
    message: 'La fecha de fin no puede ser anterior a la de inicio.',
  });

export function tripRoutes(db: Database): Router {
  const router = Router();
  router.use(requireAuth(db));
  router.use(requireConsent());

  router.get('/', (_req, res) => {
    const user = currentUser(res);
    res.json({ trips: listTripsForUser(db, user.id) });
  });

  router.get('/:tripId', (req, res) => {
    const user = currentUser(res);
    const trip = loadTripsForUsers(db, [user.id], user.id).find(
      (item) => item.id === req.params.tripId,
    );
    if (!trip) {
      res.status(404).json({ error: 'No encontramos ese viaje.' });
      return;
    }
    res.json({ trip });
  });

  router.post('/', (req, res) => {
    const user = currentUser(res);
    const input = parseWith(tripSchema, req.body);
    const trip = createTrip(db, user.id, input);
    res.status(201).json({ trip });
  });

  router.patch('/:tripId', (req, res) => {
    const user = currentUser(res);
    const input = parseWith(tripSchema, req.body);
    const trip = updateTrip(db, user.id, req.params.tripId, input);
    res.json({ trip });
  });

  router.delete('/:tripId', (req, res) => {
    const user = currentUser(res);
    deleteTrip(db, user.id, req.params.tripId);
    res.status(204).end();
  });

  return router;
}

export function meRoutes(db: Database): Router {
  const router = Router();
  router.use(requireAuth(db));
  router.use(requireConsent());

  router.get('/overview', (_req, res) => {
    const user = currentUser(res);
    res.json(getPersonalOverview(db, user.id));
  });

  router.get('/invitations', (_req, res) => {
    const user = currentUser(res);
    res.json({ invitations: listPendingInvitations(db, user.id) });
  });

  router.post('/invitations/:tripId/accept', (req, res) => {
    const user = currentUser(res);
    const trip = acceptTripInvitation(db, user.id, req.params.tripId);
    res.json({ trip });
  });

  router.post('/invitations/:tripId/reject', (req, res) => {
    const user = currentUser(res);
    rejectTripInvitation(db, user.id, req.params.tripId);
    res.status(204).end();
  });

  router.delete('/trips/:tripId/participation', (req, res) => {
    const user = currentUser(res);
    leaveTrip(db, user.id, req.params.tripId);
    res.status(204).end();
  });

  return router;
}
