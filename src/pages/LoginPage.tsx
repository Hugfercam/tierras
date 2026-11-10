import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, getConfig, login } from '../lib/api';
import { clearPrivateApiCache } from '../lib/privateCache';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Button, Spinner } from '../components/ui/Button';
import { Icon } from '../components/ui/Icons';

export function LoginPage() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const state = location.state as { from?: string } | null;
  const from =
    state?.from && state.from.startsWith('/') && !state.from.startsWith('//')
      ? state.from
      : '/mapa';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => getConfig(signal),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="entry-loading">
        <Spinner size={26} />
        <p>Abriendo el atlas…</p>
      </div>
    );
  }
  if (user) return <Navigate to={from} replace />;

  const finishLogin = (nextUser: Awaited<ReturnType<typeof login>>['user']) => {
    void clearPrivateApiCache();
    queryClient.setQueryData(['auth', 'me'], nextUser);
    navigate(from, { replace: true });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await login(email, password);
      finishLogin(result.user);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fieldErrors ?? {});
      } else {
        setError('No pudimos iniciar sesión. Intenta de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async () => {
    const account = configQuery.data?.demoAccount;
    if (!account) return;
    setDemoLoading(true);
    setError(null);
    try {
      const result = await login(account.email, account.password);
      finishLogin(result.user);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'No pudimos abrir la cuenta de demostración.',
      );
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-form">
        <p className="eyebrow">
          <span className="eyebrow__line" />
          Tu mapa te espera
        </p>
        <h2 className="auth-form__title">
          Qué bueno <em>verte.</em>
        </h2>
        <p className="auth-form__subtitle">
          Entra para seguir sumando países con tu grupo.
        </p>

        <form className="auth-form__fields" onSubmit={handleSubmit} noValidate>
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
                autoFocus
                required
              />
            </span>
            {fieldErrors.email ? <span className="field__error">{fieldErrors.email}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">Contraseña</span>
            <span className="input-wrap">
              <Icon name="lock" size={18} className="input-wrap__icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="input input--with-action"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Tu contraseña"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? 'Ocultar' : 'Ver'}
              </button>
            </span>
            {fieldErrors.password ? (
              <span className="field__error">{fieldErrors.password}</span>
            ) : null}
          </label>

          {error ? (
            <p className="form-error" role="alert">
              <Icon name="info" size={16} />
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" full loading={submitting}>
            Entrar a mi mapa
            <Icon name="arrow-right" size={18} />
          </Button>
        </form>

        {configQuery.data?.demoMode && configQuery.data.demoAccount ? (
          <div className="demo-card">
            <div className="demo-card__copy">
              <span className="demo-card__icon">
                <Icon name="sparkle" size={16} />
              </span>
              <div>
                <strong>Prueba con el grupo demo</strong>
                <p>Los Trotamundos, con cuatro viajeros y un mapa ya recorrido.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={handleDemo} loading={demoLoading}>
              Entrar como Lucía
            </Button>
          </div>
        ) : null}

        <p className="auth-switch">
          ¿Todavía no tienes cuenta?{' '}
          <Link to="/registro" state={{ from }}>
            Crear una cuenta
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
