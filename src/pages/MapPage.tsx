import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PlaceResult, Visit } from '../../shared/types.ts';
import { countryName } from '../../shared/countries.ts';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { useToast } from '../contexts/ToastContext';
import { useOnlineStatus } from '../hooks/useUi';
import { ApiError, removeVisit } from '../lib/api';
import { buildCityMarkers, type CityMarker } from '../lib/cityMarkers';
import { countryToPlace } from '../lib/places';
import { formatInteger, formatKm } from '../lib/format';
import { CountryDialog } from '../components/map/CountryDialog';
import { GlobeView } from '../components/map/GlobeView';
import { MapSidebar } from '../components/map/MapSidebar';
import { PlaceSearch } from '../components/map/PlaceSearch';
import { VisitDialog } from '../components/map/VisitDialog';
import { NoGroupState } from '../components/group/NoGroupState';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CountryFlag } from '../components/ui/CountryFlag';
import { Icon } from '../components/ui/Icons';
import { PageError, PageLoader } from '../components/ui/PageState';
import type { GlobeFocusTarget } from '../lib/globeEngine';

export function MapPage() {
  const { user } = useAuth();
  const {
    activeGroup,
    activeGroupId,
    groupsLoading,
    groupsError,
    overview,
    overviewLoading,
    overviewError,
    refetchOverview,
  } = useGroup();
  const online = useOnlineStatus();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [layer, setLayer] = useState('group');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [spotlight, setSpotlight] = useState<PlaceResult | null>(null);
  const [focusTarget, setFocusTarget] = useState<GlobeFocusTarget | null>(null);
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitInitial, setVisitInitial] = useState<PlaceResult | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Visit | null>(null);
  const [removing, setRemoving] = useState(false);
  const [showCities, setShowCities] = useState(true);
  const [selectedCity, setSelectedCity] = useState<CityMarker | null>(null);
  const processedCountryParam = useRef<string | null>(null);
  const cityMarkers = useMemo(
    () => (overview ? buildCityMarkers(overview, layer) : []),
    [layer, overview],
  );

  useEffect(() => {
    setLayer('group');
    setSelectedCountry(null);
    setCountryOpen(false);
    setSpotlight(null);
    setFocusTarget(null);
    setVisitOpen(false);
    setPendingRemove(null);
    setSelectedCity(null);
    setShowCities(true);
  }, [activeGroupId]);

  useEffect(() => {
    if (!selectedCity) return;
    if (!cityMarkers.some((marker) => marker.id === selectedCity.id)) {
      setSelectedCity(null);
    }
  }, [cityMarkers, selectedCity]);

  useEffect(() => {
    const iso2 = searchParams.get('pais');
    if (!overview || !iso2) return;
    const key = `${activeGroupId}:${iso2}`;
    if (processedCountryParam.current === key) return;
    const place = countryToPlace(iso2);
    if (!place) return;
    processedCountryParam.current = key;
    setSelectedCountry(place.countryCode);
    setSelectedCity(null);
    setSpotlight(place);
    setFocusTarget({ lat: place.lat, lng: place.lng, key: Date.now() });
    setCountryOpen(false);
    setSearchParams({}, { replace: true });
  }, [activeGroupId, overview, searchParams, setSearchParams]);

  if (groupsLoading) return <PageLoader label="Buscando tus grupos…" />;
  if (groupsError) {
    return (
      <PageError
        title="No pudimos cargar tus grupos."
        description="Puede que estés sin conexión. Prueba de nuevo."
      />
    );
  }
  if (!activeGroup) {
    return (
      <div className="standalone-page">
        <NoGroupState />
      </div>
    );
  }
  if (overviewLoading && !overview) return <PageLoader label="Armando el mapa del grupo…" />;
  if (overviewError || !overview) {
    return (
      <PageError
        title="No pudimos abrir este mapa."
        description="Revisa tu conexión o intenta recargar los datos del grupo."
        onRetry={refetchOverview}
      />
    );
  }

  const currentUserId = user?.id ?? '';
  const selectedMember = overview.members.find((member) => member.id === layer) ?? null;

  const handleCitySelect = (city: CityMarker | null) => {
    if (!city) {
      setSelectedCity(null);
      setSelectedCountry(null);
      return;
    }
    setSelectedCity(city);
    setSelectedCountry(city.countryCode);
    setSpotlight(null);
    setFocusTarget(null);
    setCountryOpen(false);
  };

  const handleSearchSelect = (place: PlaceResult) => {
    if (showCities && place.type === 'city') {
      const visitedCity = cityMarkers.find(
        (marker) =>
          marker.countryCode === place.countryCode &&
          Math.abs(marker.lat - place.lat) < 0.02 &&
          Math.abs(marker.lng - place.lng) < 0.02,
      );
      if (visitedCity) {
        handleCitySelect(visitedCity);
        return;
      }
    }

    setSelectedCountry(place.countryCode);
    setSelectedCity(null);
    setSpotlight(place);
    setFocusTarget({ lat: place.lat, lng: place.lng, key: Date.now() });
    setCountryOpen(false);
  };

  const handleCountryClick = (iso2: string | null) => {
    setSelectedCity(null);
    if (!iso2) {
      setCountryOpen(false);
      return;
    }
    setSelectedCountry(iso2);
    setSpotlight(null);
    setFocusTarget(null);
    setCountryOpen(true);
  };

  const handleLayerChange = (nextLayer: string) => {
    setLayer(nextLayer);
    setSelectedCity(null);
    setSelectedCountry(null);
  };

  const handleToggleCities = () => {
    setShowCities((current) => !current);
    setSelectedCity(null);
    setSelectedCountry(null);
  };

  const handleMarkCountry = () => {
    setSelectedCity(null);
    const place =
      spotlight && selectedCountry && spotlight.countryCode === selectedCountry
        ? spotlight
        : selectedCountry
          ? countryToPlace(selectedCountry)
          : null;
    setVisitInitial(place);
    setVisitOpen(true);
    setCountryOpen(false);
  };

  const handleRemove = async () => {
    if (!pendingRemove || !activeGroupId) return;
    setRemoving(true);
    try {
      await removeVisit(activeGroupId, pendingRemove.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group', activeGroupId, 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ]);
      toast(`Quitaste ${countryName(pendingRemove.countryCode)} de tu recorrido.`, 'success');
      setPendingRemove(null);
    } catch (caught) {
      toast(
        caught instanceof ApiError ? caught.message : 'No pudimos quitar la visita.',
        'error',
      );
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="map-page">
        <div className="map-stage">
          <GlobeView
            visits={overview.visits}
            members={overview.members}
            layer={layer}
            selectedCountry={selectedCountry}
            focusTarget={focusTarget}
            cityMarkers={cityMarkers}
            showCities={showCities}
            selectedCity={selectedCity}
            onCountrySelect={handleCountryClick}
            onCitySelect={handleCitySelect}
          />

          <div className="map-search">
            <PlaceSearch onSelect={handleSearchSelect} />
          </div>

          {spotlight && !countryOpen ? (
            <div className="search-spotlight" role="status">
              <span className="search-spotlight__flag">
                <CountryFlag code={spotlight.countryCode} size="md" />
              </span>
              <div className="search-spotlight__copy">
                <span>{spotlight.type === 'country' ? 'País en el mapa' : 'Ciudad en el mapa'}</span>
                <strong>{spotlight.name}</strong>
                <small>{spotlight.subtitle}</small>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setCountryOpen(true)}
              >
                Ver ficha
              </Button>
              <button
                type="button"
                className="icon-button icon-button--small"
                aria-label="Cerrar resultado"
                onClick={() => {
                  setSpotlight(null);
                  setSelectedCountry(null);
                  setFocusTarget(null);
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : null}

          <div className="map-titles">
            <p className="eyebrow eyebrow--light">
              <span className="eyebrow__line" />
              Mapa compartido
            </p>
            <h1>{activeGroup.name}</h1>
            <div className="map-titles__meta">
              <span>
                <Icon name="globe" size={14} /> {formatInteger(overview.stats.countries)} países
              </span>
              <span>
                <Icon name="users" size={14} /> {formatInteger(overview.members.length)} viajeros
              </span>
              <span>
                <Icon name="route" size={14} /> {formatKm(overview.stats.kilometers)}
              </span>
            </div>
          </div>

          <div className="map-viewing">
            <span className="map-viewing__dot" />
            {selectedMember ? `Viendo a ${selectedMember.name.split(' ')[0]}` : 'Viendo todo el grupo'}
          </div>

          <div className="map-note">
            <Icon name="info" size={14} />
            <span>Toca un país para ver quién estuvo</span>
          </div>
        </div>

        <MapSidebar
          overview={overview}
          layer={layer}
          onLayerChange={handleLayerChange}
          currentUserId={currentUserId}
          onMarkCountry={() => {
            setVisitInitial(null);
            setVisitOpen(true);
          }}
          groupName={activeGroup.name}
          showCities={showCities}
          cityCount={cityMarkers.length}
          onToggleCities={handleToggleCities}
        />
      </div>

      {selectedCountry && countryOpen ? (
        <CountryDialog
          groupId={activeGroup.id}
          countryCode={selectedCountry}
          spotlight={spotlight}
          visits={overview.visits}
          members={overview.members}
          currentUserId={currentUserId}
          groupName={activeGroup.name}
          online={online}
          onClose={() => setCountryOpen(false)}
          onMark={handleMarkCountry}
          onRemove={(visit) => setPendingRemove(visit)}
        />
      ) : null}

      <VisitDialog
        open={visitOpen}
        initialPlace={visitInitial}
        onClose={() => setVisitOpen(false)}
        onSaved={() => {
          setVisitOpen(false);
          setCountryOpen(false);
        }}
      />

      {pendingRemove ? (
        <ConfirmDialog
          title={`¿Quitar ${countryName(pendingRemove.countryCode)} de tu recorrido?`}
          description={`Se borrará tu marca en ${activeGroup.name}. Los kilómetros y el ranking se recalculan automáticamente.`}
          confirmLabel="Quitar marca"
          danger
          loading={removing}
          onConfirm={handleRemove}
          onClose={() => setPendingRemove(null)}
        />
      ) : null}
    </>
  );
}
