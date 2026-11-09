import type { Position } from 'geojson';
import type { GroupMember, Visit } from '../../shared/types.ts';
import { COUNTRY_BY_ISO } from '../../shared/countries.ts';
import { GROUP_HEAT_COLORS, memberColor, withAlpha } from './colors';
import { COUNTRY_FEATURES, type CountryFeature } from './atlas';

export type MapLayer = 'group' | string;

interface TextureOptions {
  width: number;
  visits: Visit[];
  members: GroupMember[];
  layer: MapLayer;
  selectedCountry: string | null;
}

const OCEAN_TOP = '#06171f';
const OCEAN_BOTTOM = '#0a2932';
const LAND = '#12333b';
const LAND_BORDER = 'rgba(176, 211, 201, 0.26)';

function rgba(hex: string, alpha: number): string {
  return withAlpha(hex, alpha);
}

function unwrapRing(ring: Position[]): Array<[number, number]> {
  if (ring.length === 0) return [];
  const result: Array<[number, number]> = [];
  let previous = ring[0][0] as number;
  for (const point of ring) {
    let lng = point[0] as number;
    while (lng - previous > 180) lng -= 360;
    while (lng - previous < -180) lng += 360;
    result.push([lng, point[1] as number]);
    previous = lng;
  }
  return result;
}

function traceFeature(
  ctx: CanvasRenderingContext2D,
  feature: CountryFeature,
  width: number,
  height: number,
): void {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      const unwrapped = unwrapRing(ring);
      if (unwrapped.length < 3) continue;
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (const point of unwrapped) {
        minLng = Math.min(minLng, point[0]);
        maxLng = Math.max(maxLng, point[0]);
      }
      for (const offset of [-360, 0, 360]) {
        if (maxLng + offset < -180 || minLng + offset > 180) continue;
        const points = unwrapped.map(([lng, lat]) => [
          ((lng + offset + 180) / 360) * width,
          ((90 - lat) / 180) * height,
        ]);
        ctx.moveTo(points[0][0], points[0][1]);
        for (let index = 1; index < points.length; index += 1) {
          ctx.lineTo(points[index][0], points[index][1]);
        }
        ctx.closePath();
      }
    }
  }
}

function paintFeature(
  ctx: CanvasRenderingContext2D,
  feature: CountryFeature,
  fill: string,
  stroke: string,
  lineWidth: number,
  width: number,
  height: number,
): void {
  ctx.beginPath();
  traceFeature(ctx, feature, width, height);
  ctx.fillStyle = fill;
  ctx.fill('evenodd');
  if (lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function drawGraticule(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(155, 199, 191, 0.09)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 10]);
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let lng = -180; lng <= 180; lng += 15) {
    const x = ((lng + 180) / 360) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawGlobeTexture({
  width,
  visits,
  members,
  layer,
  selectedCountry,
}: TextureOptions): HTMLCanvasElement {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const ocean = ctx.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, OCEAN_TOP);
  ocean.addColorStop(0.5, OCEAN_BOTTOM);
  ocean.addColorStop(1, OCEAN_TOP);
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);
  drawGraticule(ctx, width, height);

  // Base: todas las tierras.
  for (const feature of COUNTRY_FEATURES) {
    paintFeature(ctx, feature, LAND, LAND_BORDER, 1, width, height);
  }

  const memberIndex = new Map(members.map((member, index) => [member.id, index]));
  const visitorsByCountry = new Map<string, Set<string>>();
  for (const visit of visits) {
    const set = visitorsByCountry.get(visit.countryCode) ?? new Set<string>();
    set.add(visit.userId);
    visitorsByCountry.set(visit.countryCode, set);
  }

  const fillForCountry = (iso2: string): { fill: string; stroke: string } | null => {
    const visitors = visitorsByCountry.get(iso2);
    if (!visitors || visitors.size === 0) return null;

    if (layer !== 'group') {
      if (!visitors.has(layer)) return null;
      const index = memberIndex.get(layer) ?? 0;
      return {
        fill: rgba(memberColor(index), 0.88),
        stroke: 'rgba(255, 244, 219, 0.7)',
      };
    }

    const count = visitors.size;
    const color = GROUP_HEAT_COLORS[Math.min(count - 1, GROUP_HEAT_COLORS.length - 1)];
    return {
      fill: rgba(color, count >= 4 ? 0.95 : 0.86),
      stroke: 'rgba(255, 242, 211, 0.55)',
    };
  };

  // Capa de visitas.
  for (const feature of COUNTRY_FEATURES) {
    const iso2 = feature.properties.iso2;
    if (!iso2) continue;
    const paint = fillForCountry(iso2);
    if (!paint) continue;
    paintFeature(ctx, feature, paint.fill, paint.stroke, 2, width, height);
  }

  // Países diminutos o sin polígono: punto visible.
  const seenDots = new Set<string>();
  for (const visit of visits) {
    if (seenDots.has(visit.countryCode)) continue;
    const country = COUNTRY_BY_ISO.get(visit.countryCode);
    if (!country) continue;
    const feature = COUNTRY_FEATURES.find((item) => item.properties.iso2 === country.iso2);
    if (feature && (country.area ?? 0) > 9000) continue;
    seenDots.add(country.iso2);

    const visitors = visitorsByCountry.get(country.iso2);
    if (!visitors) continue;
    if (layer !== 'group' && !visitors.has(layer)) continue;

    let color = '#ff8a6b';
    if (layer !== 'group') {
      color = memberColor(memberIndex.get(layer) ?? 0);
    } else {
      const count = visitors.size;
      color = GROUP_HEAT_COLORS[Math.min(count - 1, GROUP_HEAT_COLORS.length - 1)];
    }

    const x = ((country.lng + 180) / 360) * width;
    const y = ((90 - country.lat) / 180) * height;
    ctx.beginPath();
    ctx.arc(x, y, width * 0.0022, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = width * 0.0007;
    ctx.strokeStyle = 'rgba(255, 246, 223, 0.8)';
    ctx.stroke();
  }

  if (selectedCountry) {
    const feature = COUNTRY_FEATURES.find((item) => item.properties.iso2 === selectedCountry);
    if (feature) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 220, 150, 0.65)';
      ctx.shadowBlur = 18;
      paintFeature(
        ctx,
        feature,
        'rgba(255, 245, 218, 0.06)',
        '#ffe1a3',
        Math.max(2.5, width * 0.0012),
        width,
        height,
      );
      ctx.restore();
    } else {
      const country = COUNTRY_BY_ISO.get(selectedCountry);
      if (country) {
        const x = ((country.lng + 180) / 360) * width;
        const y = ((90 - country.lat) / 180) * height;
        ctx.beginPath();
        ctx.arc(x, y, width * 0.006, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffe1a3';
        ctx.lineWidth = width * 0.0015;
        ctx.stroke();
      }
    }
  }

  return canvas;
}
