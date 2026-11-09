import citiesData from '../data/cities.json';
import {
  COUNTRIES,
  getCountry,
  regionLabel,
  type Country,
} from '../../shared/countries.ts';
import type { PlaceResult } from '../../shared/types.ts';
import { formatCompact, normalizeText } from './format.ts';

interface CityRow {
  name: string;
  country: string;
  lat: number;
  lng: number;
  population: number;
  capital: boolean;
}

interface IndexedCity extends CityRow {
  normalized: string;
  countryName: string;
  flag: string;
}

const CITIES = citiesData as CityRow[];

const COUNTRY_ALIASES: Record<string, string> = {
  eeuu: 'US',
  usa: 'US',
  'estados unidos de america': 'US',
  uk: 'GB',
  'gran bretana': 'GB',
  inglaterra: 'GB',
  holanda: 'NL',
  'republica checa': 'CZ',
  'corea del sur': 'KR',
  'corea del norte': 'KP',
  emiratos: 'AE',
  'emiratos arabes': 'AE',
  'emiratos arabes unidos': 'AE',
  vaticano: 'VA',
  'ciudad del vaticano': 'VA',
  'san marino': 'SM',
  'santa sede': 'VA',
  'republica dominicana': 'DO',
  'republica del congo': 'CG',
  'republica democratica del congo': 'CD',
  'costa de marfil': 'CI',
  'paises bajos': 'NL',
};

interface CityAlias {
  alias: string;
  city: string;
  country: string;
  /** Nombre que se muestra y guarda cuando se elige el alias. */
  label?: string;
}

const CITY_ALIASES: CityAlias[] = [
  { alias: 'londres', city: 'London', country: 'GB', label: 'Londres' },
  { alias: 'roma', city: 'Rome', country: 'IT', label: 'Roma' },
  { alias: 'milan', city: 'Milan', country: 'IT', label: 'Milán' },
  { alias: 'munich', city: 'Munich', country: 'DE', label: 'Múnich' },
  { alias: 'atenas', city: 'Athens', country: 'GR', label: 'Atenas' },
  { alias: 'pekin', city: 'Beijing', country: 'CN', label: 'Pekín' },
  { alias: 'tokio', city: 'Tokyo', country: 'JP', label: 'Tokio' },
  { alias: 'el cairo', city: 'Cairo', country: 'EG', label: 'El Cairo' },
  { alias: 'nueva york', city: 'New York City', country: 'US', label: 'Nueva York' },
  { alias: 'washington dc', city: 'Washington, D.C.', country: 'US', label: 'Washington D. C.' },
  { alias: 'moscu', city: 'Moscow', country: 'RU', label: 'Moscú' },
  { alias: 'lisboa', city: 'Lisbon', country: 'PT', label: 'Lisboa' },
  { alias: 'oporto', city: 'Porto', country: 'PT', label: 'Oporto' },
  { alias: 'florencia', city: 'Florence', country: 'IT', label: 'Florencia' },
  { alias: 'venecia', city: 'Venice', country: 'IT', label: 'Venecia' },
  { alias: 'napoles', city: 'Naples', country: 'IT', label: 'Nápoles' },
  { alias: 'bruselas', city: 'Brussels', country: 'BE', label: 'Bruselas' },
  { alias: 'gante', city: 'Gent', country: 'BE', label: 'Gante' },
  { alias: 'amberes', city: 'Antwerpen', country: 'BE', label: 'Amberes' },
  { alias: 'brujas', city: 'Brugge', country: 'BE', label: 'Brujas' },
  { alias: 'viena', city: 'Vienna', country: 'AT', label: 'Viena' },
  { alias: 'praga', city: 'Prague', country: 'CZ', label: 'Praga' },
  { alias: 'copenhague', city: 'Copenhagen', country: 'DK', label: 'Copenhague' },
  { alias: 'estocolmo', city: 'Stockholm', country: 'SE', label: 'Estocolmo' },
  { alias: 'varsovia', city: 'Warsaw', country: 'PL', label: 'Varsovia' },
  { alias: 'cracovia', city: 'Krakow', country: 'PL', label: 'Cracovia' },
  { alias: 'estambul', city: 'Istanbul', country: 'TR', label: 'Estambul' },
  { alias: 'dubai', city: 'Dubai', country: 'AE', label: 'Dubái' },
  { alias: 'bombay', city: 'Mumbai', country: 'IN', label: 'Bombay' },
  { alias: 'nueva delhi', city: 'New Delhi', country: 'IN', label: 'Nueva Delhi' },
  { alias: 'ciudad de mexico', city: 'Mexico City', country: 'MX', label: 'Ciudad de México' },
  { alias: 'cdmx', city: 'Mexico City', country: 'MX', label: 'Ciudad de México' },
  { alias: 'la habana', city: 'Havana', country: 'CU', label: 'La Habana' },
  {
    alias: 'san petersburgo',
    city: 'Saint Petersburg',
    country: 'RU',
    label: 'San Petersburgo',
  },
  { alias: 'kiev', city: 'Kyiv', country: 'UA', label: 'Kiev' },
  { alias: 'zurich', city: 'Zurich', country: 'CH', label: 'Zúrich' },
  { alias: 'ginebra', city: 'Geneva', country: 'CH', label: 'Ginebra' },
  { alias: 'gotemburgo', city: 'Gothenburg', country: 'SE', label: 'Gotemburgo' },
  { alias: 'sevilla', city: 'Seville', country: 'ES', label: 'Sevilla' },
  { alias: 'zaragoza', city: 'Zaragoza', country: 'ES', label: 'Zaragoza' },
  { alias: 'la coruna', city: 'A Coruña', country: 'ES', label: 'A Coruña' },
  { alias: 'valencia', city: 'Valencia', country: 'ES', label: 'Valencia' },
];

const cityIndex: IndexedCity[] = CITIES.map((city) => {
  const country = getCountry(city.country);
  return {
    ...city,
    normalized: normalizeText(city.name),
    countryName: country?.name ?? city.country,
    flag: country?.flag ?? '🌍',
  };
});

const cityByKey = new Map(cityIndex.map((city) => [`${city.country}:${city.normalized}`, city]));

function textScore(text: string, query: string): number {
  if (!text) return 0;
  if (text === query) return 130;
  if (text.startsWith(query)) return 105;
  if (query.length >= 2 && text.includes(query)) return 72;
  return 0;
}

function countryScore(country: Country, query: string): number {
  let score = Math.max(
    textScore(normalizeText(country.name), query),
    textScore(normalizeText(country.nameEn), query),
    textScore(country.iso2.toLowerCase(), query),
    textScore(country.iso3.toLowerCase(), query),
  );

  for (const [alias, iso2] of Object.entries(COUNTRY_ALIASES)) {
    if (iso2 !== country.iso2) continue;
    score = Math.max(score, textScore(alias, query));
  }

  return score;
}

function toCountryResult(country: Country, score: number): ScoredPlace {
  return {
    score,
    population: Number.MAX_SAFE_INTEGER,
    place: {
      id: `country:${country.iso2}`,
      type: 'country',
      name: country.name,
      subtitle: regionLabel(country.region),
      countryCode: country.iso2,
      lat: country.lat,
      lng: country.lng,
      flag: country.flag,
    },
  };
}

interface ScoredPlace {
  score: number;
  population: number;
  place: PlaceResult;
}

export function searchPlaces(rawQuery: string, limit = 9): PlaceResult[] {
  const query = normalizeText(rawQuery).slice(0, 80);
  if (query.length < 1) return [];

  const results: ScoredPlace[] = [];

  for (const country of COUNTRIES) {
    const score = countryScore(country, query);
    if (score > 0) results.push(toCountryResult(country, score));
  }

  for (const city of cityIndex) {
    const score = textScore(city.normalized, query);
    if (score === 0) continue;
    results.push({
      score,
      population: city.population,
      place: {
        id: `city:${city.country}:${city.name}:${city.lat}:${city.lng}`,
        type: 'city',
        name: city.name,
        subtitle: `${city.countryName}${city.population > 0 ? ` · ${formatCompact(city.population)} hab.` : ''}`,
        countryCode: city.country,
        lat: city.lat,
        lng: city.lng,
        flag: city.flag,
        population: city.population,
      },
    });
  }

  for (const alias of CITY_ALIASES) {
    const score = textScore(normalizeText(alias.alias), query);
    if (score === 0) continue;
    const city = cityByKey.get(`${alias.country}:${normalizeText(alias.city)}`);
    if (!city) continue;
    const name = alias.label ?? city.name;
    results.push({
      score: score + 5,
      population: city.population,
      place: {
        ...toCityPlace(city),
        id: `city:${city.country}:${name}:${city.lat}:${city.lng}`,
        name,
      },
    });
  }

  const deduped = new Map<string, ScoredPlace>();
  for (const result of results) {
    const existing = deduped.get(result.place.id);
    if (!existing || result.score > existing.score) deduped.set(result.place.id, result);
  }

  return [...deduped.values()]
    .sort((a, b) => b.score - a.score || b.population - a.population || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
    .map((result) => result.place);
}

function toCityPlace(city: IndexedCity): PlaceResult {
  return {
    id: `city:${city.country}:${city.name}:${city.lat}:${city.lng}`,
    type: 'city',
    name: city.name,
    subtitle: `${city.countryName}${city.population > 0 ? ` · ${formatCompact(city.population)} hab.` : ''}`,
    countryCode: city.country,
    lat: city.lat,
    lng: city.lng,
    flag: city.flag,
    population: city.population,
  };
}

/**
 * Búsqueda de ciudades limitada a un país, para el editor de ciudades visitadas.
 * Mantiene los alias en español y permite localidades del dataset local.
 */
export function searchCitiesInCountry(
  rawQuery: string,
  countryCode: string,
  limit = 6,
): PlaceResult[] {
  const query = normalizeText(rawQuery).slice(0, 80);
  if (query.length < 1) return [];

  const iso2 = countryCode.toUpperCase();
  const results: ScoredPlace[] = [];

  for (const city of cityIndex) {
    if (city.country !== iso2) continue;
    const score = textScore(city.normalized, query);
    if (score === 0) continue;
    results.push({ score, population: city.population, place: toCityPlace(city) });
  }

  for (const alias of CITY_ALIASES) {
    if (alias.country !== iso2) continue;
    const score = textScore(normalizeText(alias.alias), query);
    if (score === 0) continue;
    const city = cityByKey.get(`${alias.country}:${normalizeText(alias.city)}`);
    if (!city) continue;
    const name = alias.label ?? city.name;
    const place = toCityPlace(city);
    results.push({
      score: score + 5,
      population: city.population,
      place: {
        ...place,
        id: `city:${city.country}:${name}:${city.lat}:${city.lng}`,
        name,
      },
    });
  }

  const deduped = new Map<string, ScoredPlace>();
  for (const result of results) {
    const existing = deduped.get(result.place.id);
    if (!existing || result.score > existing.score) deduped.set(result.place.id, result);
  }

  return [...deduped.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.population - a.population ||
        a.place.name.localeCompare(b.place.name),
    )
    .slice(0, limit)
    .map((result) => result.place);
}

export function countryToPlace(countryCode: string): PlaceResult | null {
  const country = getCountry(countryCode);
  if (!country) return null;
  return {
    id: `country:${country.iso2}`,
    type: 'country',
    name: country.name,
    subtitle: regionLabel(country.region),
    countryCode: country.iso2,
    lat: country.lat,
    lng: country.lng,
    flag: country.flag,
  };
}

export function cityToPlace(cityName: string, countryCode: string): PlaceResult | null {
  const city = cityIndex.find(
    (candidate) =>
      candidate.country === countryCode &&
      candidate.normalized === normalizeText(cityName),
  );
  if (!city) return null;
  return {
    id: `city:${city.country}:${city.name}:${city.lat}:${city.lng}`,
    type: 'city',
    name: city.name,
    subtitle: city.countryName,
    countryCode: city.country,
    lat: city.lat,
    lng: city.lng,
    flag: city.flag,
    population: city.population,
  };
}
