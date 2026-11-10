# RGPD — registro de tratamiento y checklist operativa

> Documento interno de trabajo. No sustituye una revisión legal. Antes de abrir la app a usuarios reales hay que completar los datos del responsable y validar los textos.

## 1. Responsable del tratamiento

| Campo | Valor |
| --- | --- |
| Nombre o razón social | `VITE_LEGAL_NAME` |
| NIF | `VITE_LEGAL_NIF` |
| Domicilio | `VITE_LEGAL_ADDRESS` |
| Email de privacidad | `VITE_LEGAL_EMAIL` |
| País | `VITE_LEGAL_COUNTRY` |
| Alojamiento | `VITE_LEGAL_HOSTING` |

Estos valores se configuran en `.env` y se muestran en `/privacidad`, `/terminos` y `/cookies`. Mientras sigan como “Pendiente de configurar”, la app no debe considerarse lista para producción.

## 2. Actividades de tratamiento

| Actividad | Datos | Finalidad | Base legal | Conservación |
| --- | --- | --- | --- | --- |
| Cuenta | Nombre, email, país base, hash scrypt, fechas | Alta y acceso | Contrato | Hasta supresión |
| Sesión | Token hash, expiración | Mantener sesión | Contrato / seguridad | 30 días |
| Viajes | Título, fechas, países, paradas, notas, participantes | Diario y estadísticas | Contrato | Hasta borrar viaje o cuenta |
| Grupos | Nombre, miembros, roles, invitaciones | Comparación social | Contrato | Hasta borrar grupo o cuenta |
| Consentimientos | Tipo, versión, fecha | Demostrar aceptación | Obligación legal / interés legítimo | Mientras exista la cuenta |
| Seguridad | Logs técnicos mínimos | Prevención de abuso | Interés legítimo | Según retención del hosting |

No hay analítica de terceros, publicidad, perfilado automatizado ni venta de datos.

## 3. Destinatarios y encargados

- Proveedor de alojamiento: `VITE_LEGAL_HOSTING`.
- No hay proveedores de autenticación externa, mapas, analítica ni publicidad.
- Si el alojamiento está fuera del EEE, deben firmarse las SCC correspondientes y reflejarlo en la política.

## 4. Derechos y procedimiento

La app ofrece:

- acceso y portabilidad: `GET /api/account/export` y “Mi cuenta”;
- rectificación: `PATCH /api/account` con contraseña actual;
- supresión: `DELETE /api/account` con contraseña y confirmación;
- consentimientos: `/consentimiento` y `POST /api/account/consent`.

Solicitudes por email: responder en el plazo legal (1 mes, prorrogable). Verificar identidad antes de actuar. Si se rechaza una solicitud, documentar el motivo.

## 5. Retención

- Cuenta y viajes: hasta supresión.
- Sesiones: 30 días.
- Caché offline: 30 días o hasta cerrar sesión.
- Consentimientos: mientras exista la cuenta.
- Backups: definir plazo (recomendado 30 días) y procedimiento de restauración.

La eliminación de cuenta transfiere los grupos de los que sea propietario a otra persona o los elimina si no queda nadie. Los viajes propios se eliminan; las participaciones se desvinculan.

## 6. Seguridad

- scrypt para contraseñas;
- cookie de sesión HttpOnly, SameSite=Lax y Secure en HTTPS;
- validación de `Origin` en mutaciones;
- SQLite con WAL y acceso al archivo restringido;
- exportación excluida de la caché de la PWA;
- sin secretos en el repositorio.

Pendiente antes de producción:

- HTTPS obligatorio y `COOKIE_SECURE=true`;
- backups cifrados y pruebas de restauración;
- rate limiting en login/registro;
- revisión de logs para que no contengan datos personales;
- política de gestión de incidentes y contacto de seguridad.

## 7. Brechas de seguridad

1. Contener y evaluar el alcance.
2. Registrar fecha, datos afectados y medidas.
3. Notificar a la AEPD en 72 horas si hay riesgo.
4. Informar a las personas afectadas si el riesgo es alto.
5. Documentar la decisión aunque no se notifique.

## 8. Menores

Edad mínima: 14 años, con confirmación expresa en el registro. Si se detecta una cuenta de menor de 14 sin autorización, debe eliminarse.

## 9. Cookies y almacenamiento

- `tierras_session`: cookie técnica de sesión.
- `tierras.activeGroupId`: preferencia funcional en localStorage.
- Caché de la PWA: datos de la última sincronización.

No se usa banner de cookies porque solo hay almacenamiento técnico necesario. Si se añade analítica, publicidad o cookies no esenciales, hará falta consentimiento previo y actualizar `/cookies`.

## 10. Brechas conocidas

- Los participantes de un viaje se añaden por el propietario sin aceptación individual registrada.
- Los grupos ven estadísticas de viajes individuales; la política lo explica, pero no hay visibilidad por viaje.
- No hay verificación de email ni rate limiting.
- El contrato de encargado del tratamiento con el hosting está pendiente de formalizar.
- Las notas libres podrían contener datos sensibles introducidos por el usuario.

## 11. Checklist antes de producción

- [ ] Resolver el consentimiento de los participantes o retirar esa función.
- [ ] Firmar el contrato de encargado con el hosting.
- [ ] Completar datos del responsable.
- [ ] Revisar política, términos y cookies con asesoría legal.
- [ ] Configurar HTTPS y cookies seguras.
- [ ] Definir hosting, backups y retención.
- [ ] Añadir rate limiting y alertas de seguridad.
- [ ] Probar exportación y supresión con una cuenta real.
- [ ] Revisar que los grupos solo muestren los datos previstos.
- [ ] Documentar el procedimiento de brechas.
- [ ] Designar contacto de privacidad y, si procede, DPO.
