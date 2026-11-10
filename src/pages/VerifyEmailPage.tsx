import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { verifyEmail } from '../lib/api';
import { Brand } from '../components/layout/Brand';
import { Spinner } from '../components/ui/Button';
import { Icon } from '../components/ui/Icons';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setStatus('error');
      setMessage('El enlace no incluye un token válido.');
      return;
    }
    let active = true;
    verifyEmail(token)
      .then(async () => {
        if (!active) return;
        setStatus('ok');
        if (user) await refreshUser();
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'No pudimos verificar el email.');
      });
    return () => {
      active = false;
    };
  }, [token, user, refreshUser]);

  return (
    <div className="consent-screen">
      <div className="consent-screen__card">
        <Brand />
        <p className="eyebrow">
          <span className="eyebrow__line" />
          Verificación de email
        </p>
        {status === 'loading' ? (
          <div className="verify-state">
            <Spinner size={24} />
            <h1>Comprobando tu enlace…</h1>
          </div>
        ) : status === 'ok' ? (
          <div className="verify-state">
            <span className="verify-state__icon is-ok">
              <Icon name="check" size={24} />
            </span>
            <h1>Email verificado.</h1>
            <p>Tu cuenta está lista. Ya puedes seguir usando Tierras.</p>
            <Link className="text-link" to={user ? '/pasaporte' : '/login'}>
              {user ? 'Volver a mi pasaporte' : 'Iniciar sesión'}{' '}
              <Icon name="arrow-right" size={15} />
            </Link>
          </div>
        ) : (
          <div className="verify-state">
            <span className="verify-state__icon is-error">
              <Icon name="info" size={24} />
            </span>
            <h1>No pudimos verificarlo.</h1>
            <p>{message}</p>
            <Link className="text-link" to="/login">
              Volver a iniciar sesión <Icon name="arrow-right" size={15} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
