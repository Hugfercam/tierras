import { useEffect, useMemo, useRef, useState } from 'react';
import { countryName } from '../../../shared/countries.ts';
import type { GroupMember, Visit } from '../../../shared/types.ts';
import { useReducedMotion } from '../../hooks/useUi';
import { cn } from '../../lib/cn';
import type { CityMarker } from '../../lib/cityMarkers';
import {
  GlobeEngine,
  type BeaconScreenPosition,
  type GlobeData,
  type GlobeFocusTarget,
} from '../../lib/globeEngine';
import { CityBeacon } from './CityBeacon';
import { CountryFlag } from '../ui/CountryFlag';
import { Icon } from '../ui/Icons';

interface GlobeViewProps {
  visits: Visit[];
  members: GroupMember[];
  layer: string;
  selectedCountry: string | null;
  focusTarget: GlobeFocusTarget | null;
  cityMarkers: CityMarker[];
  showCities: boolean;
  selectedCity: CityMarker | null;
  onCountrySelect: (iso2: string | null) => void;
  onCitySelect: (city: CityMarker | null) => void;
  className?: string;
}

interface HoverState {
  iso2: string;
  x: number;
  y: number;
}

export function GlobeView({
  visits,
  members,
  layer,
  selectedCountry,
  focusTarget,
  cityMarkers,
  showCities,
  selectedCity,
  onCountrySelect,
  onCitySelect,
  className,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);
  const onCountryRef = useRef(onCountrySelect);
  const onCityRef = useRef(onCitySelect);
  const cityMarkersRef = useRef(cityMarkers);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [beaconScreen, setBeaconScreen] = useState<BeaconScreenPosition | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [failed, setFailed] = useState(false);
  const reducedMotion = useReducedMotion();

  onCountryRef.current = onCountrySelect;
  onCityRef.current = onCitySelect;
  cityMarkersRef.current = cityMarkers;

  const visitorCount = useMemo(() => {
    if (!hover) return 0;
    return new Set(
      visits.filter((visit) => visit.countryCode === hover.iso2).map((visit) => visit.userId),
    ).size;
  }, [hover, visits]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      const engine = new GlobeEngine(
        container,
        {
          onCountryClick: (iso2) => onCountryRef.current(iso2),
          onCityClick: (cityId) => {
            const city = cityMarkersRef.current.find((marker) => marker.id === cityId);
            if (city) onCityRef.current(city);
          },
          onHover: (payload) => {
            if (!payload) {
              setHover(null);
              return;
            }
            setHover({ iso2: payload.iso2, x: payload.x, y: payload.y });
          },
          onBeaconScreen: (position) => setBeaconScreen(position),
        },
        { reducedMotion },
      );
      engineRef.current = engine;
      engine.setData({
        visits,
        members,
        layer,
        selectedCountry,
      });
      setAutoRotate(engine.isAutoRotating());
    } catch (error) {
      console.error('No se pudo iniciar el globo 3D', error);
      setFailed(true);
    }

    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // La instancia se crea una sola vez; los datos se sincronizan en el efecto siguiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    const data: GlobeData = { visits, members, layer, selectedCountry };
    engineRef.current?.setData(data);
  }, [layer, members, selectedCountry, visits]);

  useEffect(() => {
    engineRef.current?.setCityMarkers(cityMarkers, showCities);
  }, [cityMarkers, showCities]);

  useEffect(() => {
    setBeaconScreen(null);
    if (!engineRef.current) return;
    engineRef.current.selectCity(
      selectedCity ? { lat: selectedCity.lat, lng: selectedCity.lng } : null,
    );
  }, [selectedCity]);

  useEffect(() => {
    if (!engineRef.current) return;
    if (focusTarget) engineRef.current.focus(focusTarget);
    else engineRef.current.clearFocusMarker();
  }, [focusTarget]);

  const toggleRotation = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = !autoRotate;
    engine.setAutoRotate(next);
    setAutoRotate(next);
  };

  return (
    <div className={cn('globe', className)} ref={containerRef}>
      {failed ? (
        <div className="globe__failed">
          <Icon name="globe" size={32} />
          <p>Tu navegador no pudo iniciar la vista 3D.</p>
          <span>Prueba con un navegador actualizado o activa la aceleración por hardware.</span>
        </div>
      ) : null}

      <div className="globe__vignette" aria-hidden="true" />

      {hover ? (
        <div
          className="globe-tooltip"
          style={{ left: hover.x + 16, top: hover.y + 16 }}
          role="tooltip"
        >
          <span className="globe-tooltip__flag">
            <CountryFlag code={hover.iso2} size="sm" />
          </span>
          <span>
            <strong>{countryName(hover.iso2)}</strong>
            <small>
              {visitorCount === 0
                ? 'Sin marcar en el grupo'
                : `${visitorCount} ${visitorCount === 1 ? 'viajero' : 'viajeros'} del grupo`}
            </small>
          </span>
        </div>
      ) : null}

      {selectedCity && beaconScreen ? (
        <CityBeacon
          marker={selectedCity}
          screen={beaconScreen}
          onClose={() => onCityRef.current(null)}
          onOpenCountry={(countryCode) => onCountryRef.current(countryCode)}
        />
      ) : null}

      <div className="globe__controls" aria-label="Controles del globo">
        <button
          type="button"
          className="globe-control"
          onClick={() => engineRef.current?.zoomBy(0.82)}
          aria-label="Acercar el globo"
        >
          <Icon name="zoom-in" size={19} />
        </button>
        <button
          type="button"
          className="globe-control"
          onClick={() => engineRef.current?.zoomBy(1.22)}
          aria-label="Alejar el globo"
        >
          <Icon name="zoom-out" size={19} />
        </button>
        <button
          type="button"
          className="globe-control"
          onClick={() => engineRef.current?.resetView()}
          aria-label="Restablecer la vista"
        >
          <Icon name="locate" size={18} />
        </button>
        <button
          type="button"
          className={cn('globe-control', autoRotate && 'is-active')}
          onClick={toggleRotation}
          aria-label={autoRotate ? 'Pausar rotación' : 'Activar rotación'}
          aria-pressed={autoRotate}
        >
          <Icon name={autoRotate ? 'pause' : 'play'} size={17} />
        </button>
      </div>

      <p className="globe__hint">
        Arrastra para girar <span>·</span> Usa dos dedos o la rueda para acercar
      </p>
      <p className="sr-only">
        Globo terráqueo interactivo con los países visitados por el grupo. También puedes usar el
        buscador para ubicar un país o una ciudad.
      </p>
    </div>
  );
}
