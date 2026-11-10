import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCountry } from '../../../shared/countries.ts';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useClickOutside, useInstallPrompt } from '../../hooks/useUi';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/Avatar';
import { CountryFlag } from '../ui/CountryFlag';
import { Icon } from '../ui/Icons';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { installAvailable, install } = useInstallPrompt();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  if (!user) return null;
  const home = getCountry(user.homeCountryCode);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      toast(
        error instanceof ApiError
          ? error.message
          : 'No pudimos cerrar la sesión. Intenta de nuevo.',
        'error',
      );
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className={cn('user-menu__trigger', open && 'is-open')}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Abrir menú de cuenta"
      >
        <Avatar name={user.name} index={0} size="sm" />
      </button>
      {open ? (
        <div className="popover user-menu__menu" role="menu">
          <div className="user-menu__head">
            <Avatar name={user.name} index={0} size="md" />
            <div>
              <p className="user-menu__name">{user.name}</p>
              <p className="user-menu__email">{user.email}</p>
            </div>
          </div>
          {home ? (
            <div className="user-menu__base">
              <span className="user-menu__base-flag">
                <CountryFlag code={home.iso2} size="sm" />
              </span>
              <span>
                Base en <strong>{home.name}</strong>
              </span>
            </div>
          ) : null}
          <div className="popover__divider" />
          {installAvailable ? (
            <button
              type="button"
              className="popover__action"
              onClick={async () => {
                setOpen(false);
                await install();
              }}
            >
              <Icon name="install" size={17} />
              Instalar Tierras
            </button>
          ) : null}
          <button
            type="button"
            className="popover__action popover__action--quiet"
            onClick={handleLogout}
            disabled={loading}
          >
            <Icon name="logout" size={17} />
            {loading ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
