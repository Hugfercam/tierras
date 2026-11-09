import type { GroupMember, LeaderboardMetric } from './types.ts';

export const LEADERBOARD_METRICS: LeaderboardMetric[] = [
  {
    id: 'countries',
    label: 'Países visitados',
    shortLabel: 'Países',
    unit: 'países',
    description:
      'Cantidad de países distintos marcados por cada miembro en este grupo. Un país cuenta una sola vez por persona.',
  },
  {
    id: 'kilometers',
    label: 'Kilómetros estimados',
    shortLabel: 'Kilómetros',
    unit: 'km',
    description:
      'Suma de las distancias ortodrómicas entre los puntos de visita, ordenados por fecha. El recorrido empieza en tu punto del país base (o su centroide) y no incluye el viaje de vuelta ni una pierna por el registro del país base.',
  },
  {
    id: 'continents',
    label: 'Continentes',
    shortLabel: 'Continentes',
    unit: 'continentes',
    description:
      'Cantidad de continentes distintos (Europa, América, Asia, África y Oceanía) con al menos un país marcado.',
  },
];

export function metricValue(member: GroupMember, metric: LeaderboardMetric['id']): number {
  return member.stats[metric];
}

export function sortMembers(
  members: GroupMember[],
  metric: LeaderboardMetric['id'],
): GroupMember[] {
  return [...members].sort((a, b) => {
    const difference = metricValue(b, metric) - metricValue(a, metric);
    if (difference !== 0) return difference;
    const countries = b.stats.countries - a.stats.countries;
    if (countries !== 0) return countries;
    const kilometers = b.stats.kilometers - a.stats.kilometers;
    if (kilometers !== 0) return kilometers;
    return a.name.localeCompare(b.name, 'es');
  });
}
