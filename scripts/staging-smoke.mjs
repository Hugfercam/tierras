const baseUrl = (process.env.STAGING_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');

const checks = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
  } catch (error) {
    checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

async function expectStatus(path, status = 200) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  if (response.status !== status) {
    throw new Error(`${path}: esperaba ${status}, recibí ${response.status}`);
  }
  return response;
}

await check('health', async () => {
  const response = await expectStatus('/api/health');
  const body = await response.json();
  if (body.ok !== true) throw new Error('health no devuelve ok=true');
  return 'ok';
});

await check('config sin demo', async () => {
  const response = await expectStatus('/api/config');
  const body = await response.json();
  if (body.demoMode) throw new Error('staging no debe tener demoMode activo');
  return 'demoMode=false';
});

await check('manifest', async () => {
  const response = await expectStatus('/manifest.webmanifest');
  const body = await response.json();
  if (body.start_url !== '/pasaporte') throw new Error(`start_url inesperado: ${body.start_url}`);
  return body.name;
});

await check('shell de privacidad', async () => {
  const response = await expectStatus('/privacidad');
  if (!response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('no devuelve HTML');
  }
  return '200 text/html';
});

await check('registro público', async () => {
  const response = await expectStatus('/registro');
  const html = await response.text();
  if (!html.includes('Tierras')) throw new Error('no contiene la marca');
  return 'renderiza';
});

await check('sesión anónima', async () => {
  await expectStatus('/api/auth/me', 401);
  return '401';
});

for (const item of checks) {
  console.log(`${item.ok ? 'OK' : 'FALLO'}  ${item.name}: ${item.detail}`);
}

if (checks.some((item) => !item.ok)) {
  process.exitCode = 1;
} else {
  console.log(`\nStaging responde en ${baseUrl}`);
}
