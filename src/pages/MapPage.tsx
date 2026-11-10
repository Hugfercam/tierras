import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GroupOverview, PlaceResult, Visit } from '../../shared/types.ts';
import { countryName } from '../../shared/countries.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { useToast } from '../contexts/ToastContext';
import { useOnlineStatus } from '../hooks/useUi';
import { ApiError, getPersonalOverview, removeVisit } from '../lib/api';
import { buildCityMarkers, type CityMarker } from '../lib/cityMarkers';
import { cn } from '../lib/cn';
import { countryToPlace } from '../lib/places';
import { formatInteger, formatKm } from '../lib/format';
import { CountryDialog } from '../components/map/CountryDialog';
import { GlobeView } from '../components/map/GlobeView';
import { MapSidebar } from '../components/map/MapSidebar';
import { PlaceSearch } from '../components/map/PlaceSearch';
import { TripDialog } from '../components/trips/TripDialog';
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
    openCreateGroup,
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
  const scope =
    searchParams.get('vista') === 'grupo' && activeGroup ? 'group' : 'personal';
  const currentUserId = user?.id ?? '';

  const personalQuery = useQuery({
    queryKey: ['personal', 'overview'],
    queryFn: ({ signal }) => getPersonalOverview(signal),
    enabled: Boolean(user),
  });

  const personalOverview = useMemo<GroupOverview | null>(() => {
    if (!personalQuery.data || !user) return null;
    const personal = personalQuery.data;
    return {
      group: {
        id: 'personal',
        name: 'Mi pasaporte',
        ownerId: user.id,
        inviteCode: '',
        createdAt: user.createdAt,
      },
      me: { role: 'owner' },
      members: [
        {
          id: user.id,
          name: user.name,
          homeCountryCode: user.homeCountryCode,
          role: 'owner',
          joinedAt: user.createdAt,
          stats: personal.stats,
        },
      ],
      visits: personal.visits,
      stats: {
        countries: personal.stats.countries,
        kilometers: personal.stats.kilometers,
        continents: personal.stats.continents,
        visits: personal.visits.length,
        trips: personal.stats.trips,
      },
    };
  }, [personalQuery.data, user]);

  const effectiveOverview = scope === 'personal' ? personalOverview : overview;
  const effectiveLayer = scope === 'personal' ? currentUserId : layer;
  const cityMarkers = useMemo(
    () =>
      effectiveOverview ? buildCityMarkers(effectiveOverview, effectiveLayer) : [],
    [effectiveLayer, effectiveOverview],
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
    setSelectedCity(null);
    setSelectedCountry(null);
    setCountryOpen(false);
    setSpotlight(null);
    setFocusTarget(null);
    setPendingRemove(null);
  }, [scope]);

  useEffect(() => {
    if (!selectedCity) return;
    if (!cityMarkers.some((marker) => marker.id === selectedCity.id)) {
      setSelectedCity(null);
    }
  }, [cityMarkers, selectedCity]);

  useEffect(() => {
    const iso2 = searchParams.get('pais');
    if (!effectiveOverview || !iso2) return;
    const key = `${scope}:${activeGroupId}:${iso2}`;
    if (processedCountryParam.current === key) return;
    const place = countryToPlace(iso2);
    if (!place) return;
    processedCountryParam.current = key;
    setSelectedCountry(place.countryCode);
    setSelectedCity(null);
    setSpotlight(place);
    setFocusTarget({ lat: place.lat, lng: place.lng, key: Date.now() });
    setCountryOpen(false);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('pais');
      return next;
    }, { replace: true });
  }, [
    activeGroupId,
    effectiveOverview,
    scope,
    searchParams,
    setSearchParams,
  ]);

  if (scope === 'personal') {
    if (personalQuery.isLoading && !personalOverview) {
      return <PageLoader label="Abriendo tu mapa personal…" />;
    }
    if (personalQuery.isError || !personalOverview) {
      return (
        <PageError
          title="No pudimos abrir tu mapa personal."
          description="Revisa tu conexión o recarga tus viajes."
          onRetry={() => {
            void personalQuery.refetch();
          }}
        />
      );
    }
  } else {
    if (groupsLoading || (overviewLoading && !overview)) {
      return <PageLoader label="Armando el mapa del grupo…" />;
    }
    if (groupsError) {
      return (
        <PageError
          title="No pudimos cargar tus grupos."
          description="Puede que estés sin conexión. Prueba de nuevo."
        />
      );
    }
    if (overviewError || !overview) {
      return (
        <PageError
          title="No pudimos abrir este mapa."
          description="Revisa tu conexión o intenta recargar los datos del grupo."
          onRetry={refetchOverview}
        />
      );
    }
  }

  if (!effectiveOverview) return <PageLoader label="Preparando el mapa…" />;

  const personalMode = scope === 'personal';
  const effectiveGroupName = personalMode ? 'Mi pasaporte' : activeGroup?.name ?? 'Grupo';

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

  const handleScopeChange = (nextScope: 'personal' | 'group') => {
    if (nextScope === 'group' && !activeGroup) {
      openCreateGroup();
      return;
    }
    setSelectedCity(null);
    setSelectedCountry(null);
    setCountryOpen(false);
    setSpotlight(null);
    setFocusTarget(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextScope === 'group') next.set('vista', 'grupo');
      else next.delete('vista');
      return next;
    });
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
        queryClient.invalidateQueries({ queryKey: ['personal', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['trips'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ]);
      toast(`Quitaste ${countryName(pendingRemove.countryCode)} del viaje.`, 'success');
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
            visits={effectiveOverview.visits}
            members={effectiveOverview.members}
            layer={effectiveLayer}
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
              {personalMode ? 'Mapa personal' : 'Mapa compartido'}
            </p>
            <h1>{personalMode ? 'Tu mapa' : activeGroup?.name}</h1>
            <div className="map-titles__meta">
              <span>
                <Icon name="globe" size={14} />{' '}
                {formatInteger(effectiveOverview.stats.countries)} países
              </span>
              {personalMode ? (
                <span>
                  <Icon name="route" size={14} />{' '}
                  {formatInteger(effectiveOverview.stats.trips ?? 0)} viajes
                </span>
              ) : (
                <span>
                  <Icon name="users" size={14} />{' '}
                  {formatInteger(effectiveOverview.members.length)} viajeros
                </span>
              )}
              <span>
                <Icon name="route" size={14} />{' '}
                {formatKm(effectiveOverview.stats.kilometers)}
              </span>
            </div>
          </div>

          <div className="map-scope" role="tablist" aria-label="Vista del mapa">
            <button
              type="button"
              role="tab"
              aria-selected={personalMode}
              className={cn('map-scope__option', personalMode && 'is-active')}
              onClick={() => handleScopeChange('personal')}
            >
              <Icon name="grid" size={14} />
              Mi pasaporte
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!personalMode}
              className={cn('map-scope__option', !personalMode && 'is-active')}
              title={activeGroup ? activeGroup.name : 'Crea un grupo para comparar'}
              onClick={() => handleScopeChange('group')}
            >
              <Icon name="users" size={14} />
              <span>{activeGroup?.name ?? 'Sin grupo'}</span>
            </button>
          </div>

          <div className="map-note">
            <Icon name="info" size={14} />
            <span>
              {personalMode
                ? 'Toca un país para ver tus viajes'
                : 'Toca un país para ver quién estuvo'}
            </span>
          </div>
        </div>

        <MapSidebar
          overview={effectiveOverview}
          layer={effectiveLayer}
          onLayerChange={handleLayerChange}
          currentUserId={currentUserId}
          onMarkCountry={() => {
            setVisitInitial(null);
            setVisitOpen(true);
          }}
          groupName={effectiveGroupName}
          showCities={showCities}
          cityCount={cityMarkers.length}
          onToggleCities={handleToggleCities}
          personalMode={personalMode}
        />
      </div>

      {selectedCountry && countryOpen ? (
        <CountryDialog
          groupId={personalMode ? '' : activeGroup?.id ?? ''}
          countryCode={selectedCountry}
          spotlight={spotlight}
          visits={effectiveOverview.visits}
          members={effectiveOverview.members}
          currentUserId={currentUserId}
          groupName={effectiveGroupName}
          online={online}
          personalMode={personalMode}
          onClose={() => setCountryOpen(false)}
          onMark={handleMarkCountry}
          onRemove={(visit) => setPendingRemove(visit)}
        />
      ) : null}

      <TripDialog
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
          title={`¿Quitar ${countryName(pendingRemove.countryCode)} de este viaje?`}
          description={`Se quitará el país y sus paradas del viaje. Los kilómetros y el ranking se recalculan automáticamente.`}
          confirmLabel="Quitar país"
          danger
          loading={removing}
          onConfirm={handleRemove}
          onClose={() => setPendingRemove(null)}
        />
      ) : null}
    </>
  );
}
