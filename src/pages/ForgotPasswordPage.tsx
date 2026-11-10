import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icons';
import { ApiError, forgotPassword } from '../lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'No pudimos enviar el enlace. Intenta de nuevo.',
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
          Recuperar acceso
        </p>
        <h2 className="auth-form__title">
          Vuelve a tu <em>pasaporte.</em>
        </h2>
        {sent ? (
          <>
            <p className="auth-form__subtitle">
              Si existe una cuenta con <strong>{email}</strong>, te enviamos un enlace para crear
              una contraseña nueva. Caduca en 1 hora.
            </p>
            <p className="auth-switch">
              <Link to="/login">Volver a iniciar sesión</Link>
            </p>
          </>
        ) : (
          <>
            <p className="auth-form__subtitle">
              Escribe tu email y te enviaremos un enlace para restablecer la contraseña.
            </p>
            <form className="auth-form__fields" onSubmit={submit} noValidate>
              <label className="field">
                <span className="field__label">Email</span>
                <span className="input-wrap">
                  <Icon name="mail" size={18} className="input-wrap__icon" />
                  <input
                    type="email"
                    className="input"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="tu@ejemplo.com"
                    autoComplete="email"
                    required
                    autoFocus
                  />
                </span>
              </label>
              {error ? (
                <p className="form-error" role="alert">
                  <Icon name="info" size={16} />
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="lg" full loading={loading} disabled={!email}>
                Enviar enlace
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
