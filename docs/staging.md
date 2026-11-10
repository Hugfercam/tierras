# Staging

Entorno de validación previo a producción. No debe compartir base de datos ni cookies con producción.

## Requisitos

- Node 24+.
- Docker y Docker Compose si se usa el contenedor; también se puede ejecutar en nativo.
- Un dominio o URL de staging y, preferiblemente, HTTPS.
- Datos reales del responsable para `VITE_LEGAL_*`.

Estudio de proveedores y costes: [estudio-staging.md](estudio-staging.md).

## 1. Configuración

```powershell
Copy-Item .env.staging.example .env.staging
```

Completa en `.env.staging`:

- `VITE_LEGAL_NAME`, `VITE_LEGAL_NIF`, `VITE_LEGAL_ADDRESS`, `VITE_LEGAL_EMAIL`, `VITE_LEGAL_HOSTING`, `VITE_LEGAL_COUNTRY`.
- `COOKIE_SECURE=true` si staging se sirve por HTTPS.
- `PORT=3002` para staging local, o el puerto que uses.
- `SEED_DEMO=false`. No uses la cuenta demo en staging.

`.env.staging` está ignorado por Git.

## 2. Staging en nativo

```powershell
npm ci
npm run build:staging
npm run staging:local
```

En otra terminal:

```powershell
npm run smoke:staging
```

La app queda en `http://127.0.0.1:3002`.

El build de Vite lee `.env.staging` mediante `--mode staging`. El servidor carga el mismo archivo porque `staging:local` define `ENV_FILE=.env.staging`.

## 3. Staging con Docker

```powershell
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build
docker compose -f docker-compose.staging.yml ps
$env:STAGING_URL='http://127.0.0.1:3002'; npm run smoke:staging
```

El contenedor usa el puerto interno `3001` y publica `3002`. La base vive en el volumen `tierras-staging-data`, separado del volumen de producción.

Para recrear la base de staging:

```powershell
docker compose -f docker-compose.staging.yml down -v
```

No ejecutes ese comando contra producción.

## 4. HTTPS y cookies seguras

En staging real:

1. Pon Caddy, Nginx o el proxy del proveedor delante de la app.
2. Sirve el dominio por HTTPS.
3. Configura `COOKIE_SECURE=true` y reconstruye.
4. Comprueba que la cookie `tierras_session` tiene `Secure`, `HttpOnly` y `SameSite=Lax`.

Sin HTTPS, deja `COOKIE_SECURE=false` solo en local. Nunca en producción.

## 4.1 Email

Configura en `.env.staging`:

- `APP_URL` con la URL pública de staging.
- `EMAIL_WEBHOOK_URL` con el endpoint del proveedor (Resend, Postmark o similar).
- `EMAIL_WEBHOOK_TOKEN` si el proveedor usa Bearer.
- `EMAIL_CONSOLE=false` para no imprimir enlaces con tokens en logs.

Sin `EMAIL_WEBHOOK_URL`, la app imprime el email en consola solo en desarrollo. En producción no se envía nada.

Prueba:

1. Registrar una cuenta.
2. Abrir el enlace de verificación.
3. Pedir recuperación de contraseña.
4. Confirmar que el enlace caduca y que las sesiones se revocan al cambiar la contraseña.

## 4.2 Backups

```powershell
npm run backup
```

Crea `backups/tierras-<fecha>.db` con `VACUUM INTO` y verifica `PRAGMA integrity_check`. Programa el comando a diario y copia el resultado fuera del servidor. Prueba una restauración en staging antes de producción.


## 5. Smoke test

`npm run smoke:staging` comprueba:

- `/api/health`;
- `/api/config` sin modo demo;
- manifest con `start_url=/pasaporte`;
- `/privacidad` pública;
- `/registro` público;
- `/api/auth/me` devuelve 401 sin sesión.

## 6. Checklist de staging

- [ ] `SEED_DEMO=false`.
- [ ] Datos legales reales en `.env.staging`.
- [ ] `/privacidad`, `/terminos` y `/cookies` sin aviso de “Pendiente de configurar”.
- [ ] HTTPS y `COOKIE_SECURE=true`.
- [ ] Registro con consentimiento y gate de `/consentimiento`.
- [ ] Exportación JSON y eliminación de cuenta.
- [ ] Transferencia de grupo al eliminar la cuenta propietaria.
- [ ] PWA instalable y offline.
- [ ] Backup de staging probado y restauración ensayada.
- [ ] Email de verificación y recuperación probados.
- [ ] Rate limiting probado con varios intentos.
- [ ] Logs sin datos personales.

## 7. Límites

Staging no certifica RGPD por sí solo. Antes de producción siguen pendientes:

- contrato de encargado con el hosting;
- proveedor de email y plantillas definitivas;
- política de backups y restauración;
- revisión legal de los textos y datos del responsable.
