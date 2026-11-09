export function formatInviteCode(code: string): string {
  if (code.length <= 4) return code;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function extractInviteCode(value: string): string {
  const urlMatch = value.match(/\/unirse\/([A-Za-z0-9-]+)/);
  const source = urlMatch ? urlMatch[1] : value;
  return source.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/unirse/${code}`;
}
