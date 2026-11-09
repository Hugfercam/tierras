import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'globe'
  | 'map'
  | 'grid'
  | 'trophy'
  | 'users'
  | 'user'
  | 'search'
  | 'plus'
  | 'close'
  | 'chevron-down'
  | 'chevron-right'
  | 'check'
  | 'copy'
  | 'share'
  | 'arrow-left'
  | 'arrow-right'
  | 'calendar'
  | 'route'
  | 'logout'
  | 'install'
  | 'menu'
  | 'info'
  | 'zoom-in'
  | 'zoom-out'
  | 'pause'
  | 'play'
  | 'sparkle'
  | 'trash'
  | 'link'
  | 'locate'
  | 'cloud-off'
  | 'mail'
  | 'lock'
  | 'crown'
  | 'compass'
  | 'orbit';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

const paths: Record<IconName, ReactNode> = {
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 21.5 12 21M12 3C9.5 5.5 8.2 8.6 8.2 12s1.3 6.5 3.8 9" />
    </>
  ),
  map: (
    <>
      <path d="m3.5 6.4 5-2.2 7 2.7 5-2.3v13.2l-5 2.3-7-2.8-5 2.3Z" />
      <path d="M8.5 4.2v13.3M15.5 6.9v13.2" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5.5a4 4 0 0 1-8 0Z" />
      <path d="M8 5H4.5v2A3.5 3.5 0 0 0 8 10.5M16 5h3.5v2A3.5 3.5 0 0 1 16 10.5M12 13.5V17M8.5 21h7M9.5 17h5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.4-3.7 2.5-5.6 5.5-5.6s5.1 1.9 5.5 5.6M15.5 5.2a3.2 3.2 0 0 1 0 5.6M17 14.8c2.2.5 3.4 2.2 3.7 5.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c.6-4.1 3.2-6.2 7-6.2s6.4 2.1 7 6.2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.6 15.6 4.4 4.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12.5 4.3 4.3L19 7" />,
  copy: (
    <>
      <rect x="8" y="8" width="11.5" height="11.5" rx="2" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
    </>
  ),
  'arrow-left': <path d="m14.5 5-7 7 7 7M8 12h11" />,
  'arrow-right': <path d="m9.5 5 7 7-7 7M16 12H5" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M7.5 13h2M12 13h2M16 13h.5M7.5 16.5h2M12 16.5h2" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.3" />
      <circle cx="18" cy="6" r="2.3" />
      <path d="M8.3 18H13a3.5 3.5 0 0 0 0-7H9a3 3 0 0 1 0-6h6.7" strokeDasharray="2.4 2.8" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M14 8l4 4-4 4M18 12H9" />
    </>
  ),
  install: (
    <>
      <path d="M12 3v11M8 10.5l4 4 4-4M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  'zoom-in': (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.6 15.6 4.4 4.4M8 10.8h5.6M10.8 8v5.6" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.6 15.6 4.4 4.4M8 10.8h5.6" />
    </>
  ),
  pause: (
    <>
      <rect x="7.5" y="5" width="3" height="14" rx="1" />
      <rect x="13.5" y="5" width="3" height="14" rx="1" />
    </>
  ),
  play: <path d="M8 5.3v13.4L19 12Z" />,
  sparkle: (
    <>
      <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7Z" />
      <path d="m18.5 16 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7Z" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7M6.5 7l.8 12A1.7 1.7 0 0 0 9 20.5h6a1.7 1.7 0 0 0 1.7-1.5l.8-12M10 11v5.5M14 11v5.5" />
    </>
  ),
  link: (
    <>
      <path d="M9.5 14.5 14.5 9.5M8 17H6.5a4 4 0 0 1 0-8H9M16 7h1.5a4 4 0 0 1 0 8H15" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  'cloud-off': (
    <>
      <path d="M6.5 18.5h11a4 4 0 0 0 .8-7.9A6.2 6.2 0 0 0 8.3 7.2M4.2 5.3l15.6 15.6" />
      <path d="M5.7 9.7A4.5 4.5 0 0 0 6.5 18.5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v2.5" />
    </>
  ),
  crown: <path d="m4 8 4.2 3L12 5l3.8 6L20 8l-1.6 10H5.6Z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5Z" />
    </>
  ),
  orbit: (
    <>
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-28 12 12)" />
      <circle cx="19.7" cy="7" r="1.5" />
    </>
  ),
};

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
