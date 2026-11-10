import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { TOTAL_COUNTRIES } from '../shared/countries.ts';
import { openDatabase, type Database } from './db.ts';
import { HttpError } from './errors.ts';
import { accountRoutes } from './routes/account.ts';
import { authRoutes } from './routes/auth.ts';
import { groupRoutes } from './routes/groups.ts';
import { meRoutes, tripRoutes } from './routes/trips.ts';
import { DEMO_ACCOUNT } from './seed.ts';

export interface AppOptions {
  dbFile: string;
  seedDemo?: boolean;
  demoMode?: boolean;
  serveStatic?: boolean;
  staticDir?: string;
}

export interface AppBundle {
  app: express.Express;
  db: Database;
}

export function createApp(options: AppOptions): AppBundle {
  const demoMode = options.demoMode ?? false;
  const db = openDatabase({
    file: options.dbFile,
    seedDemo: options.seedDemo ?? demoMode,
  });
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });

  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    const origin = req.get('origin');
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = '';
      }
      if (!originHost || originHost !== req.get('host')) {
        res.status(403).json({ error: 'Origen no permitido.', code: 'BAD_ORIGIN' });
        return;
      }
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      appName: 'Tierras',
      totalCountries: TOTAL_COUNTRIES,
      demoMode,
      demoAccount: demoMode ? DEMO_ACCOUNT : null,
    });
  });

  app.use('/api/auth', authRoutes(db));
  app.use('/api/account', accountRoutes(db));
  app.use('/api/groups', groupRoutes(db));
  app.use('/api/trips', tripRoutes(db));
  app.use('/api/me', meRoutes(db));

  app.use('/api', (_req, _res, next) => {
    next(new HttpError(404, 'Ruta no encontrada.', { code: 'NOT_FOUND' }));
  });

  if (options.serveStatic !== false) {
    const staticDir = options.staticDir ?? resolve(process.cwd(), 'dist');
    if (existsSync(staticDir)) {
      app.use(
        express.static(staticDir, {
          index: false,
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
              res.setHeader('Cache-Control', 'no-cache');
            }
          },
        }),
      );
      app.use((req, res, next) => {
        if (req.method !== 'GET' || !req.accepts('html')) {
          next();
          return;
        }
        res.sendFile(resolve(staticDir, 'index.html'));
      });
    }
  }

  app.use((req, _res, next) => {
    next(new HttpError(404, `No encontramos ${req.path}.`, { code: 'NOT_FOUND' }));
  });

  app.use(errorHandler);

  return { app, db };
}

function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.', code: 'BAD_JSON' });
    return;
  }

  console.error('[api] error no controlado:', error);
  res.status(500).json({
    error: 'Algo salió mal de nuestro lado. Intenta de nuevo.',
    code: 'INTERNAL_ERROR',
  });
}
