import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  COUNTRIES,
  getCountry,
  REGION_LABELS,
  REGION_ORDER,
  TOTAL_COUNTRIES,
} from '../../shared/countries.ts';
import type { Visit } from '../../shared/types.ts';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { VisitDialog } from '../components/map/VisitDialog';
import { NoGroupState } from '../components/group/NoGroupState';
import { Button } from '../components/ui/Button';
import { CountryFlag } from '../components/ui/CountryFlag';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon, type IconName } from '../components/ui/Icons';
import { InfoTip } from '../components/ui/InfoTip';
import { PageError, PageLoader } from '../components/ui/PageState';
import {
  formatDate,
  formatInteger,
  formatKm,
  formatPercent,
  todayIso,
} from '../lib/format';

function citySummary(visit: Visit): string | null {
  // `cities` puede faltar en una respuesta vieja del cache offline; en ese caso
  // se usa la ciudad histórica. Si la lista existe pero está vacía, se respeta.
  const names = visit.cities
    ? visit.cities.map((city) => city.name)
    : visit.cityName
      ? [visit.cityName]
      : [];
  if (names.length === 0) return null;
  const shown = names.slice(0, 3).join(' · ');
  return names.length > 3 ? `${shown} · +${names.length - 3}` : shown;
}

export function DashboardPage() {
  const { user } = useAuth();
  const {
    activeGroup,
    groupsLoading,
    groupsError,
    overview,
    overviewLoading,
    overviewError,
    refetchOverview,
    currentMember,
  } = useGroup();
  const [visitOpen, setVisitOpen] = useState(false);

  const ownVisits = useMemo(() => {
    if (!overview || !user) return [];
    return overview.visits
      .filter((visit) => visit.userId === user.id)
      .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
  }, [overview, user]);

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

  if (groupsLoading) return <PageLoader label="Preparando tu panel…" />;
  if (groupsError) {
    return (
      <PageError
        title="No pudimos cargar tu panel."
        description="Revisa tu conexión y vuelve a intentarlo."
      />
    );
  }
  if (!activeGroup) {
    return (
      <div className="standalone-page">
        <NoGroupState compact />
      </div>
    );
  }
  if (overviewLoading && !overview) return <PageLoader label="Sumando tus viajes…" />;
  if (overviewError || !overview || !currentMember) {
    return (
      <PageError
        title="No pudimos abrir tu panel."
        description="Revisa tu conexión o recarga los datos del grupo."
        onRetry={refetchOverview}
      />
    );
  }

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
  const latest = ownVisits[0] ?? null;
  const firstName = user?.name.split(' ')[0] ?? '';
  const worldPercent = currentMember.stats.percentWorld;

  const stats: Array<{
    label: string;
    value: string;
    note: string;
    icon: IconName;
    tip?: string;
  }> = [
    {
      label: 'Países visitados',
      value: formatInteger(currentMember.stats.countries),
      note: `de ${TOTAL_COUNTRIES} en el atlas`,
      icon: 'globe',
    },
    {
      label: 'Kilómetros estimados',
      value: formatKm(currentMember.stats.kilometers),
      note: 'recorrido acumulado',
      icon: 'route',
      tip: 'Se suman las distancias entre tus puntos de visita, ordenados por fecha, desde tu punto en el país base (o su centroide). No incluye el regreso.',
    },
    {
      label: 'Continentes',
      value: formatInteger(currentMember.stats.continents),
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

  return (
    <>
      <div className="page dashboard-page">
        <header className="page-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__line" />
              Mi panel · {activeGroup.name}
            </p>
            <h1>
              Tu viaje, <em>en perspectiva.</em>
            </h1>
            <p className="page-head__lede">
              Hola, {firstName}. Este es el recorrido que construiste dentro de {activeGroup.name}.
            </p>
          </div>
          <div className="page-head__actions">
            <Link className="btn btn--ghost btn--md" to="/mapa">
              <Icon name="map" size={17} />
              Ver el mapa
            </Link>
            <Button onClick={() => setVisitOpen(true)}>
              <Icon name="plus" size={17} />
              Marcar país
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
              Cada barra muestra cuántos países del continente ya están en tu mapa.
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
                      ? `última marca · ${formatDate(latest.visitedAt)}`
                      : 'tu próxima marca empieza aquí'}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="passport-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Pasaporte</p>
              <h2>Tus países en {activeGroup.name}</h2>
            </div>
            <span className="section-head__count">
              {formatInteger(ownVisits.length)} {ownVisits.length === 1 ? 'marca' : 'marcas'}
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
                    <span className="passport-card__date">{formatDate(visit.visitedAt)}</span>
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
              description="Suma el primer país y empieza a ver tu recorrido, tus kilómetros y tu lugar en el grupo."
              actions={
                <Button onClick={() => setVisitOpen(true)}>
                  <Icon name="plus" size={17} />
                  Marcar mi primer país
                </Button>
              }
            />
          )}
        </section>

        <p className="metric-footnote">
          <Icon name="info" size={15} />
          Los kilómetros son una estimación geográfica, no la distancia real de tus rutas. Se
          calculan con la distancia ortodrómica entre los puntos de visita, en orden de fecha,
          partiendo de tu punto en el país base.
        </p>
      </div>

      <VisitDialog
        open={visitOpen}
        onClose={() => setVisitOpen(false)}
        onSaved={() => setVisitOpen(false)}
      />
    </>
  );
}
