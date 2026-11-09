import { geoContains } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import geoData from '../data/countries.geo.json';

export interface CountryProperties {
  iso2: string | null;
  name: string;
}

export type CountryFeature = Feature<Polygon | MultiPolygon, CountryProperties>;

export const COUNTRY_FEATURES = (
  geoData as unknown as FeatureCollection<Polygon | MultiPolygon, CountryProperties>
).features;

export const FEATURE_BY_ISO = new Map(
  COUNTRY_FEATURES.filter(
    (feature): feature is CountryFeature & { properties: { iso2: string; name: string } } =>
      Boolean(feature.properties.iso2),
  ).map((feature) => [feature.properties.iso2, feature]),
);

export function countryAtPoint(lat: number, lng: number): string | null {
  const point: [number, number] = [lng, lat];
  for (const feature of COUNTRY_FEATURES) {
    if (geoContains(feature, point)) return feature.properties.iso2;
  }
  return null;
}
