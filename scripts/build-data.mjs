/**
 * Genera los datos geográficos que viajan con la app.
 *
 * Fuentes (devDependencies):
 *  - world-atlas + topojson-client → fronteras simplificadas (50m).
 *  - world-countries → nombres, regiones y centroides.
 *  - all-the-cities (GeoNames) → ciudades con población y capitales.
 *
 * Ejecutar: npm run data
 */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { feature } from 'topojson-client';
import worldCountries from 'world-countries';
import allCities from 'all-the-cities';

const ROOT = new URL('../', import.meta.url);
const round = (n, digits = 2) => Number(n.toFixed(digits));
const pad = (value) => String(value).padStart(3, '0');

// Lista de viaje inclusiva: Estados miembros de la ONU, observadores permanentes,
// Kosovo y Taiwán. Quedan fuera dependencias y territorios de ultramar.
const isCountry = (country) =>
  country.unMember === true ||
  country.independent === true ||
  ['XK', 'PS', 'TW'].includes(country.cca2);

const countries = worldCountries
  .filter(isCountry)
  .map((country) => ({
    iso2: country.cca2,
    iso3: country.cca3,
    numeric: country.ccn3 || null,
    name: country.translations?.spa?.common || country.name.common,
    nameEn: country.name.common,
    region: country.region,
    subregion: country.subregion,
    lat: country.latlng?.[0] ?? 0,
    lng: country.latlng?.[1] ?? 0,
    capital: country.capital?.[0] || null,
    flag: country.flag || '',
    unMember: Boolean(country.unMember),
    area: country.area ?? null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

const countryByNumeric = new Map(
  countries.filter((country) => country.numeric).map((country) => [pad(country.numeric), country]),
);
const countryByIso2 = new Map(countries.map((country) => [country.iso2, country]));

// Las fronteras de world-atlas no incluyen un id para Kosovo; lo resolvemos por nombre.
const nameOverrides = new Map([['Kosovo', 'XK']]);

const topology = JSON.parse(
  await readFile(new URL('node_modules/world-atlas/countries-50m.json', ROOT), 'utf8'),
);
const geo = feature(topology, topology.objects.countries);

const roundCoordinates = (coordinates) => {
  if (typeof coordinates[0] === 'number') {
    return [round(coordinates[0]), round(coordinates[1])];
  }
  return coordinates.map(roundCoordinates);
};

const grouped = new Map();
for (const item of geo.features) {
  const iso2 =
    countryByNumeric.get(pad(item.id))?.iso2 || nameOverrides.get(item.properties?.name) || null;
  if (!item.geometry) continue;
  const name = iso2
    ? countryByIso2.get(iso2).name
    : item.properties?.name || 'Territorio sin nombre';
  const key = iso2 || `territory:${name}`;
  const polygons =
    item.geometry.type === 'Polygon' ? [item.geometry.coordinates] : item.geometry.coordinates;
  const entry = grouped.get(key) || { iso2, name, polygons: [] };
  entry.polygons.push(...polygons);
  grouped.set(key, entry);
}

// Se dibujan también los territorios no seleccionables (Groenlandia, Sáhara Occidental,
// dependencias) para que el globo no tenga huecos de océano sobre tierra firme.
const features = [...grouped.entries()].map(([key, { iso2, name, polygons }]) => ({
  type: 'Feature',
  id: iso2 || key,
  properties: { iso2, name },
  geometry: {
    type: polygons.length === 1 ? 'Polygon' : 'MultiPolygon',
    coordinates: roundCoordinates(polygons.length === 1 ? polygons[0] : polygons),
  },
}));

// Ciudades: todas las de >= 100k habitantes + capitales, para que ningún país quede sin búsqueda.
const cityRows = allCities
  .filter((city) => {
    if (!countryByIso2.has(city.country)) return false;
    return city.population >= 100000 || city.featureCode === 'PPLC';
  })
  .map((city) => ({
    name: city.name,
    country: city.country,
    lat: round(city.loc.coordinates[1], 4),
    lng: round(city.loc.coordinates[0], 4),
    population: city.population || 0,
    capital: city.featureCode === 'PPLC',
  }))
  .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));

await mkdir(new URL('shared/data/', ROOT), { recursive: true });
await mkdir(new URL('src/data/', ROOT), { recursive: true });
await writeFile(
  new URL('shared/data/countries.ts', ROOT),
  `// Archivo generado por scripts/build-data.mjs. No editar a mano.\nexport default ${JSON.stringify(countries, null, 2)} as const;\n`,
);
await writeFile(new URL('src/data/countries.geo.json', ROOT), JSON.stringify({ type: 'FeatureCollection', features }));
await writeFile(new URL('src/data/cities.json', ROOT), JSON.stringify(cityRows));

// Solo las banderas 4x3 de los países incluidos: la app queda liviana y offline.
await mkdir(new URL('public/flags/', ROOT), { recursive: true });
for (const country of countries) {
  const iso2 = country.iso2.toLowerCase();
  await copyFile(
    new URL(`node_modules/flag-icons/flags/4x3/${iso2}.svg`, ROOT),
    new URL(`public/flags/${iso2}.svg`, ROOT),
  );
}

console.log(
  `Datos generados: ${countries.length} países, ${features.length} geometrías, ${cityRows.length} ciudades.`,
);
