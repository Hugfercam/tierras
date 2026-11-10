/**
 * Verifica la baliza de ciudad abierta desde el buscador.
 */
const CDP_PORT = 9222;
const BASE_URL = 'http://127.0.0.1:3001';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.startsWith(BASE_URL));
if (!page) throw new Error('No hay pestaña.');
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
  if (message.method === 'Runtime.exceptionThrown') {
    console.error('[browser exception]', message.params.exceptionDetails?.text);
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
await send('Network.clearBrowserCache');
await send('Storage.clearDataForOrigin', {
  origin: BASE_URL,
  storageTypes: 'service_workers,cache_storage,local_storage',
});
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});

const loggedIn = await evaluate(`fetch('/api/auth/me').then((r) => r.ok)`);
if (!loggedIn) {
  await evaluate(
    `fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'lucia@tierras.app',password:'viajar2026'})})`,
  );
}
await send('Page.navigate', { url: `${BASE_URL}/mapa?vista=grupo` });
await waitFor(`Boolean(document.querySelector('.map-stage canvas'))`);
await sleep(1200);

await evaluate(`
  (() => {
    const input = document.querySelector('.place-search__input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Bruselas');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  })()
`);
await waitFor(`Boolean(document.querySelector('.place-result'))`);
await evaluate(`
  [...document.querySelectorAll('.place-result')].find((el) => el.textContent.includes('Bruselas'))?.click()
`);
await waitFor(`Boolean(document.querySelector('.city-beacon'))`);
await shot('capture-beacon.png');

await evaluate(`document.querySelector('.city-layer-toggle')?.click()`);
await waitFor(`!document.querySelector('.city-beacon')`);
await sleep(400);
await shot('capture-beacon-off.png');
console.log('Toggle de ciudades:', await evaluate(`document.querySelector('.city-layer-toggle')?.getAttribute('aria-checked')`));

socket.close();
