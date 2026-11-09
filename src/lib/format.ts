const integerFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

export function formatKm(value: number): string {
  return `${integerFormatter.format(value)} km`;
}

export function formatCompact(value: number): string {
  if (value < 10000) return integerFormatter.format(value);
  return new Intl.NumberFormat('es-ES', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${decimalFormatter.format(value)}%`;
}

export function parseVisitDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

export function formatDate(date: string, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
  }).format(parseVisitDate(date));
}

export function formatMonthYear(date: string): string {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
    new Date(date),
  );
}

export function formatJoinedDate(date: string): string {
  return new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(
    new Date(date),
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function plural(
  count: number,
  singular: string,
  pluralForm: string = `${singular}s`,
): string {
  return count === 1 ? singular : pluralForm;
}

export function countLabel(count: number, singular: string, pluralForm?: string): string {
  return `${formatInteger(count)} ${plural(count, singular, pluralForm)}`;
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
