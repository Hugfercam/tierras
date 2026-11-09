import { existsSync } from 'node:fs';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const { createApp } = await import('./app.ts');

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';
const dbFile = process.env.DB_PATH || 'data/tierras.db';
const demoMode = process.env.SEED_DEMO === 'true';

const { app, db } = createApp({
  dbFile,
  demoMode,
  seedDemo: demoMode,
  serveStatic: true,
});

const server = app.listen(port, host, () => {
  console.log(`Tierras API escuchando en http://${host}:${port}`);
  if (demoMode) {
    console.log('Modo demo activo: lucia@tierras.app / viajar2026');
  }
});

function shutdown(signal: string): void {
  console.log(`\n${signal} recibido, cerrando...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
