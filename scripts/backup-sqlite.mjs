import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const source = resolve(process.env.DB_PATH || 'data/tierras.db');
if (!existsSync(source)) {
  console.error(`No existe la base ${source}`);
  process.exit(1);
}

const backupDir = resolve(process.env.BACKUP_DIR || 'backups');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
const destination = resolve(backupDir, `tierras-${stamp}.db`);

const db = new DatabaseSync(source);
try {
  db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
  const check = new DatabaseSync(destination);
  try {
    const integrity = check.prepare('PRAGMA integrity_check').get();
    if (integrity.integrity_check !== 'ok') {
      throw new Error(`integrity_check: ${integrity.integrity_check}`);
    }
  } finally {
    check.close();
  }
} finally {
  db.close();
}

console.log(`Backup verificado: ${destination}`);
