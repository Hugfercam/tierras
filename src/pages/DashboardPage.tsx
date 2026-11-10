import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  COUNTRIES,
  getCountry,
  REGION_LABELS,
  REGION_ORDER,
  TOTAL_COUNTRIES,
} from '../../shared/countries.ts';
import type { Trip, Visit } from '../../shared/types.ts';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { useToast } from '../contexts/ToastContext';
import { useOnlineStatus } from '../hooks/useUi';
import { ApiError, deleteTrip, getPersonalOverview } from '../lib/api';
import { formatDate, formatInteger, formatKm, formatPercent, todayIso } from '../lib/format';
import { TripDialog } from '../components/trips/TripDialog';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CountryFlag } from '../components/ui/CountryFlag';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon, type IconName } from '../components/ui/Icons';
import { InfoTip } from '../components/ui/InfoTip';
import { PageError, PageLoader } from '../components/ui/PageState';

function citySummary(visit: Visit): string | null {
  const names = visit.cities
    ? visit.cities.map((city) => city.name)
    : visit.cityName
      ? [visit.cityName]
      : [];
  if (names.length === 0) return null;
  const shown = names.slice(0, 3).join(' · ');
  return names.length > 3 ? `${shown} · +${names.length - 3}` : shown;
}

function tripDates(trip: Trip): string {
  return trip.startDate === trip.endDate
    ? formatDate(trip.startDate)
    : `${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}`;
}

function stopLabel(trip: Trip): string {
  if (trip.stops.length === 0) {
    return trip.countries.map((code) => getCountry(code)?.name ?? code).join(' · ');
  }
  return trip.stops
    .map((stop) => stop.cityName ?? getCountry(stop.countryCode)?.name ?? stop.countryCode)
    .join(' → ');
}

export function DashboardPage() {
  const { user } = useAuth();
  const { activeGroup, activeGroupId } = useGroup();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [tripOpen, setTripOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [deleting, setDeleting] = useState(false);

  const personalQuery = useQuery({
    queryKey: ['personal', 'overview'],
    queryFn: ({ signal }) => getPersonalOverview(signal),
    enabled: Boolean(user),
  });

  const countriesByRegion = useMemo(
    () =>
      new Map(
        REGION_ORDER.map((region) => [
          region,
          COUNTRIES.filter((country) => country.region === region).length,
        ]),
      ),
    [],
  );

  if (personalQuery.isLoading && !personalQuery.data) {
    return <PageLoader label="Preparando tu pasaporte…" />;
  }
  if (personalQuery.isError || !personalQuery.data) {
    return (
      <PageError
        title="No pudimos abrir tu pasaporte."
        description="Revisa tu conexión o recarga los datos."
        onRetry={() => {
          void personalQuery.refetch();
        }}
      />
    );
  }

  const data = personalQuery.data;
  const ownVisits = data.visits;
  const trips = data.trips;
  const latest = ownVisits[0] ?? null;
  const firstName = user?.name.split(' ')[0] ?? '';
  const worldPercent = data.stats.percentWorld;

  const regionTotals = new Map<string, number>();
  for (const visit of ownVisits) {
    const region = getCountry(visit.countryCode)?.region;
    if (!region) continue;
    regionTotals.set(region, (regionTotals.get(region) ?? 0) + 1);
  }

  const last12MonthsCutoff = (() => {
    const date = new Date(`${todayIso()}T12:00:00`);
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().slice(0, 10);
  })();
  const recentCount = ownVisits.filter((visit) => visit.visitedAt >= last12MonthsCutoff).length;
  const visitsByYear = new Map<string, number>();
  for (const visit of ownVisits) {
    const year = visit.visitedAt.slice(0, 4);
    visitsByYear.set(year, (visitsByYear.get(year) ?? 0) + 1);
  }
  const bestYear = [...visitsByYear.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const stats: Array<{
    label: string;
    value: string;
    note: string;
    icon: IconName;
    tip?: string;
  }> = [
    {
      label: 'Países visitados',
      value: formatInteger(data.stats.countries),
      note: `de ${TOTAL_COUNTRIES} en el atlas`,
      icon: 'globe',
    },
    {
      label: 'Kilómetros estimados',
      value: formatKm(data.stats.kilometers),
      note: `${formatInteger(data.stats.trips)} ${
        data.stats.trips === 1 ? 'viaje' : 'viajes'
      }`,
      icon: 'route',
      tip: 'Se suman las distancias entre países distintos, ordenados por la fecha de inicio de su primer viaje, desde tu punto en el país base.',
    },
    {
      label: 'Continentes',
      value: formatInteger(data.stats.continents),
      note: 'de 5 continentes',
      icon: 'compass',
    },
    {
      label: 'Cobertura del mundo',
      value: formatPercent(worldPercent),
      note: 'del atlas de Tierras',
      icon: 'sparkle',
    },
  ];

  const openNewTrip = () => {
    setEditingTrip(null);
    setTripOpen(true);
  };

  const openEditTrip = (trip: Trip) => {
    setEditingTrip(trip);
    setTripOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTrip(deleteTarget.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['personal', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['trips'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        activeGroupId
          ? queryClient.invalidateQueries({ queryKey: ['group', activeGroupId, 'overview'] })
          : Promise.resolve(),
      ]);
      toast('Viaje eliminado. Tus estadísticas se actualizaron.', 'success');
      setDeleteTarget(null);
    } catch (caught) {
      toast(
        caught instanceof ApiError ? caught.message : 'No pudimos eliminar el viaje.',
        'error',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="page dashboard-page">
        <header className="page-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__line" />
              Mi pasaporte
            </p>
            <h1>
              Tu viaje, <em>en perspectiva.</em>
            </h1>
            <p className="page-head__lede">
              Hola, {firstName}. Este es tu recorrido completo, con viajes en grupo o en solitario.
            </p>
          </div>
          <div className="page-head__actions">
            {activeGroup ? (
              <Link className="btn btn--ghost btn--md" to="/mapa">
                <Icon name="map" size={17} />
                Ver el mapa
              </Link>
            ) : null}
            <Button onClick={openNewTrip} disabled={!online}>
              <Icon name="plus" size={17} />
              Nuevo viaje
            </Button>
          </div>
        </header>

        <section className="stat-grid" aria-label="Tus métricas">
          {stats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <div className="stat-card__top">
                <span className="stat-card__icon">
                  <Icon name={stat.icon} size={20} />
                </span>
                {stat.tip ? <InfoTip text={stat.tip} /> : null}
              </div>
              <p className="stat-card__value">{stat.value}</p>
              <p className="stat-card__label">{stat.label}</p>
              <span className="stat-card__note">{stat.note}</span>
            </article>
          ))}
        </section>

        <div className="dashboard-grid">
          <section className="surface-card coverage-card">
            <div className="surface-card__head">
              <div>
                <p className="eyebrow">Cobertura</p>
                <h2>Tu mapa por continente</h2>
              </div>
              <span className="chip chip--muted">
                {formatPercent(worldPercent)} del mundo
              </span>
            </div>
            <div className="coverage-list">
              {REGION_ORDER.map((region) => {
                const count = regionTotals.get(region) ?? 0;
                const total = countriesByRegion.get(region) ?? 1;
                return (
                  <div className="coverage-row" key={region}>
                    <div className="coverage-row__top">
                      <span>{REGION_LABELS[region]}</span>
                      <span>
                        {formatInteger(count)} <small>de {formatInteger(total)}</small>
                      </span>
                    </div>
                    <div className="coverage-track">
                      <span
                        style={{
                          width: `${Math.min(100, (count / total) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="surface-card__foot">
              Cada barra muestra cuántos países del continente ya están en tu pasaporte.
            </p>
          </section>

          <section className="surface-card rhythm-card">
            <div className="surface-card__head">
              <div>
                <p className="eyebrow">Ritmo viajero</p>
                <h2>Tu último tramo</h2>
              </div>
              <span className="rhythm-card__spark">
                <Icon name="sparkle" size={20} />
              </span>
            </div>
            <div className="rhythm-list">
              <div className="rhythm-row">
                <span className="rhythm-row__icon">
                  <Icon name="calendar" size={18} />
                </span>
                <div>
                  <strong>{formatInteger(data.stats.days)}</strong>
                  <span>días de viaje acumulados</span>
                </div>
              </div>
              <div className="rhythm-row">
                <span className="rhythm-row__icon">
                  <Icon name="calendar" size={18} />
                </span>
                <div>
                  <strong>{formatInteger(recentCount)}</strong>
                  <span>países en los últimos 12 meses</span>
                </div>
              </div>
              <div className="rhythm-row">
                <span className="rhythm-row__icon">
                  <Icon name="trophy" size={18} />
                </span>
                <div>
                  <strong>{bestYear ? bestYear[0] : '—'}</strong>
                  <span>
                    {bestYear
                      ? `tu año más viajero · ${formatInteger(bestYear[1])} países`
                      : 'todavía sin años registrados'}
                  </span>
                </div>
              </div>
              <div className="rhythm-row">
                <span className="rhythm-row__icon">
                  <Icon name="locate" size={18} />
                </span>
                <div>
                  <strong className="flag-inline">
                    {latest ? (
                      <>
                        <CountryFlag code={latest.countryCode} size="xs" />
                        {latest.countryName}
                      </>
                    ) : (
                      '—'
                    )}
                  </strong>
                  <span>
                    {latest
                      ? `última visita · ${formatDate(latest.visitedAt)}`
                      : 'tu próxima marca empieza aquí'}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="trip-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Itinerarios</p>
              <h2>Tus viajes</h2>
            </div>
            <span className="section-head__count">
              {formatInteger(trips.length)} {trips.length === 1 ? 'viaje' : 'viajes'}
            </span>
          </div>

          {trips.length > 0 ? (
            <div className="trip-grid">
              {trips.map((trip) => (
                <article className="trip-card" key={trip.id}>
                  <div className="trip-card__head">
                    <div>
                      <h3>{trip.title}</h3>
                      <p>{tripDates(trip)}</p>
                    </div>
                    <div className="trip-card__flags">
                      {trip.countries.slice(0, 4).map((code) => (
                        <CountryFlag key={code} code={code} size="xs" />
                      ))}
                      {trip.countries.length > 4 ? (
                        <span>+{trip.countries.length - 4}</span>
                      ) : null}
                    </div>
                  </div>
                  <p className="trip-card__route">{stopLabel(trip)}</p>
                  {trip.stops.find((stop) => stop.note)?.note ? (
                    <p className="trip-card__note">
                      “{trip.stops.find((stop) => stop.note)?.note}”
                    </p>
                  ) : null}
                  <div className="trip-card__meta">
                    <span>
                      <Icon name="users" size={14} />
                      {trip.participants.map((participant) => participant.name).join(', ')}
                    </span>
                    <span>
                      <Icon name="globe" size={14} />
                      {trip.countries.length}{' '}
                      {trip.countries.length === 1 ? 'país' : 'países'}
                    </span>
                    <span>
                      <Icon name="pin" size={14} />
                      {trip.stops.length}{' '}
                      {trip.stops.length === 1 ? 'parada' : 'paradas'}
                    </span>
                  </div>
                  <div className="trip-card__actions">
                    <Button variant="ghost" onClick={() => openEditTrip(trip)} disabled={!online}>
                      <Icon name="edit" size={15} />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDeleteTarget(trip)}
                      disabled={!online}
                    >
                      <Icon name="trash" size={15} />
                      Eliminar
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Icon name="route" size={30} />}
              title="Tu primer viaje está a punto de empezar."
              description="Añade un viaje con sus países y paradas. Puede ser en solitario o con gente de tus grupos."
              actions={
                <Button onClick={openNewTrip} disabled={!online}>
                  <Icon name="plus" size={17} />
                  Crear mi primer viaje
                </Button>
              }
            />
          )}
        </section>

        <section className="passport-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Pasaporte</p>
              <h2>Tus países</h2>
            </div>
            <span className="section-head__count">
              {formatInteger(ownVisits.length)}{' '}
              {ownVisits.length === 1 ? 'país' : 'países'}
            </span>
          </div>

          {ownVisits.length > 0 ? (
            <div className="passport-grid">
              {ownVisits.map((visit) => (
                <Link
                  key={visit.id}
                  to={`/mapa?pais=${visit.countryCode}`}
                  className="passport-card"
                >
                  <span className="passport-card__flag">
                    <CountryFlag code={visit.countryCode} size="md" />
                  </span>
                  <span className="passport-card__copy">
                    <strong>{visit.countryName}</strong>
                    {citySummary(visit) ? (
                      <span
                        className="passport-card__cities"
                        title={visit.cities?.map((city) => city.name).join(' · ')}
                      >
                        {citySummary(visit)}
                      </span>
                    ) : null}
                    <span className="passport-card__date">
                      {visit.tripCount && visit.tripCount > 1
                        ? `${visit.tripCount} viajes · última visita ${formatDate(visit.visitedAt)}`
                        : formatDate(visit.visitedAt)}
                    </span>
                  </span>
                  <span className="passport-card__region">
                    {getCountry(visit.countryCode)
                      ? REGION_LABELS[getCountry(visit.countryCode)!.region]
                      : ''}
                  </span>
                  <Icon name="chevron-right" size={16} className="passport-card__arrow" />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Icon name="globe" size={30} />}
              title="Tu pasaporte está esperando la primera marca."
              description="Añade tu primer viaje y empieza a ver tu recorrido, tus kilómetros y tu lugar en el grupo."
              actions={
                <Button onClick={openNewTrip} disabled={!online}>
                  <Icon name="plus" size={17} />
                  Crear mi primer viaje
                </Button>
              }
            />
          )}
        </section>

        <p className="metric-footnote">
          <Icon name="info" size={15} />
          Los kilómetros son una estimación geográfica, no la distancia real de tus rutas. Se
          calculan una vez por país, en orden de fecha, partiendo de tu punto en el país base.
        </p>
      </div>

      <TripDialog
        open={tripOpen}
        trip={editingTrip}
        onClose={() => {
          setTripOpen(false);
          setEditingTrip(null);
        }}
        onSaved={() => {
          setTripOpen(false);
          setEditingTrip(null);
        }}
      />

      {deleteTarget ? (
        <ConfirmDialog
          title={`¿Eliminar “${deleteTarget.title}”?`}
          description="Se quitarán sus países y paradas de tu pasaporte y del de las personas participantes. Los kilómetros y el ranking se recalculan automáticamente."
          confirmLabel="Eliminar viaje"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </>
  );
}
