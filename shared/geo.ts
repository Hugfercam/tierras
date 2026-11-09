import { getCountry } from './countries.ts';
import type { MemberStats } from './types.ts';

const EARTH_RADIUS_KM = 6371.0088;

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface StatsVisit extends Coordinates {
  countryCode: string;
  visitedAt: string;
  createdAt: string;
}

export function isValidCoordinates(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Distancia ortodrómica (great-circle) entre dos puntos, en kilómetros. */
export function haversineKm(from: Coordinates, to: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Suma las piernas entre puntos en orden cronológico.
 * El origen es el punto registrado en el país base (o su centroide si no existe)
 * y el registro del país base no suma una pierna. No se suma el regreso.
 */
export function computeMemberStats(
  visits: StatsVisit[],
  homeCountryCode: string,
  totalCountries: number,
): MemberStats {
  const home = getCountry(homeCountryCode);
  const homeCode = homeCountryCode.toUpperCase();
  const homeVisit = visits.find((visit) => visit.countryCode.toUpperCase() === homeCode);
  const basePoint: Coordinates =
    homeVisit && isValidCoordinates(homeVisit.lat, homeVisit.lng)
      ? { lat: homeVisit.lat, lng: homeVisit.lng }
      : home
        ? { lat: home.lat, lng: home.lng }
        : { lat: 0, lng: 0 };

  const ordered = visits
    .filter((visit) => visit.countryCode.toUpperCase() !== homeCode)
    .sort((a, b) => {
      const dateOrder = a.visitedAt.localeCompare(b.visitedAt);
      return dateOrder !== 0 ? dateOrder : a.createdAt.localeCompare(b.createdAt);
    });

  let kilometers = 0;
  let previous = basePoint;
  for (const visit of ordered) {
    const point = isValidCoordinates(visit.lat, visit.lng)
      ? { lat: visit.lat, lng: visit.lng }
      : basePoint;
    kilometers += haversineKm(previous, point);
    previous = point;
  }

  const countryCodes = new Set(visits.map((visit) => visit.countryCode.toUpperCase()));
  const continents = new Set<string>();
  for (const code of countryCodes) {
    const region = getCountry(code)?.region;
    if (region) continents.add(region);
  }

  return {
    countries: countryCodes.size,
    kilometers: Math.round(kilometers),
    continents: continents.size,
    percentWorld:
      totalCountries > 0 ? Math.round((countryCodes.size / totalCountries) * 1000) / 10 : 0,
  };
}
