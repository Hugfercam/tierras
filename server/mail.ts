interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const outbox: MailMessage[] = [];
const MAX_OUTBOX = 20;
let warnedMissingTransport = false;

const appUrl = (process.env.APP_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

export function getAppUrl(): string {
  return appUrl;
}

export function getMailOutbox(): MailMessage[] {
  return [...outbox];
}

export function clearMailOutbox(): void {
  outbox.length = 0;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    outbox.push(message);
    if (outbox.length > MAX_OUTBOX) outbox.shift();
  }

  const webhook = process.env.EMAIL_WEBHOOK_URL;
  if (webhook) {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.EMAIL_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      console.error(`[mail] webhook respondió ${response.status}`);
    }
    return;
  }

  if (process.env.EMAIL_CONSOLE === 'false') return;
  if (process.env.NODE_ENV !== 'production' || process.env.EMAIL_CONSOLE === 'true') {
    console.log(`[mail] ${message.subject} → ${message.to}\n${message.text}`);
    return;
  }
  if (!warnedMissingTransport) {
    warnedMissingTransport = true;
    console.warn(
      '[mail] EMAIL_WEBHOOK_URL no está configurado: los emails no se enviarán en producción.',
    );
  }
}

export function verificationEmail(name: string, token: string): MailMessage {
  const url = `${appUrl}/verificar-email?token=${encodeURIComponent(token)}`;
  return {
    to: '',
    subject: 'Verifica tu email en Tierras',
    text: `Hola ${name}:\n\nConfirma tu email para proteger tu cuenta:\n${url}\n\nEl enlace caduca en 24 horas.`,
    html: `<p>Hola ${escapeHtml(name)}:</p><p>Confirma tu email para proteger tu cuenta:</p><p><a href="${url}">Verificar mi email</a></p><p>El enlace caduca en 24 horas.</p>`,
  };
}

export function resetEmail(name: string, token: string): MailMessage {
  const url = `${appUrl}/restablecer?token=${encodeURIComponent(token)}`;
  return {
    to: '',
    subject: 'Restablece tu contraseña de Tierras',
    text: `Hola ${name}:\n\nPuedes crear una contraseña nueva aquí:\n${url}\n\nEl enlace caduca en 1 hora. Si no lo pediste, ignora este email.`,
    html: `<p>Hola ${escapeHtml(name)}:</p><p>Puedes crear una contraseña nueva aquí:</p><p><a href="${url}">Restablecer contraseña</a></p><p>El enlace caduca en 1 hora. Si no lo pediste, ignora este email.</p>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
