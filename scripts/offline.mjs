/**
 * Verifica la lectura offline de la PWA con el service worker en producción.
 */
const CDP_PORT = 9222;
const BASE_URL = 'http://127.0.0.1:3001';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.startsWith(BASE_URL));
if (!page) throw new Error('No hay pestaña de la app.');
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
  }
});
const send = (method, params = {}) => {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
async function waitFor(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(300);
  }
  return false;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

const online = await evaluate(`fetch('/api/auth/me').then((r) => r.ok)`);
if (!online) {
  await evaluate(
    `fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'lucia@tierras.app',password:'viajar2026'})})`,
  );
}
await send('Page.navigate', { url: `${BASE_URL}/mapa` });
await waitFor(`Boolean(document.querySelector('.map-stage canvas'))`);
await sleep(1200);
await send('Page.reload', { ignoreCache: false });
await waitFor(`Boolean(document.querySelector('.map-stage canvas'))`);
await sleep(2000);

const controlled = await waitFor(
  `navigator.serviceWorker && navigator.serviceWorker.controller !== null`,
  10000,
);
const currentGroup = await evaluate(
  `fetch('/api/groups').then((r) => r.json()).then((data) => data.groups[0]?.id || null)`,
);
if (currentGroup) {
  await evaluate(`fetch('/api/groups/' + ${JSON.stringify(currentGroup)}).then((r) => r.json())`);
}
console.log('SW controla la página:', controlled, '| Grupo cacheado:', currentGroup);
await sleep(1000);

await send('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
});
await send('Page.reload', { ignoreCache: false });
const loaded = await waitFor(`Boolean(document.querySelector('.map-stage canvas'))`, 20000);
const offlineBadge = await waitFor(`Boolean(document.querySelector('.offline-badge'))`, 6000);
const heading = await evaluate(`document.querySelector('.map-titles h1')?.textContent || ''`);
const loggedOut = await evaluate(`Boolean(document.querySelector('.auth-form'))`);
console.log(
  `Offline → app cargada: ${loaded} | badge: ${offlineBadge} | grupo: ${heading} | login: ${loggedOut}`,
);

await sleep(500);
const { data } = await send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: true,
  captureBeyondViewport: false,
});
const { writeFile } = await import('node:fs/promises');
await writeFile('capture-offline.png', Buffer.from(data, 'base64'));
console.log('Captura: capture-offline.png');

await send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
});
socket.close();
