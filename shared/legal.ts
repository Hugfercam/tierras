export const PRIVACY_VERSION = '2026-11-10';
export const TERMS_VERSION = '2026-11-10';
export const MIN_AGE = 14;

export type ConsentKind = 'privacy' | 'terms' | 'age';

export const CURRENT_CONSENTS: ReadonlyArray<{ kind: ConsentKind; version: string }> = [
  { kind: 'privacy', version: PRIVACY_VERSION },
  { kind: 'terms', version: TERMS_VERSION },
  { kind: 'age', version: PRIVACY_VERSION },
];
