# Estudio: host, dominio y email para staging

Fecha de revisión: 2026-11-10. Los precios cambian; confirma la tarifa final en cada proveedor.

## 1. Resumen ejecutivo

Recomendación para staging:

| Pieza | Elección recomendada |
| --- | --- |
| Host | **Render**, servicio Docker en Fráncfort, plan de pago pequeño con disco persistente |
| Dominio | **`tierras.app`** en Porkbun, DNS en Cloudflare; staging en `staging.tierras.app` |
| Email | **Resend** con dominio de envío propio y región UE si está disponible |
| Alternativa de control | **Hetzner Cloud** + Caddy + Docker + Brevo |

Coste orientativo: **8–10 USD/mes** para staging, sin contar IVA ni el dominio anual.

La app usa **SQLite en un único proceso**. Esto descarta plataformas puramente serverless o con autoescalado sin disco persistente compartido. También obliga a mantener una sola réplica.

## 2. Requisitos que condicionan la elección

- Node 24 + Express + Docker.
- SQLite con WAL y volumen persistente.
- Una sola instancia; sin autoescalado horizontal.
- HTTPS y dominio propio.
- Cabeceras de proxy correctas (`TRUST_PROXY=true`).
- Emails transaccionales para verificar cuenta y recuperar contraseña.
- Región UE y DPA para datos personales.
- Backups accesibles y restaurables.
- Staging separado de producción: otra base, otro volumen y otro subdominio.

## 3. Hosting

### Comparativa

| Proveedor | Encaje | Precio orientativo | Ventajas | Riesgos |
| --- | --- | --- | --- | --- |
| **Render** | Alto | Web 512 MB: **7 USD/mes**; disco **0,25 USD/GB/mes** | Docker, TLS y dominio propios, región Fráncfort, DPA GDPR, despliegue desde Git | Disco caro a largo plazo; backups y acceso al volumen menos directos |
| **Railway** | Alto | Hobby desde **5 USD/mes** con 5 USD de crédito y hasta 5 GB de volumen | Muy simple, Docker, regiones globales, dominio y TLS | Factura por uso; menos predecible; volumen y backups a revisar |
| **Hetzner Cloud** | Medio-alto | Desde **5,49 €/mes + IVA** | Precio excelente, Alemania/Finlandia, control total, backups y cron propios | Hay que administrar SO, Docker, Caddy, firewall y actualizaciones |
| **Fly.io** | Medio | Uso por máquina y volumen | Regiones y volúmenes; buen control | Más piezas y operación que Render/Railway |
| **Vercel / Netlify** | No recomendado | — | Excelentes para frontend estático | No encajan con Express + SQLite persistente en un solo proceso |

### Render

- Servicio web Docker con TLS automático y dominio propio.
- Región europea; Fráncfort es la opción natural para España.
- Disco persistente de pago; se puede montar en `/app/data`.
- El plan gratuito no sirve: se suspende y no ofrece disco persistente.
- Configurar **una sola instancia**.
- Guardar el SQLite en el disco, nunca en el sistema de archivos efímero.

Coste de staging:

```text
Web 512 MB             7,00 USD/mes
Disco 1 GB             0,25 USD/mes
Dominio .app          14,93 USD/año ≈ 1,24 USD/mes
Email Resend free      0 USD
Total aproximado      ≈ 8,50 USD/mes + IVA
```

### Railway

- Hobby: 5 USD/mes de consumo mínimo; incluye 5 USD de crédito.
- Volumen de hasta 5 GB; suficiente para staging.
- Muy poca fricción si ya se usa Docker.
- La factura puede subir si el servicio consume más de lo previsto.
- Elegir una región europea y una sola réplica.

Coste orientativo:

```text
Hobby mínimo          5,00 USD/mes
Dominio              ≈1,24 USD/mes
Email free             0 USD
Total                ≈6,25 USD/mes + IVA
```

### Hetzner Cloud

- Desde 5,49 €/mes + IVA en la línea Regular Performance.
- Alemania/Finlandia; buena opción de soberanía y coste.
- Tú controlas Caddy, Docker, firewall, backups y cron.
- Para staging es más trabajo, pero permite exactamente el flujo de backup actual (`npm run backup`).
- Si se elige, usar Caddy para TLS automático y un cron diario de backup fuera del servidor.

## 4. Dominio

### `.app`

- Precio actual en Porkbun: **8,75 USD el primer año; 14,93 USD de renovación**.
- `.app` está en la lista HSTS preload: obliga a HTTPS. Encaja con la app.
- Cloudflare DNS gratuito; Porkbun incluye WHOIS privacy.
- Recomendado si `tierras.app` está disponible.

### `.es`

- Precio actual en 101domain: **22,49 USD/año**; renovación 31,49 USD.
- Requiere identificación (DNI/NIE para particulares; CIF/VAT para empresas).
- No incluye privacidad WHOIS.
- Buena opción de marca local, pero más fricción para staging.

### `.com`

- Alternativa conservadora y universal; suele costar 10–15 USD/año.
- Menos “producto” que `.app`, pero más fácil de recordar y transferir.

### Recomendación de nombres

```text
Producción:  tierras.app        (o tierras.es)
Staging:     staging.tierras.app
Email:       no-reply@tierras.app
Envío:       mail.tierras.app o send.tierras.app
```

No usar el mismo subdominio para staging y producción. Las cookies de sesión son host-only, pero separar hosts evita confusiones y permite borrar datos de staging sin tocar producción.

## 5. Proveedor de email

### Comparativa

| Proveedor | Precio | Encaje | Notas |
| --- | --- | --- | --- |
| **Resend** | Free: 3.000 emails/mes, 100/día, 3 dominios; Pro: 20 USD/mes | Muy alto | API/SMTP, multi-región, DKIM/SPF/DMARC, GDPR, webhooks |
| **Brevo** | Free: 300 emails/día; Starter desde 9 USD/mes | Alto | Proveedor francés, bueno para UE; API transaccional y marketing |
| **Mailtrap** | Sandbox para desarrollo/QA | Alto para staging | Ideal para inspeccionar emails sin enviarlos a usuarios reales; no sustituye al proveedor de producción |
| **Amazon SES** | Muy barato a escala | Medio | Más configuración, sandbox y gestión de reputación; no es la opción más simple para staging |

### Recomendación

**Resend** para staging y primera producción:

- 3.000 emails/mes gratuitos son más que suficientes.
- Permite dominio propio y configuración de DKIM/SPF/DMARC.
- Tiene API y SMTP.
- Configurar la región UE si está disponible en el plan y revisar el DPA/subencargados.

**Brevo** si se prioriza proveedor europeo y una consola más de marketing:

- 300 emails/día gratis.
- Empresa francesa; revisar DPA y región de datos.
- El plan gratuito puede incluir limitaciones de marca; comprobar antes de usarlo con usuarios.

**Mailtrap** solo como bandeja de pruebas de staging, no como proveedor final.

## 6. Problema técnico a resolver antes de contratar email

La app envía a `EMAIL_WEBHOOK_URL` un JSON propio:

```json
{
  "to": "persona@example.com",
  "subject": "Verifica tu email",
  "text": "...",
  "html": "..."
}
```

Resend, Brevo y Mailtrap **no aceptan ese formato directamente**. Antes de staging hay que elegir una de estas dos soluciones:

1. **Adaptador en la app** (recomendado): `EMAIL_PROVIDER=resend|brevo`, `EMAIL_API_KEY`, y una función que traduzca el mensaje a la API del proveedor.
2. **Relay**: un Cloudflare Worker o función que reciba el JSON y llame al proveedor.

Sin esto, `EMAIL_WEBHOOK_URL` no enviará nada aunque se configure.

## 7. Arquitectura de staging recomendada

```text
staging.tierras.app
        │
        ▼
Render (Fráncfort) / Docker
  ├── Node 24 + Express
  ├── SQLite: /app/data/staging.db
  ├── volumen persistente
  └── TLS y healthcheck
        │
        ├── Resend (email)
        └── Cloudflare DNS
```

Variables clave:

```env
NODE_ENV=production
APP_URL=https://staging.tierras.app
COOKIE_SECURE=true
TRUST_PROXY=true
SEED_DEMO=false
DB_PATH=/app/data/staging.db
EMAIL_PROVIDER=resend
EMAIL_API_KEY=...
EMAIL_FROM=no-reply@tierras.app
```

Además:

- Una sola instancia.
- Backup diario del SQLite.
- No reutilizar la base de producción.
- No usar la cuenta demo.
- No indexar staging: `X-Robots-Tag: noindex` o acceso restringido.

## 8. Recomendación final

### Opción A — recomendada para staging

- **Host:** Render, Fráncfort, 512 MB, 1 GB de disco.
- **Dominio:** `tierras.app` en Porkbun + DNS en Cloudflare; `staging.tierras.app`.
- **Email:** Resend free con dominio propio; adaptador de email en la app.
- **Coste:** ~8,50 USD/mes + IVA + dominio anual.

Es la opción con menos operación y suficiente para validar staging con usuarios reales de prueba.

### Opción B — máxima soberanía y control

- **Host:** Hetzner CX22 (Alemania/Finlandia).
- **Dominio:** el mismo, DNS en Cloudflare.
- **Email:** Brevo (Francia) o Resend con región UE.
- **Coste:** ~7–9 €/mes + IVA, más tiempo de administración.
- **Ventaja:** backups locales y remotos, Caddy, control total del disco.

### Opción C — mínima fricción

- **Host:** Railway Hobby.
- **Dominio:** `tierras.app`.
- **Email:** Resend.
- **Coste:** desde ~6,25 USD/mes.
- **Riesgo:** factura variable y backups menos directos.

## 9. Checklist antes de contratar

- [ ] Comprobar disponibilidad de `tierras.app` y `tierras.es`.
- [ ] Crear cuenta en Porkbun y Cloudflare.
- [ ] Crear cuenta en Render y elegir Fráncfort.
- [ ] Crear cuenta en Resend y verificar el dominio.
- [ ] Configurar SPF, DKIM y DMARC.
- [ ] Implementar adaptador Resend/Brevo.
- [ ] Configurar `EMAIL_FROM` y `APP_URL`.
- [ ] Configurar disco, backup y una sola instancia.
- [ ] Revisar DPA de host y email.
- [ ] Probar registro → verificación → recuperación de contraseña.
- [ ] Probar backup y restauración.

## 10. Fuentes consultadas

- [Railway Pricing](https://railway.com/pricing)
- [Render Pricing](https://render.com/pricing.md)
- [Render Regions](https://render.com/docs/regions)
- [Hetzner Cloud](https://www.hetzner.com/cloud/)
- [Porkbun .app](https://porkbun.com/tld/app)
- [101domain .es](https://www.101domain.com/es.htm)
- [Cloudflare Registrar TLDs](https://developers.cloudflare.com/registrar/top-level-domains/)
- [Resend Pricing](https://resend.com/pricing.md)
- [Brevo Pricing](https://help.brevo.com/hc/en-us/articles/208589409)
- [Mailtrap Pricing](https://mailtrap.io/pricing/)
