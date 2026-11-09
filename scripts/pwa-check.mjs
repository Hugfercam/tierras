/**
 * Comprueba manifiesto, instalabilidad y service worker con DevTools.
 */
const CDP_PORT = 9222;
const BASE_URL = 'http://127.0.0.1:3001';
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
  return result.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `${BASE_URL}/mapa` });
await new Promise((resolve) => setTimeout(resolve, 2500));
await send('Page.reload', { ignoreCache: false });
await new Promise((resolve) => setTimeout(resolve, 2500));

const manifest = await send('Page.getAppManifest');
const installability = await send('Page.getInstallabilityErrors');
const sw = await evaluate(`
  navigator.serviceWorker.getRegistrations().then((regs) =>
    regs.map((reg) => ({
      scope: reg.scope,
      active: Boolean(reg.active),
      controlled: Boolean(navigator.serviceWorker.controller)
    }))
  )
`);
console.log('Manifiesto:', manifest.url);
console.log('Errores del manifiesto:', manifest.errors);
console.log('Errores de instalabilidad:', installability.installabilityErrors);
console.log('Service workers:', JSON.stringify(sw));
socket.close();
