import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ignoredDirs = new Set(['node_modules', 'dist', 'data', '.git']);
const extensions = new Set(['.ts', '.tsx', '.md', '.html']);
const extraFiles = ['README.md', 'index.html', 'vite.config.ts'];

// Formas de voseo rioplatense que no queremos que vuelvan a la interfaz.
const voseo = new RegExp(
  String.raw`(?<![\p{L}\p{N}_])(?:` +
    [
      'tocá',
      'iniciá',
      'probá',
      'sumá',
      'elegí',
      'elegís',
      'revisá',
      'intentá',
      'ingresá',
      'poné',
      'compartí',
      'unite',
      'arrastrá',
      'pellizcá',
      'volvé',
      'guardá',
      'agregá',
      'marcá',
      'quitá',
      'creá',
      'completá',
      'seleccioná',
      'buscá',
      'enviá',
      'verificá',
      'esperá',
      'aceptá',
      'escribí',
      'cargá',
      'subí',
      'pensá',
      'decime',
      'contame',
      'fijate',
      'andá',
      'mirá',
      'dejá',
      'usá',
      'hacé',
      'pegá',
      'reuní',
      'entrá',
      'armá',
      'empezá',
      'activá',
      'recargá',
      'quedate',
      'acordate',
      'copiá',
      'colocá',
      'comparen',
      'empiecen',
      'miren',
      'marquen',
      'sos',
      'tenés',
      'podés',
      'querés',
      'sabés',
      'formás',
      'vivís',
      'necesitás',
      'acá',
      'vos',
    ].join('|') +
    String.raw`)(?![\p{L}\p{N}_])`,
  'iu',
);

function collectFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.chrome-')) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) files.push(...collectFiles(fullPath));
    } else if (extensions.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

test('la interfaz usa tuteo castellano y no vuelve al voseo', () => {
  const files = [
    ...collectFiles(join(root, 'src')),
    ...collectFiles(join(root, 'server')),
    ...collectFiles(join(root, 'shared')),
    ...extraFiles.map((file) => join(root, file)),
  ];
  const findings: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    content.split('\n').forEach((line, index) => {
      if (voseo.test(line)) {
        findings.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(findings, [], `Quedó voseo en el copy:\n${findings.join('\n')}`);
});
