import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getCountry } from '../../shared/countries.ts';
import {
  LEADERBOARD_METRICS,
  metricValue,
  sortMembers,
} from '../../shared/leaderboard.ts';
import type { GroupMember, LeaderboardMetric } from '../../shared/types.ts';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { NoGroupState } from '../components/group/NoGroupState';
import { Avatar } from '../components/ui/Avatar';
import { CountryFlag } from '../components/ui/CountryFlag';
import { Icon } from '../components/ui/Icons';
import { PageError, PageLoader } from '../components/ui/PageState';
import { formatInteger, formatKm } from '../lib/format';
import { cn } from '../lib/cn';

function formatMetric(member: GroupMember, metric: LeaderboardMetric['id']): string {
  if (metric === 'kilometers') return formatKm(member.stats.kilometers);
  return formatInteger(member.stats[metric]);
}

function secondaryLabel(member: GroupMember, metric: LeaderboardMetric['id']): string {
  if (metric === 'kilometers') {
    return `${formatInteger(member.stats.countries)} países`;
  }
  if (metric === 'countries') return formatKm(member.stats.kilometers);
  return `${formatInteger(member.stats.countries)} países`;
}

export function LeaderboardPage() {
  const { user } = useAuth();
  const {
    activeGroup,
    groupsLoading,
    groupsError,
    overview,
    overviewLoading,
    overviewError,
    refetchOverview,
  } = useGroup();
  const [metricId, setMetricId] = useState<LeaderboardMetric['id']>('countries');

  if (groupsLoading) return <PageLoader label="Preparando el ranking…" />;
  if (groupsError) {
    return (
      <PageError
        title="No pudimos cargar el ranking."
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
  if (overviewLoading && !overview) return <PageLoader label="Comparando recorridos…" />;
  if (overviewError || !overview) {
    return (
      <PageError
        title="No pudimos abrir el ranking."
        description="Revisa tu conexión o recarga los datos del grupo."
        onRetry={refetchOverview}
      />
    );
  }

  const metric = LEADERBOARD_METRICS.find((item) => item.id === metricId)!;
  const sorted = sortMembers(overview.members, metricId);
  const top3 = sorted.slice(0, 3);
  const podium = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;
  const leaderValue = top3[0] ? metricValue(top3[0], metricId) : 0;

  return (
    <div className="page leaderboard-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__line" />
            Ranking · {activeGroup.name}
          </p>
          <h1>
            Quién va <em>más lejos.</em>
          </h1>
          <p className="page-head__lede">
            Una foto amistosa del recorrido del grupo. Elige la categoría y mira cómo se mueven
            las posiciones.
          </p>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--ghost btn--md" to="/mapa">
            <Icon name="map" size={17} />
            Ver el mapa
          </Link>
        </div>
      </header>

      <div className="leaderboard-tabs" role="tablist" aria-label="Categoría del ranking">
        {LEADERBOARD_METRICS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={metricId === item.id}
            className={cn('leaderboard-tab', metricId === item.id && 'is-active')}
            onClick={() => setMetricId(item.id)}
          >
            <Icon
              name={item.id === 'countries' ? 'globe' : item.id === 'kilometers' ? 'route' : 'compass'}
              size={17}
            />
            {item.shortLabel}
          </button>
        ))}
      </div>

      <section className="podium" aria-label="Tres primeros puestos">
        {podium.map((member) => {
          const rank = sorted.findIndex((item) => item.id === member.id) + 1;
          return (
            <article
              key={member.id}
              className={cn('podium-card', `podium-card--${rank}`, member.id === user?.id && 'is-me')}
            >
              {rank === 1 ? (
                <span className="podium-card__crown">
                  <Icon name="crown" size={20} />
                </span>
              ) : null}
              <span className="podium-card__rank">{rank}°</span>
              <Avatar
                name={member.name}
                index={overview.members.findIndex((item) => item.id === member.id)}
                size={rank === 1 ? 'xl' : 'lg'}
              />
              <div className="podium-card__name">
                <strong>{member.name}</strong>
                {member.id === user?.id ? <span className="you-tag">Tú</span> : null}
                <small>
                  <CountryFlag code={member.homeCountryCode} size="xs" /> Base en{' '}
                  {getCountry(member.homeCountryCode)?.name ?? member.homeCountryCode}
                </small>
              </div>
              <p className="podium-card__value">{formatMetric(member, metricId)}</p>
              <span className="podium-card__metric">{metric.label.toLowerCase()}</span>
              <span className="podium-card__secondary">{secondaryLabel(member, metricId)}</span>
            </article>
          );
        })}
      </section>

      <div className="leaderboard-layout">
        <section className="surface-card leaderboard-table-card">
          <div className="surface-card__head">
            <div>
              <p className="eyebrow">Tabla completa</p>
              <h2>{metric.label}</h2>
            </div>
            <span className="chip chip--muted">
              {formatInteger(overview.members.length)} viajeros
            </span>
          </div>
          <ol className="ranking-list">
            {sorted.map((member, index) => {
              const value = metricValue(member, metricId);
              const percent = leaderValue > 0 ? (value / leaderValue) * 100 : 0;
              const memberIndex = overview.members.findIndex((item) => item.id === member.id);
              return (
                <li
                  key={member.id}
                  className={cn('ranking-row', member.id === user?.id && 'is-me')}
                >
                  <span className="ranking-row__rank">{index + 1}</span>
                  <Avatar name={member.name} index={memberIndex} size="sm" />
                  <div className="ranking-row__identity">
                    <strong>
                      {member.name}
                      {member.id === user?.id ? <span className="you-tag">Tú</span> : null}
                    </strong>
                    <span>{secondaryLabel(member, metricId)}</span>
                  </div>
                  <div className="ranking-row__bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(percent, member.id === user?.id ? 4 : 2)}%` }} />
                  </div>
                  <span className="ranking-row__value">{formatMetric(member, metricId)}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="surface-card criteria-card">
          <div className="criteria-card__icon">
            <Icon name="info" size={20} />
          </div>
          <p className="eyebrow">Criterio de cálculo</p>
          <h2>{metric.label}</h2>
          <p>{metric.description}</p>
          <div className="criteria-card__divider" />
          <h3>Cómo se desempata</h3>
          <ol>
            <li>Más países visitados.</li>
            <li>Más kilómetros estimados.</li>
            <li>Orden alfabético del nombre.</li>
          </ol>
          <p className="criteria-card__note">
            Los kilómetros son estimaciones geográficas. No representan la ruta real ni incluyen
            el viaje de vuelta.
          </p>
        </aside>
      </div>
    </div>
  );
}
