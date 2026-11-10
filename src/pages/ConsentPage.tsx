import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MIN_AGE } from '../../shared/legal.ts';
import { useAuth } from '../contexts/AuthContext';
import { acceptConsents } from '../lib/api';
import { Brand } from '../components/layout/Brand';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icons';

export function ConsentPage() {
  const { refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [age, setAge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await acceptConsents();
      await refreshUser();
      navigate('/pasaporte', { replace: true });
    } catch {
      setError('No pudimos guardar tu consentimiento. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="consent-screen">
      <div className="consent-screen__card">
        <Brand />
        <p className="eyebrow">
          <span className="eyebrow__line" />
          Antes de continuar
        </p>
        <h1>Actualizamos cómo cuidamos tus datos.</h1>
        <p>
          Para seguir usando Tierras necesitamos que confirmes las condiciones actuales. Solo se
          guarda la versión y la fecha de aceptación; no guardamos tu IP.
        </p>
        <form onSubmit={handleSubmit} className="consent-checks">
          <label className="consent-check">
            <input
              type="checkbox"
              checked={age}
              onChange={(event) => setAge(event.target.checked)}
            />
            <span>Confirmo que tengo al menos {MIN_AGE} años.</span>
          </label>
          <label className="consent-check">
            <input
              type="checkbox"
              checked={privacy}
              onChange={(event) => setPrivacy(event.target.checked)}
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
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
            />
            <span>
              Acepto los{' '}
              <Link to="/terminos" target="_blank">
                términos de uso
              </Link>
              .
            </span>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <Button type="submit" size="lg" full loading={saving} disabled={!privacy || !terms || !age}>
            Aceptar y continuar
            <Icon name="arrow-right" size={18} />
          </Button>
        </form>
        <p className="consent-screen__foot">
          Puedes exportar o eliminar tu cuenta desde <Link to="/cuenta">Mi cuenta</Link> sin
          aceptar esta versión. También puedes{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              void logout().then(() => navigate('/login', { replace: true }));
            }}
          >
            cerrar sesión
          </button>
          .
        </p>
      </div>
    </div>
  );
}
