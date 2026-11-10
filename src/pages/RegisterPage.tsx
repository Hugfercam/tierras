import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  COUNTRIES,
  REGION_LABELS,
  REGION_ORDER,
} from '../../shared/countries.ts';
import { MIN_AGE } from '../../shared/legal.ts';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Button, Spinner } from '../components/ui/Button';
import { Icon } from '../components/ui/Icons';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, register } from '../lib/api';
import { clearPrivateApiCache } from '../lib/privateCache';

export function RegisterPage() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const state = location.state as { from?: string } | null;
  const from =
    state?.from && state.from.startsWith('/') && !state.from.startsWith('//')
      ? state.from
      : '/pasaporte';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [homeCountryCode, setHomeCountryCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="entry-loading">
        <Spinner size={26} />
        <p>Abriendo el atlas…</p>
      </div>
    );
  }
  if (user) return <Navigate to={from} replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await register({
        name,
        email,
        password,
        homeCountryCode,
        acceptPrivacy: true,
        acceptTerms: true,
        ageConfirmed: true,
      });
      await clearPrivateApiCache();
      queryClient.setQueryData(['auth', 'me'], result.user);
      navigate(from, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fieldErrors ?? {});
      } else {
        setError('No pudimos crear tu cuenta. Intenta de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-form auth-form--register">
        <p className="eyebrow">
          <span className="eyebrow__line" />
          Empieza tu atlas
        </p>
        <h2 className="auth-form__title">
          Un mapa para <em>todos.</em>
        </h2>
        <p className="auth-form__subtitle">
          Crea tu cuenta y empieza tu pasaporte. Los grupos vienen después.
        </p>

        <form className="auth-form__fields" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field__label">Tu nombre</span>
            <span className="input-wrap">
              <Icon name="user" size={18} className="input-wrap__icon" />
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Lucía Ferrer"
                autoComplete="name"
                autoFocus
                required
                maxLength={60}
              />
            </span>
            {fieldErrors.name ? <span className="field__error">{fieldErrors.name}</span> : null}
          </label>

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
                placeholder="Al menos 8 caracteres"
                autoComplete="new-password"
                minLength={8}
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

          <label className="field">
            <span className="field__label">País donde vives</span>
            <span className="input-wrap">
              <Icon name="globe" size={18} className="input-wrap__icon" />
              <select
                className="input input--select"
                value={homeCountryCode}
                onChange={(event) => setHomeCountryCode(event.target.value)}
                required
              >
                <option value="">Elige tu país base</option>
                {REGION_ORDER.map((region) => (
                  <optgroup key={region} label={REGION_LABELS[region]}>
                    {COUNTRIES.filter((country) => country.region === region).map((country) => (
                      <option key={country.iso2} value={country.iso2}>
                        {country.name} ({country.iso2})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </span>
            {fieldErrors.homeCountryCode ? (
              <span className="field__error">{fieldErrors.homeCountryCode}</span>
            ) : (
              <span className="field__hint">
                Es el punto de partida para estimar tus kilómetros. Puedes cambiarlo desde Mi
                cuenta.
              </span>
            )}
          </label>

          <div className="consent-checks">
            <label className="consent-check">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(event) => setAgeConfirmed(event.target.checked)}
                required
              />
              <span>Confirmo que tengo al menos {MIN_AGE} años.</span>
            </label>
            <label className="consent-check">
              <input
                type="checkbox"
                checked={acceptPrivacy}
                onChange={(event) => setAcceptPrivacy(event.target.checked)}
                required
              />
              <span>
                He leído y acepto la{' '}
                <Link to="/privacidad" target="_blank">
                  política de privacidad
                </Link>
                .
              </span>
            </label>
            <label className="consent-check">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(event) => setAcceptTerms(event.target.checked)}
                required
              />
              <span>
                Acepto los{' '}
                <Link to="/terminos" target="_blank">
                  términos de uso
                </Link>
                .
              </span>
            </label>
          </div>

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
            loading={submitting}
            disabled={!ageConfirmed || !acceptPrivacy || !acceptTerms}
          >
            Crear mi cuenta
            <Icon name="arrow-right" size={18} />
          </Button>
        </form>

        <p className="auth-switch">
          ¿Ya tienes una cuenta?{' '}
          <Link to="/login" state={{ from }}>
            Iniciar sesión
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
