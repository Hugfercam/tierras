/**
 * Captura las pantallas de registro y login sin sesión, y restaura la demo.
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
async function waitFor(expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(250);
  }
  throw new Error(`Timeout: ${expression}`);
}
async function shot(name) {
  await sleep(700);
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(name, Buffer.from(data, 'base64'));
  console.log('Captura:', name);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.clearBrowserCookies');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});
await send('Page.navigate', { url: `${BASE_URL}/registro` });
await waitFor(`Boolean(document.querySelector('.auth-form'))`);
await shot('capture-register.png');

await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await send('Page.navigate', { url: `${BASE_URL}/login` });
await waitFor(`Boolean(document.querySelector('.auth-form'))`);
await shot('capture-login-mobile.png');

await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await evaluate(
  `fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'lucia@tierras.app',password:'viajar2026'})})`,
);
await send('Page.navigate', { url: `${BASE_URL}/mapa` });
await waitFor(`Boolean(document.querySelector('.map-stage canvas'))`);
socket.close();
