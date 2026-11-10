import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { COUNTRIES } from '../../shared/countries.ts';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ApiError, deleteAccount, updateAccount } from '../lib/api';
import { LEGAL_DETAILS } from '../content/legal';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icons';

export function AccountPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [homeCountryCode, setHomeCountryCode] = useState(user?.homeCountryCode ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await updateAccount({ name, email, homeCountryCode, currentPassword });
      queryClient.setQueryData(['auth', 'me'], result.user);
      setCurrentPassword('');
      toast('Datos de cuenta actualizados.', 'success');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (event: FormEvent) => {
    event.preventDefault();
    if (deleteConfirmation !== 'ELIMINAR') {
      setError('Escribe ELIMINAR para confirmar.');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount(deletePassword);
      await logout();
      navigate('/login', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos eliminar la cuenta.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page account-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__line" />
            Cuenta y privacidad
          </p>
          <h1>
            Tus datos, <em>en tus manos.</em>
          </h1>
          <p className="page-head__lede">
            Desde aquí puedes rectificar tus datos, descargar una copia y eliminar tu cuenta.
          </p>
        </div>
      </header>

      <div className="account-grid">
        <section className="surface-card account-card">
          <p className="eyebrow">Rectificación</p>
          <h2>Datos de cuenta</h2>
          <form className="form-stack" onSubmit={saveProfile}>
            <label className="field">
              <span className="field__label">Nombre</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Email</span>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">País base</span>
              <select
                className="input input--select"
                value={homeCountryCode}
                onChange={(event) => setHomeCountryCode(event.target.value)}
              >
                {COUNTRIES.map((country) => (
                  <option key={country.iso2} value={country.iso2}>
                    {country.name}
                  </option>
                ))}
              </select>
              <span className="field__hint">
                Cambiarlo recalcula los kilómetros estimados de tu pasaporte.
              </span>
            </label>
            <label className="field">
              <span className="field__label">Contraseña actual</span>
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <span className="field__hint">La pedimos para confirmar cualquier cambio.</span>
            </label>
            <Button type="submit" loading={saving}>
              <Icon name="check" size={16} />
              Guardar cambios
            </Button>
          </form>
        </section>

        <section className="surface-card account-card">
          <p className="eyebrow">Portabilidad</p>
          <h2>Descargar mis datos</h2>
          <p className="account-card__text">
            Descarga un JSON con tu cuenta, grupos, viajes, paradas, participantes y
            consentimientos. No incluye contraseñas ni tokens de sesión.
          </p>
          <a className="btn btn--secondary btn--md" href="/api/account/export" download>
            <Icon name="download" size={16} />
            Descargar copia
          </a>
          <p className="account-card__links">
            <Link to="/privacidad">Política de privacidad</Link> ·{' '}
            <Link to="/terminos">Términos de uso</Link> · <Link to="/cookies">Cookies</Link>
          </p>
          <p className="account-card__text">
            Responsable: {LEGAL_DETAILS.name} ·{' '}
            <a href={`mailto:${LEGAL_DETAILS.email}`}>{LEGAL_DETAILS.email}</a>
          </p>
        </section>

        <section className="surface-card account-card account-card--danger">
          <p className="eyebrow">Supresión</p>
          <h2>Eliminar mi cuenta</h2>
          <p className="account-card__text">
            Se eliminarán tu cuenta, tus viajes y tus consentimientos. Si eres propietario de un
            grupo, la propiedad pasará a otra persona; si no queda nadie, el grupo se eliminará.
          </p>
          <form className="form-stack" onSubmit={handleDelete}>
            <label className="field">
              <span className="field__label">Contraseña actual</span>
              <input
                type="password"
                className="input"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">Escribe ELIMINAR</span>
              <input
                className="input"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                required
              />
            </label>
            <Button type="submit" variant="danger" loading={deleting}>
              <Icon name="trash" size={16} />
              Eliminar cuenta definitivamente
            </Button>
          </form>
        </section>
      </div>

      {error ? (
        <p className="form-error account-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
