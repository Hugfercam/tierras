export const MEMBER_COLORS = [
  '#ff8a6b',
  '#7fdac0',
  '#f3c56b',
  '#9db9ff',
  '#e7a0d1',
  '#b9dc7c',
  '#f2aca3',
  '#87d4e8',
] as const;

export const GROUP_HEAT_COLORS = [
  '#4b8b7c',
  '#d7b36c',
  '#e88d70',
  '#f7dca4',
] as const;

export function memberColor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixHex(colors: string[]): string {
  if (colors.length === 0) return '#ffffff';
  const parsed = colors.map((hex) => {
    const normalized = hex.replace('#', '');
    const value = Number.parseInt(normalized, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  });
  const total = parsed.reduce(
    (acc, channel) => [acc[0] + channel[0], acc[1] + channel[1], acc[2] + channel[2]],
    [0, 0, 0],
  );
  return `#${total
    .map((channel) => Math.round(channel / parsed.length).toString(16).padStart(2, '0'))
    .join('')}`;
}
