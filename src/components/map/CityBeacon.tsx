import { getCountry } from '../../../shared/countries.ts';
import { formatDate } from '../../lib/format';
import type { CityMarker } from '../../lib/cityMarkers';
import { CountryFlag } from '../ui/CountryFlag';
import { Icon } from '../ui/Icons';

interface CityBeaconProps {
  marker: CityMarker;
  screen: { x: number; y: number; visible: boolean };
  onClose: () => void;
  onOpenCountry: (countryCode: string) => void;
}

export function CityBeacon({
  marker,
  screen,
  onClose,
  onOpenCountry,
}: CityBeaconProps) {
  if (!screen.visible) return null;

  const country = getCountry(marker.countryCode);
  const count = marker.memberNames.length;
  const detail = marker.isGroup
    ? `${count} ${count === 1 ? 'viajero' : 'viajeros'} del grupo`
    : `${marker.memberNames[0]} · ${formatDate(marker.visitedAt)}`;

  return (
    <div
      className="city-beacon"
      style={{ left: Math.round(screen.x), top: Math.round(screen.y) }}
    >
      <button
        type="button"
        className="city-beacon__close"
        onClick={onClose}
        aria-label="Cerrar la ciudad"
      >
        <Icon name="close" size={11} />
      </button>

      <span className="city-beacon__pin" aria-hidden="true">
        <CountryFlag code={marker.countryCode} size="lg" />
      </span>
      <span className="city-beacon__stem" aria-hidden="true" />
      <button
        type="button"
        className="city-beacon__label"
        onClick={() => onOpenCountry(marker.countryCode)}
        title="Ver la ficha del país"
      >
        <strong>{marker.cityName}</strong>
        <span>
          {country?.name ?? marker.countryCode} · {detail}
        </span>
        {marker.isGroup && count > 1 ? (
          <small>
            {marker.memberNames.slice(0, 3).join(' · ')}
            {count > 3 ? ` +${count - 3}` : ''}
          </small>
        ) : null}
      </button>
    </div>
  );
}
