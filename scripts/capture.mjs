/**
 * Captura pantallas de la app en Chrome headless usando el protocolo DevTools.
 * Uso: node scripts/capture.mjs [--mobile]
 * Requiere Chrome con --remote-debugging-port=9222 y el servidor en :3001.
 */
const CDP_PORT = 9222;
const BASE_URL = 'http://127.0.0.1:3001';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find(
  (target) => target.type === 'page' && target.url.startsWith(BASE_URL),
);
if (!page) throw new Error('No hay una pestaña de la app en Chrome.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    console.error('[browser exception]', message.params.exceptionDetails?.text, message.params.exceptionDetails?.exception?.description);
  }
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
    console.error(`[browser ${message.params.type}]`, message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  }
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(300);
  }
  throw new Error(`Timeout esperando: ${expression}`);
}

async function setViewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
}

async function screenshot(name, width, height, mobile = false) {
  await setViewport(width, height, mobile);
  await sleep(600);
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(name, Buffer.from(data, 'base64'));
  console.log(`Captura: ${name}`);
}

async function navigate(path, selector = 'main') {
  await send('Page.navigate', { url: `${BASE_URL}${path}` });
  await sleep(1200);
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, 20000);
  await sleep(1200);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.clearBrowserCache');
await send('Storage.clearDataForOrigin', {
  origin: BASE_URL,
  storageTypes: 'service_workers,cache_storage,local_storage',
});
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});

const loggedIn = await evaluate(`fetch('/api/auth/me').then((r) => r.ok)`);
if (!loggedIn) {
  await evaluate(`
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'lucia@tierras.app', password: 'viajar2026' })
    }).then((r) => r.json())
  `);
}

await navigate('/mapa', '.map-stage canvas');
await screenshot('capture-map.png', 1440, 1000);

await navigate('/panel', '.stat-grid');
await screenshot('capture-dashboard.png', 1440, 1000);

await navigate('/ranking', '.podium');
await screenshot('capture-ranking.png', 1440, 1000);

await navigate('/grupo', '.invite-card');
await screenshot('capture-group.png', 1440, 1000);

await navigate('/mapa', '.map-stage canvas');
await screenshot('capture-map-mobile.png', 390, 844, true);

socket.close();
