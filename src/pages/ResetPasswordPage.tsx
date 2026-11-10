import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icons';
import { ApiError, resetPassword } from '../lib/api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'No pudimos cambiar la contraseña. Intenta de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-form auth-form--register">
        <p className="eyebrow">
          <span className="eyebrow__line" />
          Nueva contraseña
        </p>
        <h2 className="auth-form__title">
          Tu cuenta, <em>a salvo.</em>
        </h2>
        {!token ? (
          <p className="form-error" role="alert">
            <Icon name="info" size={16} />
            El enlace no incluye un token válido.{' '}
            <Link to="/recuperar">Pide uno nuevo</Link>.
          </p>
        ) : done ? (
          <>
            <p className="auth-form__subtitle">
              Contraseña actualizada. Hemos cerrado las sesiones abiertas.
            </p>
            <p className="auth-switch">
              <Link to="/login">Iniciar sesión</Link>
            </p>
          </>
        ) : (
          <>
            <p className="auth-form__subtitle">
              Elige una contraseña de al menos 8 caracteres. Caduca el enlace en 1 hora.
            </p>
            <form className="auth-form__fields" onSubmit={submit} noValidate>
              <label className="field">
                <span className="field__label">Nueva contraseña</span>
                <span className="input-wrap">
                  <Icon name="lock" size={18} className="input-wrap__icon" />
                  <input
                    type="password"
                    className="input"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    autoFocus
                  />
                </span>
              </label>
              <label className="field">
                <span className="field__label">Repite la contraseña</span>
                <span className="input-wrap">
                  <Icon name="lock" size={18} className="input-wrap__icon" />
                  <input
                    type="password"
                    className="input"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </span>
              </label>
              {error ? (
                <p className="form-error" role="alert">
                  <Icon name="info" size={16} />
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                size="lg"
                full
                loading={loading}
                disabled={!password || !confirmation}
              >
                Guardar nueva contraseña
                <Icon name="arrow-right" size={18} />
              </Button>
            </form>
            <p className="auth-switch">
              <Link to="/login">Volver a iniciar sesión</Link>
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
