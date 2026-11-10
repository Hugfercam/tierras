import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useOnlineStatus } from '../../hooks/useUi';
import { cn } from '../../lib/cn';
import { Brand } from './Brand';
import { GroupSwitcher } from './GroupSwitcher';
import { UserMenu } from './UserMenu';
import { Icon, type IconName } from '../ui/Icons';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/pasaporte', label: 'Pasaporte', icon: 'grid' },
  { to: '/mapa', label: 'Mapa', icon: 'map' },
  { to: '/ranking', label: 'Ranking', icon: 'trophy' },
  { to: '/grupo', label: 'Grupo', icon: 'users' },
];

const TITLES: Record<string, string> = {
  '/pasaporte': 'Mi pasaporte',
  '/mapa': 'Mapa',
  '/ranking': 'Ranking del grupo',
  '/grupo': 'Mi grupo',
};

export function AppShell() {
  const online = useOnlineStatus();
  const { toast } = useToast();
  const location = useLocation();
  const previousOnline = useRef(online);

  useEffect(() => {
    if (previousOnline.current === online) return;
    if (!online) toast('Sin conexión. Vas a ver la última copia guardada.', 'info');
    else toast('Conexión restablecida.', 'success');
    previousOnline.current = online;
  }, [online, toast]);

  useEffect(() => {
    const base = TITLES[location.pathname] ?? 'Tierras';
    document.title = `${base} · Tierras`;
  }, [location.pathname]);

  return (
    <div className={cn('app-shell', !online && 'is-offline')}>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="app-header">
        <Brand />
        <nav className="main-nav" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn('main-nav__link', isActive && 'is-active')}
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="app-header__actions">
          <GroupSwitcher />
          <UserMenu />
        </div>
      </header>

      <main id="contenido" className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Navegación móvil">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn('bottom-nav__link', isActive && 'is-active')}
          >
            <Icon name={item.icon} size={21} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {!online ? (
        <div className="offline-badge" role="status">
          <Icon name="cloud-off" size={15} />
          <span>Sin conexión · datos guardados</span>
        </div>
      ) : null}
    </div>
  );
}
