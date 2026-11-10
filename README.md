# Tierras

**El mapa de viajes privado de tu grupo.** Una PWA donde amigos, familiares o cualquier grupo cerrado marcan los países que visitaron, ven el recorrido colectivo en un globo 3D y comparan sus métricas.

Primera versión funcional: globo interactivo, grupos con invitaciones, panel personal, ranking, búsqueda de países y ciudades, y lectura offline.

![Mapa compartido de Los Trotamundos](docs/screenshots/map.webp)

| Panel personal | Ranking |
| --- | --- |
| ![Panel personal](docs/screenshots/dashboard.webp) | ![Ranking del grupo](docs/screenshots/ranking.webp) |

| Grupo e invitaciones | Vista móvil |
| --- | --- |
| ![Grupo e invitaciones](docs/screenshots/group.webp) | ![Mapa en móvil](docs/screenshots/mobile.webp) |

---

## 1. Arquitectura y stack

### Stack elegido

| Capa | Tecnología | Por qué |
| --- | --- | --- |
| Frontend | React 19 + TypeScript + Vite | Componentes modulares, tipado compartido y build rápido de una SPA/PWA. |
| Globo 3D | Three.js + `OrbitControls` | Control fino de esfera, luces, raycasting y textura; no depende de mapas, APIs ni claves externas. |
| Datos geográficos | `world-atlas` 50m + `world-countries` + `all-the-cities` | Fronteras Natural Earth simplificadas, nombres/regiones y ciudades con población, todo empaquetado. |
| Backend | Node.js 24 + Express 5 | API pequeña y suficiente; Node 24 ejecuta TypeScript nativo y trae `node:sqlite`. |
| Base de datos | SQLite (`node:sqlite`) | Persistencia real sin servicio externo, transacciones y despliegue de un solo proceso. |
| Estado remoto | TanStack Query | Cache en memoria, invalidación tras mutaciones y reutilización entre mapa, panel y ranking. |
| PWA | `vite-plugin-pwa` + Workbox | Manifest, service worker, precache y estrategia NetworkFirst para la API. |
| Estilos | CSS propio con tokens | Diseño controlado, liviano y sin dependencia de un framework CSS. |

No hay proveedor de mapas, geocodificación ni autenticación externos. Eso mantiene la primera versión desplegable en un único servidor y permite que mapa y buscador funcionen sin red.

### Estructura

```
.
├── server/
│   ├── app.ts                 # Express, seguridad, API y estáticos
│   ├── db.ts                  # SQLite y migraciones versionadas
│   ├── auth.ts                # scrypt, sesiones y cookies
│   ├── group-service.ts       # grupos, visitas y métricas
│   ├── seed.ts                # datos demo idempotentes
│   ├── invite.ts              # códigos de invitación
│   └── routes/                # auth y grupos
├── shared/
│   ├── data/countries.ts      # 197 destinos generados
│   ├── countries.ts           # helpers de país
│   ├── geo.ts                 # Haversine y métricas
│   ├── leaderboard.ts         # criterios y desempates
│   └── types.ts               # contratos API
├── src/
│   ├── components/            # mapa, grupo, layout y UI
│   ├── contexts/              # auth, grupo y toasts
│   ├── lib/
│   │   ├── globeEngine.ts     # escena Three.js
│   │   ├── globeTexture.ts    # textura política generada en canvas
│   │   ├── atlas.ts           # GeoJSON + point-in-polygon
│   │   └── places.ts          # índice de búsqueda local
│   ├── pages/                 # mapa, panel, ranking, grupo, auth
│   └── data/                  # GeoJSON de fronteras y ciudades
├── scripts/                   # generación de datos/iconos y QA visual
├── tests/                     # pruebas de API y métricas
└── public/                    # manifest, iconos y banderas offline
```

### Flujo

1. El cliente consulta `/api/groups` y `/api/groups/:id`; TanStack Query cachea los datos.
2. El globo genera una textura equirectangular en un `<canvas>`: océano, tierra, fronteras y países visitados.
3. Al hacer *raycast* sobre la esfera se convierte el punto a latitud/longitud y `d3-geo` resuelve el país.
4. Las mutaciones (`POST/DELETE`) invalidan las queries del grupo. El servidor recalcula métricas desde visitas y devuelve la copia autoritativa.
5. El service worker precachea shell, fuentes, banderas y bundle; las respuestas GET de la API quedan en un cache NetworkFirst para lectura offline.

---

## 2. Modelo de datos

```sql
users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,           -- scrypt: salt:hash
  home_country_code TEXT NOT NULL,       -- ISO 3166-1 alpha-2
  created_at TEXT NOT NULL
)

groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  invite_code TEXT NOT NULL UNIQUE,      -- 8 caracteres, sin ambigüedad
  created_at TEXT NOT NULL
)

memberships (
  group_id TEXT REFERENCES groups(id),
  user_id TEXT REFERENCES users(id),
  role TEXT CHECK (role IN ('owner', 'member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
)

visits (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES groups(id),
  user_id TEXT REFERENCES users(id),
  country_code TEXT NOT NULL,
  city_name TEXT,                        -- ciudad principal histórica
  lat REAL NOT NULL,                     -- punto de referencia para km
  lng REAL NOT NULL,
  visited_at TEXT NOT NULL,              -- AAAA-MM-DD, primera visita
  created_at TEXT NOT NULL,
  UNIQUE (group_id, user_id, country_code)
)

visit_cities (
  id TEXT PRIMARY KEY,
  visit_id TEXT REFERENCES visits(id) ON DELETE CASCADE,
  city_name TEXT NOT NULL COLLATE NOCASE,
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL,
  UNIQUE (visit_id, city_name)
)

sessions (
  id TEXT PRIMARY KEY,                   -- SHA-256 del token de cookie
  user_id TEXT REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

Decisiones del modelo:

- **Los viajes son por grupo**, no globales. Una misma persona puede marcar Francia en dos grupos distintos. Así cada mapa tiene su propio control colectivo.
- **Un país por persona y grupo**. La restricción `UNIQUE` evita duplicados; para corregir una fecha se quita y se vuelve a marcar.
- **Un país puede tener muchas ciudades visitadas**, guardadas en `visit_cities`. Se agregan y quitan desde la ficha del país, con nombres en español cuando el buscador tiene alias (`Gante`, `Brujas`, `Bruselas`).
- **La ciudad principal es opcional** y actúa como punto representativo para estimar kilómetros. Si no se elige, se usa el centroide del país. Las ciudades adicionales son detalle descriptivo y **no modifican los km ni el ranking**.
- **Migración versionada**: las visitas antiguas con `city_name` se convierten una sola vez en la primera fila de `visit_cities`; la columna original se conserva para compatibilidad. La versión se guarda con `PRAGMA user_version` y una base que ya tenía `visit_cities` se marca como migrada sin volver a hacer el backfill, para no resucitar ciudades borradas.
- **El código de invitación es permanente en esta versión** y lo ven todos los miembros del grupo. No hay enlace con caducidad.
- **Rol**: `owner` identifica al creador; en v1 no hay permisos administrativos especiales más allá de la etiqueta.
- **Sesión**: cookie `HttpOnly`, `SameSite=Lax`, 30 días; el token se guarda hasheado en SQLite.

### Cálculo de kilómetros

Se usa **distancia ortodrómica (great-circle)**, no rutas reales:

1. El punto de partida es el punto registrado en el país base del usuario; si no existe esa visita, el centroide del país elegido al registrarse.
2. Se excluye el registro del país base del cálculo de piernas (marcar tu propio país no suma kilómetros).
3. Las visitas restantes se ordenan por `visited_at` y, para fechas iguales, por `created_at`.
4. Se suman las distancias Haversine entre puntos consecutivos.
5. No se suma el regreso al origen.
6. El resultado se redondea al km entero.

```txt
km = Σ haversine(punto[i-1], punto[i])
```

- Punto de una visita = coordenadas de la ciudad elegida o centroide del país.
- Kilómetros del grupo = **suma de los kilómetros estimados de sus miembros**.
- Ejemplo: base Madrid → Lisboa → París suma dos piernas; no cuenta Madrid → centroide de España ni París → Madrid.

Limitación explícita: no son kilómetros de vuelo ni de ruta por carretera, y no reflejan viajes intermedios no registrados. La UI lo aclara con "estimados" y un tooltip de criterio.

---

## 3. Implementación por módulo

### 3.1 Mapa 3D

- Esfera de Three.js con cámara `PerspectiveCamera` y `OrbitControls` (arrastre, rueda/pellizco, auto-rotación pausable).
- La textura se genera a 3072×1536 px (2048 en pantallas pequeñas) con:
  - océano y retícula;
  - **todas las geometrías** de `world-atlas`, incluidas dependencias no seleccionables, para que no haya huecos de océano sobre tierra;
  - relleno de países visitados: en vista **Grupo** el color indica cuántos miembros lo marcaron (1 → 4+); en vista de un **miembro** se usa su color de identidad;
  - contorno dorado del país seleccionado;
  - puntos para países diminutos o sin polígono propio.
- Click/toque: raycasting → coordenadas esféricas → `d3-geo` `geoContains` → ISO del país.
- Búsqueda: anima la cámara al punto, deja un marcador pulsante y resalta el país.
- Atmósfera con shader, estrellas, anillo orbital decorativo y luces suaves.
- Si WebGL falla, se muestra un estado de error explicativo. No se incluye una segunda proyección porque la vista 3D es la implementación principal de esta versión.

### 3.2 Grupos e invitaciones

- Crear grupo: nombre, código irreversible, membresía `owner` en una transacción.
- Invitar: código de 8 caracteres + enlace `/unirse/:code`; copiar y compartir nativo.
- Unirse por código o enlace; el endpoint normaliza guiones/minúsculas y detecta duplicados.
- Selector de grupo en el header, persistido en `localStorage`.
- Cada grupo aísla visitas, métricas y ranking. Un usuario ajeno recibe 404, nunca datos del grupo.

### 3.3 Ciudades visitadas

- La visita conserva un **punto principal** (`visits.lat/lng`) para los kilómetros y añade una lista de ciudades en `visit_cities`.
- La ficha del país muestra un chip por ciudad debajo de cada viajero.
- En tu propia visita, los chips se pueden quitar y aparece **“+ Añadir ciudad”**.
- El editor busca en el índice local filtrando por país, con alias como `Gante → Gent`, `Brujas → Brugge` y `Bruselas → Brussels`.
- Si una localidad no está en el buscador, se puede escribir libremente y se guarda sin coordenadas.
- Se permiten hasta **20 ciudades por país**; los duplicados no distinguen mayúsculas.
- Todo está dentro de la ficha del país: no se añade otro modal ni se altera el globo.
- Las ciudades se muestran también en el pasaporte del panel personal.
- Añadir o quitar ciudades **no modifica** los países, los kilómetros ni el ranking.

![Ciudades de Bélgica dentro de la ficha del país](docs/screenshots/cities.webp)

#### Puntos en el globo y baliza

- Cada ciudad con coordenadas se dibuja como un **punto pequeño** sobre el globo.
- En vista **Todo el grupo** los puntos son dorados y se agrupan por coordenadas: Bruselas visitada por tres personas es un solo punto.
- En vista de un **miembro** se muestran solo sus ciudades y toman su color de identidad.
- Al hacer click en un punto, la cámara enfoca la ciudad y aparece una **baliza**: bandera, anillo pulsante, nombre de la ciudad y cantidad de viajeros.
- La etiqueta de la baliza abre la ficha del país; la “×” o un click en el océano la cierran.
- Mientras hay una baliza activa se pausa la rotación automática.
- La capa se puede apagar con el interruptor **“Ciudades visitadas”** en la barra lateral.
- Si la ciudad no tiene coordenadas, no se inventa una ubicación: se muestra en la ficha y en el pasaporte, pero no en el mapa.
- Buscar una ciudad ya visitada abre directamente su baliza.
- Los puntos y la baliza son solo visuales: **no alteran kilómetros, países ni ranking**.

![Baliza de Bruselas sobre el globo](docs/screenshots/beacon.webp)

En móvil la ficha del país sigue siendo una hoja inferior y la baliza conserva la etiqueta legible:

![Baliza de ciudad en móvil](docs/screenshots/beacon-mobile.webp)

### 3.4 Panel personal

Métricas derivadas de las visitas del usuario en el grupo activo:

- países visitados;
- kilómetros estimados;
- continentes distintos;
- porcentaje del atlas;
- cobertura por continente;
- actividad de los últimos 12 meses, año con más países y última marca;
- pasaporte con todos los países, ciudades, fecha y acceso al país en el mapa.

### 3.5 Ranking

Tres categorías, con criterio visible en la propia pantalla:

1. **Países visitados**: países distintos por miembro.
2. **Kilómetros estimados**: suma Haversine de sus puntos ordenados por fecha.
3. **Continentes**: continentes distintos con al menos un país.

Desempate: más países → más kilómetros → nombre alfabético. Podio para los tres primeros y tabla completa con tu fila resaltada.

### 3.6 Búsqueda

- Índice local de **197 destinos** y **4.466 ciudades** (capitales + ciudades de 100.000+ habitantes).
- Coincidencia sin acentos y alias en español para países y ciudades frecuentes (`Londres`, `Roma`, `CDMX`, `Holanda`, etc.).
- Teclado: flechas, Enter y Escape; resultados con bandera, país y tipo.
- Seleccionar un país o una ciudad no visitada enfoca el globo y abre la ficha del país; si la ciudad ya está registrada en la capa activa, abre su baliza.
- Funciona sin conexión porque el índice viaja en el bundle.

![Buscador local con Croacia](docs/screenshots/search.webp)

### 3.7 PWA

- Manifest completo con nombre, colores, iconos 192/512/maskable, atajos e `id`.
- Service worker generado por Workbox:
  - precache del shell, CSS/JS, fuentes, banderas y datos;
  - `NetworkFirst` para GET `/api/*` con timeout de 3 s y cache de hasta 30 días;
  - navegación SPA con fallback offline;
  - limpieza de versiones viejas y actualización automática.
- Instalación verificada con errores de manifiesto e instalabilidad vacíos.

**Funciona sin conexión**

- abrir la app instalada y navegar por el shell;
- globo 3D, capas y datos de la última sincronización;
- puntos de ciudades y balizas usando las coordenadas cacheadas;
- panel, ranking y grupo con la copia cacheada;
- búsqueda local de países y ciudades;
- banderas, fuentes e iconos.

**Requiere conexión**

- iniciar sesión o registrarse;
- crear/unirse a un grupo;
- marcar o quitar países;
- añadir o quitar ciudades visitadas;
- compartir una invitación nueva (copiar el enlace funciona offline, pero unirse no);
- cualquier escritura o sincronización. No hay cola offline ni resolución de conflictos en v1.

Al cerrar sesión, expirar la sesión o iniciar sesión con otra cuenta se vacía el cache de API (`tierras-api-*`) para no mezclar datos privados. La UI muestra un aviso "Sin conexión · datos guardados".

El paquete offline pesa ~4,6 MB porque incluye Three.js, el atlas geográfico y 197 banderas SVG; el JS comprimido son ~830 KB.

![Mapa funcionando sin conexión con los datos del grupo](docs/screenshots/offline.webp)

### 3.8 Idioma y copy

- Interfaz en **español de España**, con tuteo: “Toca un país”, “Inicia sesión”, “Prueba de nuevo”.
- Sin voseo rioplatense ni fórmulas de usted; se prefieren términos habituales en España (“móvil”, “añadir”, “introduce tu email”).
- Fechas y números con locale `es-ES`.
- Los mensajes del servidor mantienen **códigos estables** (`ALREADY_MEMBER`, `VALIDATION_ERROR`, etc.) para poder traducirlos en el futuro.
- No hay i18n en v1. Si se añade otro idioma, el camino previsto es `es-ES` como base y una variante regional como `es-AR`, no mezclar registros en la misma interfaz.
- Una prueba automática revisa que no reaparezcan formas de voseo en `src`, `server`, `shared`, `README.md`, `index.html` o `vite.config.ts`.

---

## 4. API

Todas las rutas privadas usan cookie de sesión y comprueban membresía.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/config` | Config pública; en demo devuelve la cuenta de prueba. |
| POST | `/api/auth/register` | Crea usuario y sesión. |
| POST | `/api/auth/login` | Inicia sesión. |
| POST | `/api/auth/logout` | Borra sesión y cookie. |
| GET | `/api/auth/me` | Usuario actual. |
| GET | `/api/groups` | Grupos del usuario con rol y conteos. |
| POST | `/api/groups` | Crea grupo; devuelve código de invitación. |
| POST | `/api/groups/join` | Une por código. |
| GET | `/api/groups/:id` | Overview autoritativo: miembros, visitas, stats. |
| POST | `/api/groups/:id/visits` | Marca país con fecha/ciudad/punto opcional. |
| POST | `/api/groups/:id/visits/:visitId/cities` | Añade una ciudad a la visita propia. |
| DELETE | `/api/groups/:id/visits/:visitId/cities/:cityId` | Quita una ciudad de la visita propia. |
| DELETE | `/api/groups/:id/visits/:visitId` | Quita la visita propia y, en cascada, sus ciudades. |

Errores con `{ error, code, fieldErrors? }`. El servidor valida país, fecha real, fechas futuras, coordenadas, duplicados, pertenencia y origen de mutaciones (`Origin` vs `Host`).

---

## 5. Puesta en marcha

### Requisitos

- Node.js **24+** (por `node:sqlite`, carga de `.env` y ejecución nativa de TypeScript).
- npm 11+.

### Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Vite hace proxy de `/api` a `http://127.0.0.1:3001` y el servidor arranca en modo demo.

Cuenta demo:

```txt
lucia@tierras.app
viajar2026
```

El grupo demo principal es **Los Trotamundos** (4 personas, 25 países compartidos). También existe **Casa Nómada**.

![Pantalla de registro con país base](docs/screenshots/register.webp)

### Build y ejecución

```bash
npm run build
npm start
```

- `npm run build` valida tipos, genera el cliente PWA y los estáticos en `dist/`.
- `npm start` sirve la API y `dist/` en `http://localhost:3001`.
- Al arrancar se crea el esquema base y se ejecutan las migraciones pendientes. La conversión de `visits.city_name` a `visit_cities` está versionada y se aplica una única vez. Haz un backup de la base antes del primer arranque con esta versión.
- El servidor lee `.env` si existe (copia `.env.example`).
- `SEED_DEMO=false` por defecto: una base nueva arranca vacía. Para ver la demo con el build: `npm run start:demo`.
- Si la base ya fue sembrada en desarrollo, los usuarios demo siguen existiendo. **Para un despliegue real, usa una base nueva y `SEED_DEMO=false`.**

### Variables

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `PORT` | `3001` | Puerto HTTP. |
| `HOST` | `0.0.0.0` | Interfaz de escucha. |
| `DB_PATH` | `data/tierras.db` | Archivo SQLite; el directorio se crea solo. |
| `SEED_DEMO` | `false` | Siembra la demo **solo si la base está vacía**. |
| `COOKIE_SECURE` | `false` | Poner `true` con HTTPS. |
| `API_URL` | `http://127.0.0.1:3001` | Solo dev: destino del proxy de Vite. |

### Despliegue con Docker

```bash
docker compose up -d --build
```

Incluye volumen persistente para `/app/data`. El contenedor no publica HTTPS: coloca Nginx, Caddy o Traefik delante y activa `COOKIE_SECURE=true`. El proxy debe preservar el header `Host` porque las mutaciones validan `Origin`.

Ejemplo Nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name tierras.example.com;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Checklist de producción:

1. HTTPS y `COOKIE_SECURE=true`.
2. Volumen persistente para `data/`.
3. `SEED_DEMO=false` y base vacía.
4. Backup de SQLite (`.backup`) y del WAL.
5. Una sola instancia/replica: SQLite en modo WAL no está pensado para varias instancias escribiendo.
6. El service worker exige HTTPS (excepto `localhost`).
7. Tamaño máximo de subida JSON fijado en 100 KB; no hay archivos.

---

## 6. Pruebas

### Automáticas

```bash
npm test
npm run typecheck
npm run build
```

`npm test` ejecuta **15 pruebas** con el runner nativo en modo sin aislamiento (compatible con entornos que bloquean procesos hijos) y cubre:

- Haversine con tolerancia;
- conteo de países/continentes y porcentaje;
- orden cronológico y punto base sin pierna local;
- desempate del ranking;
- flujo API completo: registro, dos usuarios, grupo, invitación con guion, visitas, duplicado 409, métricas, borrado;
- ciudades: alta, listado ordenado, duplicado sin distinguir mayúsculas (409), borrado, cascada al quitar el país y autorización del dueño;
- migración versionada de `visits.city_name` a `visit_cities`, sin restaurar ciudades borradas al reiniciar ni al actualizar una base existente;
- los kilómetros no cambian al agregar ciudades;
- construcción de marcadores de ciudad: agrupación por coordenadas, filtrado por miembro y omisión de ciudades sin ubicación;
- guardia de copy: falla si reaparece una forma de voseo rioplatense en la interfaz o la documentación;
- validación de formularios y aislamiento de grupos ajenos (404).

Verificación PWA realizada en build de producción:

- `Page.getAppManifest` → sin errores;
- `Page.getInstallabilityErrors` → `[]`;
- service worker activo y controlando la página;
- recarga con red emulada offline → globo, datos del grupo y aviso de sin conexión funcionando.

### Checklist manual mínima

1. Abrir `/registro`, crear cuenta con país base y entrar.
2. Crear un grupo; copiar el código.
3. En ventana privada, crear otra cuenta, abrir `/unirse/<código>` y unirse.
4. Marcar un país con una ciudad y una fecha; verlo en el globo y en el panel.
5. Verificar que los km cambian y que el ranking se reordena.
6. Buscar una ciudad, seleccionarla, abrir ficha y marcar el país.
7. En la ficha del país, añadir Gante, Brujas y Bruselas a Bélgica; comprobar los chips y el pasaporte del panel.
8. Cerrar la ficha, hacer click en el punto de Bruselas y comprobar la baliza, la bandera, la etiqueta y el acceso a la ficha.
9. Buscar “Bruselas” y comprobar que abre directamente la baliza; apagar y encender “Ciudades visitadas”.
10. Intentar añadir una ciudad duplicada → mensaje de error; quitar una ciudad y verificar que los km no cambian.
11. Intentar marcar el mismo país otra vez → mensaje de duplicado.
12. Quitar una marca; confirmar que métricas y ranking se recalculan.
13. Instalar la PWA desde el menú del navegador; recargar sin red y comprobar la lectura offline.
14. Intentar marcar un país o editar ciudades sin red → la UI lo impide con aviso.

---

## 7. Supuestos abiertos

Estos puntos no estaban especificados y se resolvieron así para esta v1. Son los primeros a validar:

1. **Autenticación mínima**: email + contraseña, sin verificación de email, recuperación, rate limiting ni segundo factor. Sesiones de 30 días.
2. **Lista canónica de 197 destinos**: Estados miembros de la ONU, observadores permanentes (Vaticano y Palestina), Kosovo y Taiwán. Quedan fuera dependencias y territorios de ultramar como Groenlandia o Puerto Rico, aunque se dibujan en el globo.
3. **Un país, una marca**: no hay historial de múltiples viajes al mismo país. La fecha es la primera visita y no se puede editar (solo quitar y volver a marcar). Las ciudades comparten esa fecha del país.
4. **Ciudades opcionales y abiertas**: no hay catálogo administrativo de todas las ciudades ni geocodificación inversa. El buscador cubre capitales y ciudades de 100.000+ habitantes; las localidades fuera del dataset se pueden escribir libremente, sin coordenadas. Las ciudades sin coordenadas no se dibujan en el globo y no hay clustering avanzado: en zonas densas se elige el punto visible más cercano.
5. **Las ciudades no alteran los km**: el punto principal del país sigue determinando la estimación. Si en el futuro se quieren rutas ciudad a ciudad, habría que cambiar el modelo y recalcular métricas.
6. **País base fijo**: se elige al registrarse y no se puede cambiar en v1. Si el usuario marca su país base con una ciudad, ese punto se usa como origen.
7. **Kilómetros estimados**: no son rutas reales ni incluyen el regreso. El total del grupo es la suma de estimaciones individuales.
8. **Invitaciones permanentes**: cualquier miembro puede compartir el código; no hay expiración, regeneración, aprobación ni límite de usos.
9. **Sin administración de grupo**: no hay transferencia de propiedad, expulsión, abandono, borrado de grupo ni de cuenta.
10. **Offline de solo lectura**: las escrituras requieren red; no hay cola de sincronización ni resolución de conflictos.
11. **Sin notificaciones, chat, fotos ni redes**: intencionalmente fuera de alcance.
12. **Privacidad**: no hay perfiles públicos. Un grupo solo es accesible con sesión y membresía. Los datos de la API cacheada se purgan al cambiar de cuenta.
13. **Una sola instancia**: SQLite + proceso único; para escalar habría que migrar a Postgres y almacenamiento de sesiones compartido.

---

## 8. Datos y créditos

- Fronteras: [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, dominio público).
- Metadatos de países: [world-countries](https://github.com/mledoze/countries) (ODbL).
- Ciudades: [all-the-cities](https://github.com/joelacus/all-the-cities), basado en GeoNames (CC BY 4.0).
- Banderas: [flag-icons](https://github.com/lipis/flag-icons) (MIT).
- Tipografías: Fraunces y Manrope vía Fontsource (SIL OFL).

Los datos geográficos generados se versionan en `shared/data/countries.ts`, `src/data/` y `public/flags/`; para regenerarlos:

```bash
npm run data
npm run icons # ver scripts/make-icons.py; requiere Pillow
```
