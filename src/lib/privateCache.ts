/**
 * Las respuestas autenticadas viven en Cache Storage para permitir lectura offline.
 * Hay que borrarlas al cerrar sesión o al cambiar de cuenta.
 */
export async function clearPrivateApiCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith('tierras-api')).map((key) => caches.delete(key)),
    );
  } catch {
    // Algunos navegadores en modo privado bloquean Cache Storage; no es fatal.
  }
}
