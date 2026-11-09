import { Link } from 'react-router-dom';

export function Brand({ to = '/mapa', compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link className="brand" to={to} aria-label="Tierras, ir al mapa">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="15.2" stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
          <ellipse cx="20" cy="20" rx="7.2" ry="15.2" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
          <path d="M5.5 15.5h29M5.5 24.5h29" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
          <circle cx="27.3" cy="12.4" r="3.1" fill="#ff7e5d" />
          <path d="M11 27.2c3-2 5.4-5.2 6.7-9.1" stroke="#ff7e5d" strokeWidth="1.3" strokeDasharray="2 2.4" strokeLinecap="round" />
        </svg>
      </span>
      {!compact ? (
        <span className="brand__name">
          Tierras<span className="brand__period">.</span>
        </span>
      ) : null}
    </Link>
  );
}
