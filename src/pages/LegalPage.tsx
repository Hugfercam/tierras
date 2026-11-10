import { Link } from 'react-router-dom';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../shared/legal.ts';
import { LEGAL_DETAILS } from '../content/legal';
import { Brand } from '../components/layout/Brand';

type LegalKind = 'privacy' | 'terms' | 'cookies';

const titles: Record<LegalKind, string> = {
  privacy: 'Política de privacidad',
  terms: 'Términos de uso',
  cookies: 'Cookies y almacenamiento',
};

export function LegalPage({ kind }: { kind: LegalKind }) {
  const pending = Object.values(LEGAL_DETAILS).some((value) =>
    value.includes('Pendiente de configurar'),
  );
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Brand />
        <Link to="/pasaporte" className="legal-back">
          Volver a Tierras
        </Link>
      </header>
      <main className="legal-doc">
        <p className="eyebrow">
          <span className="eyebrow__line" />
          Información legal
        </p>
        <h1>{titles[kind]}</h1>
        <p className="legal-version">
          Versión {kind === 'terms' ? TERMS_VERSION : PRIVACY_VERSION}
        </p>
        {pending ? (
          <p className="legal-warning">
            Este texto es una plantilla técnica. Antes de usar la app con usuarios reales, el
            responsable debe completar sus datos fiscales y de contacto y revisar el contenido con
            asesoría legal.
          </p>
        ) : null}
        {kind === 'privacy' ? <Privacy /> : null}
        {kind === 'terms' ? <Terms /> : null}
        {kind === 'cookies' ? <Cookies /> : null}
        <div className="legal-contact">
          <strong>Contacto</strong>
          <p>
            {LEGAL_DETAILS.name} · {LEGAL_DETAILS.nif}
            <br />
            {LEGAL_DETAILS.address}
            <br />
            <a href={`mailto:${LEGAL_DETAILS.email}`}>{LEGAL_DETAILS.email}</a>
          </p>
          <p>
            Puedes reclamar ante la Agencia Española de Protección de Datos en{' '}
            <a href="https://www.aepd.es" target="_blank" rel="noreferrer">
              aepd.es
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}

function Privacy() {
  return (
    <>
      <h2>Quién trata tus datos</h2>
      <p>
        El responsable es {LEGAL_DETAILS.name}, con NIF {LEGAL_DETAILS.nif} y domicilio en{' '}
        {LEGAL_DETAILS.address}. El correo de privacidad es{' '}
        <a href={`mailto:${LEGAL_DETAILS.email}`}>{LEGAL_DETAILS.email}</a>.
      </p>
      <h2>Qué datos tratamos</h2>
      <ul>
        <li>Cuenta: nombre, email, país base, contraseña cifrada y fecha de alta.</li>
        <li>Viajes: título, fechas, países, paradas, notas y participantes.</li>
        <li>Grupos: nombre, membresía, rol, invitaciones y actividad compartida.</li>
        <li>Consentimientos: versión y fecha de aceptación; no guardamos tu IP.</li>
        <li>Datos técnicos necesarios para la sesión y la seguridad.</li>
      </ul>
      <h2>Para qué y con qué base legal</h2>
      <ul>
        <li>Prestar el servicio y gestionar tu cuenta y tus viajes: ejecución del contrato.</li>
        <li>Seguridad, prevención de abuso y registro de consentimientos: interés legítimo y obligación legal.</li>
        <li>Mostrar tus estadísticas a los miembros de tus grupos: ejecución del contrato y consentimiento al participar en un grupo.</li>
      </ul>
      <p>
        No hay publicidad, analítica de terceros, perfilado automatizado ni venta de datos. Las
        notas pueden contener datos personales de otras personas: no incluyas datos sensibles ni
        información de terceros sin su consentimiento.
      </p>
      <h2>Quién puede verlo</h2>
      <p>
        Tus datos de cuenta son privados. El pasaporte personal es tuyo, pero los miembros de tus
        grupos pueden ver tus estadísticas y los países y ciudades de tus viajes, incluidos los
        viajes en solitario, porque así funciona la comparación del grupo. Los participantes reciben
        una invitación y deben aceptarla para que el viaje cuente en su pasaporte. Una vez aceptan,
        ven el viaje y sus paradas.
      </p>
      <p>
        El alojamiento y los servicios técnicos pueden tratar datos como encargados del
        tratamiento. Proveedor de alojamiento: {LEGAL_DETAILS.hosting}. No hay transferencias
        internacionales adicionales declaradas en esta versión.
      </p>
      <h2>Cuánto tiempo</h2>
      <ul>
        <li>Cuenta y viajes: hasta que elimines tu cuenta o los viajes.</li>
        <li>Sesiones: 30 días desde su creación.</li>
        <li>Caché offline de la app: hasta 30 días o hasta que cierres sesión.</li>
        <li>Consentimientos: mientras la cuenta exista, para poder demostrar la aceptación.</li>
      </ul>
      <h2>Tus derechos</h2>
      <p>
        Puedes acceder, rectificar, suprimir, limitar u oponerte al tratamiento y solicitar la
        portabilidad. Desde <Link to="/cuenta">Mi cuenta</Link> puedes actualizar tus datos,
        descargar una copia en JSON y eliminar la cuenta. También puedes escribir a{' '}
        <a href={`mailto:${LEGAL_DETAILS.email}`}>{LEGAL_DETAILS.email}</a>.
      </p>
      <p>
        Si eliminas tu cuenta, se eliminan tus viajes y tus datos personales. Si eres propietario de
        un grupo, la propiedad pasa a otra persona del grupo; si no queda nadie, el grupo se elimina.
        Algunos datos pueden conservarse bloqueados durante los plazos legales aplicables.
      </p>
      <h2>Seguridad y menores</h2>
      <p>
        Usamos contraseñas con scrypt, sesiones HttpOnly, validación de origen y una base SQLite
        privada. La edad mínima es 14 años. Si detectas un incidente de seguridad, escribe a{' '}
        <a href={`mailto:${LEGAL_DETAILS.email}`}>{LEGAL_DETAILS.email}</a>.
      </p>
    </>
  );
}

function Terms() {
  return (
    <>
      <h2>El servicio</h2>
      <p>
        Tierras es una aplicación para registrar viajes personales y compararlos con grupos
        privados. Debes usar datos veraces y mantener la confidencialidad de tu cuenta.
      </p>
      <h2>Edad y cuenta</h2>
      <p>
        Debes tener al menos 14 años. Eres responsable de tu contraseña y de la actividad de tu
        cuenta. Puedes eliminar la cuenta desde Mi cuenta.
      </p>
      <h2>Contenido y conducta</h2>
      <ul>
        <li>No publiques contenido ilícito, ofensivo o que vulnere derechos de terceros.</li>
        <li>No intentes acceder a grupos o cuentas ajenas.</li>
        <li>No uses la app para acosar, suplantar o enviar spam.</li>
        <li>No incluyas datos sensibles ni información de otras personas sin permiso.</li>
      </ul>
      <h2>Datos compartidos</h2>
      <p>
        Los miembros de tus grupos pueden ver tus estadísticas y los países y ciudades de tus
        viajes, incluidos los individuales. Los participantes reciben una invitación y deben aceptarla para que el viaje cuente en su
        pasaporte. Si no aceptan, no se incorporan a su historial. Pueden rechazar o salir después.
      </p>
      <h2>Disponibilidad y responsabilidad</h2>
      <p>
        El servicio se ofrece “tal cual” y puede cambiar o interrumpirse. Los kilómetros son una
        estimación geográfica, no una medición de ruta real. En la medida permitida por la ley, no
        respondemos de daños indirectos derivados del uso de la app.
      </p>
      <h2>Cambios y ley aplicable</h2>
      <p>
        Podemos actualizar estos términos y pedirte que aceptes una nueva versión. Se aplica la
        legislación española. Para consumidores, prevalecen los derechos imperativos que
        correspondan.
      </p>
    </>
  );
}

function Cookies() {
  return (
    <>
      <h2>Cookies necesarias</h2>
      <p>
        Usamos una única cookie técnica de sesión, <code>tierras_session</code>, para mantener tu
        sesión iniciada. Es HttpOnly, SameSite=Lax y dura 30 días. Sin ella no se puede iniciar
        sesión.
      </p>
      <h2>Almacenamiento local</h2>
      <ul>
        <li>
          <code>tierras.activeGroupId</code>: recuerda el grupo activo.
        </li>
        <li>Caché de la PWA y respuestas GET de la API: permite leer tus viajes sin conexión.</li>
      </ul>
      <p>
        No usamos cookies publicitarias, píxeles ni analítica de terceros. Por eso no mostramos un
        banner de consentimiento de cookies: solo hay almacenamiento técnico necesario. Puedes
        borrar estos datos desde la configuración de tu navegador; la app perderá la sesión y la
        copia offline.
      </p>
    </>
  );
}
