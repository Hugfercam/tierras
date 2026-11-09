import countriesData from './data/countries.ts';

export interface Country {
  iso2: string;
  iso3: string;
  numeric: string | null;
  name: string;
  nameEn: string;
  region: RegionName;
  subregion: string;
  lat: number;
  lng: number;
  capital: string | null;
  flag: string;
  unMember: boolean;
  area: number | null;
}

export type RegionName = 'Africa' | 'Americas' | 'Asia' | 'Europe' | 'Oceania' | 'Antarctic';

export const COUNTRIES = countriesData as unknown as Country[];
export const TOTAL_COUNTRIES = COUNTRIES.length;

export const COUNTRY_BY_ISO = new Map(COUNTRIES.map((country) => [country.iso2, country]));

export const REGION_LABELS: Record<RegionName, string> = {
  Africa: 'África',
  Americas: 'América',
  Asia: 'Asia',
  Europe: 'Europa',
  Oceania: 'Oceanía',
  Antarctic: 'Antártida',
};

export const REGION_ORDER: RegionName[] = ['Europe', 'Americas', 'Asia', 'Africa', 'Oceania'];

export function getCountry(iso2: string | null | undefined): Country | undefined {
  if (!iso2) return undefined;
  return COUNTRY_BY_ISO.get(iso2.toUpperCase());
}

export function isCountryCode(value: unknown): value is string {
  return typeof value === 'string' && COUNTRY_BY_ISO.has(value.toUpperCase());
}

export function countryName(iso2: string): string {
  return getCountry(iso2)?.name ?? iso2;
}

export function countryFlag(iso2: string): string {
  const country = getCountry(iso2);
  if (country?.flag) return country.flag;
  if (!/^[A-Za-z]{2}$/.test(iso2)) return '🌍';
  return String.fromCodePoint(
    ...iso2
      .toUpperCase()
      .split('')
      .map((letter) => 127397 + letter.charCodeAt(0)),
  );
}

export function regionLabel(region: RegionName | string): string {
  return REGION_LABELS[region as RegionName] ?? region;
}
