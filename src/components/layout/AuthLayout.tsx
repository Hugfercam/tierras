import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../../components/layout/Brand';
import { Icon } from '../../components/ui/Icons';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <section className="auth-visual">
        <div className="auth-visual__grain" aria-hidden="true" />
        <div className="auth-visual__top">
          <Brand />
          <span className="auth-visual__tag">Pasaporte de viajes</span>
        </div>

        <div className="auth-orb" aria-hidden="true">
          <div className="auth-orb__halo" />
          <svg viewBox="0 0 620 620" className="auth-orb__svg" fill="none">
            <circle cx="310" cy="310" r="212" stroke="rgba(242,236,216,.42)" strokeWidth="1.2" />
            <ellipse cx="310" cy="310" rx="104" ry="212" stroke="rgba(242,236,216,.18)" strokeWidth="1" />
            <ellipse cx="310" cy="310" rx="174" ry="212" stroke="rgba(242,236,216,.12)" strokeWidth="1" />
            <path d="M98 310h424M128 220h364M128 400h364M310 98v424" stroke="rgba(242,236,216,.16)" strokeWidth="1" />
            <path
              d="M180 412c64-21 107-77 123-168 8-44 37-70 84-76"
              stroke="#ff7e5d"
              strokeWidth="1.6"
              strokeDasharray="3 7"
              strokeLinecap="round"
            />
            <circle cx="389" cy="168" r="9" fill="#ff7e5d" />
            <circle cx="389" cy="168" r="19" stroke="rgba(255,126,93,.4)" strokeWidth="1.2" />
            <circle cx="247" cy="348" r="5" fill="#e8dfc8" />
            <circle cx="466" cy="301" r="4" fill="#7fdac0" />
            <circle cx="204" cy="224" r="3.5" fill="rgba(232,223,200,.7)" />
          </svg>
          <span className="auth-pin auth-pin--lisboa">
            <span className="auth-pin__dot" />
            Lisboa
          </span>
          <span className="auth-pin auth-pin--tokio">
            <span className="auth-pin__dot" />
            Tokio
          </span>
          <span className="auth-pin auth-pin--cdmx">
            <span className="auth-pin__dot" />
            CDMX
          </span>
          <span className="auth-orb__latitude">40° N · 3° O</span>
        </div>

        <div className="auth-visual__copy">
          <p className="eyebrow eyebrow--light">
            <span className="eyebrow__line" />
            Tu pasaporte personal
          </p>
          <h1>
            El mundo se recuerda mejor <em>a tu manera.</em>
          </h1>
          <p className="auth-visual__lede">
            Guarda países, paradas y recuerdos en tu pasaporte personal. Cuando quieras,
            compártelos con tus grupos para comparar recorridos.
          </p>
          <div className="auth-visual__meta">
            <span>
              <Icon name="grid" size={14} /> Pasaporte personal
            </span>
            <span>
              <Icon name="globe" size={14} /> Globo 3D
            </span>
            <span>
              <Icon name="users" size={14} /> Grupos opcionales
            </span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel__inner">
          <div className="auth-panel__brand">
            <Brand />
          </div>
          {children}
          <p className="auth-panel__foot">
            Tierras · Tus viajes, en compañía <span aria-hidden="true">✦</span>
            <br />
            <Link to="/privacidad">Privacidad</Link> · <Link to="/terminos">Términos</Link> ·{' '}
            <Link to="/cookies">Cookies</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
