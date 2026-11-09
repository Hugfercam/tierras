import type { GroupOverview } from '../../shared/types.ts';
import { memberColor } from './colors.ts';

export interface CityMarker {
  id: string;
  cityName: string;
  countryCode: string;
  lat: number;
  lng: number;
  memberNames: string[];
  visitedAt: string;
  color: string;
  isGroup: boolean;
}

const GROUP_COLOR = '#f7dca4';

/**
 * Convierte las ciudades de las visitas en marcadores geolocalizados.
 * En vista de grupo agrupa por coordenadas para no dibujar varias chinchetas
 * sobre la misma ciudad; en vista de miembro conserva una por ciudad.
 */
export function buildCityMarkers(overview: GroupOverview, layer: string): CityMarker[] {
  const membersById = new Map(overview.members.map((member) => [member.id, member]));
  const memberIndex = new Map(overview.members.map((member, index) => [member.id, index]));
  const markers = new Map<string, CityMarker>();
  const isGroup = layer === 'group';

  for (const visit of overview.visits) {
    if (!isGroup && visit.userId !== layer) continue;
    const member = membersById.get(visit.userId);
    if (!member) continue;

    for (const city of visit.cities ?? []) {
      if (city.lat === null || city.lng === null) continue;
      const key = isGroup
        ? `${visit.countryCode}:${city.lat.toFixed(3)}:${city.lng.toFixed(3)}`
        : `city:${city.id}`;
      const existing = markers.get(key);
      if (existing) {
        if (!existing.memberNames.includes(member.name)) {
          existing.memberNames.push(member.name);
        }
        continue;
      }

      markers.set(key, {
        id: key,
        cityName: city.name,
        countryCode: visit.countryCode,
        lat: city.lat,
        lng: city.lng,
        memberNames: [member.name],
        visitedAt: visit.visitedAt,
        color: isGroup ? GROUP_COLOR : memberColor(memberIndex.get(visit.userId) ?? 0),
        isGroup,
      });
    }
  }

  return [...markers.values()].sort(
    (a, b) =>
      a.countryCode.localeCompare(b.countryCode) ||
      a.cityName.localeCompare(b.cityName, 'es'),
  );
}
