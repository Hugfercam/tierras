import type {
  ApiErrorBody,
  AuthUser,
  GroupOverview,
  GroupSummary,
  Visit,
  VisitCity,
} from '../../shared/types.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      fieldErrors?: Record<string, string>;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status ?? 0;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
      { code: 'NETWORK_ERROR' },
    );
  }

  if (response.status === 204) return undefined as T;

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorBody = (payload ?? {}) as ApiErrorBody;
    if (response.status === 401 && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new Event('tierras:unauthorized'));
    }
    throw new ApiError(errorBody.error || 'No pudimos completar la operación.', {
      status: response.status,
      code: errorBody.code,
      fieldErrors: errorBody.fieldErrors,
    });
  }

  return payload as T;
}

export interface AppConfig {
  appName: string;
  totalCountries: number;
  demoMode: boolean;
  demoAccount: { email: string; password: string } | null;
}

export function getConfig(signal?: AbortSignal): Promise<AppConfig> {
  return request('/config', { signal });
}

export function getMe(signal?: AbortSignal): Promise<{ user: AuthUser }> {
  return request('/auth/me', { signal });
}

export function login(email: string, password: string): Promise<{ user: AuthUser }> {
  return request('/auth/login', { method: 'POST', body: { email, password } });
}

export function register(input: {
  name: string;
  email: string;
  password: string;
  homeCountryCode: string;
}): Promise<{ user: AuthUser }> {
  return request('/auth/register', { method: 'POST', body: input });
}

export function logout(): Promise<{ ok: true }> {
  return request('/auth/logout', { method: 'POST' });
}

export function getGroups(signal?: AbortSignal): Promise<{ groups: GroupSummary[] }> {
  return request('/groups', { signal });
}

export function createGroup(name: string): Promise<{ group: GroupSummary }> {
  return request('/groups', { method: 'POST', body: { name } });
}

export function joinGroup(inviteCode: string): Promise<{ group: GroupSummary }> {
  return request('/groups/join', { method: 'POST', body: { inviteCode } });
}

export function getGroupOverview(
  groupId: string,
  signal?: AbortSignal,
): Promise<GroupOverview> {
  return request(`/groups/${groupId}`, { signal });
}

export function addVisit(
  groupId: string,
  input: {
    countryCode: string;
    cityName?: string | null;
    lat?: number;
    lng?: number;
    visitedAt?: string;
  },
): Promise<{ visit: Visit }> {
  return request(`/groups/${groupId}/visits`, { method: 'POST', body: input });
}

export function removeVisit(groupId: string, visitId: string): Promise<void> {
  return request(`/groups/${groupId}/visits/${visitId}`, { method: 'DELETE' });
}

export function addVisitCity(
  groupId: string,
  visitId: string,
  input: { name: string; lat?: number; lng?: number },
): Promise<{ city: VisitCity }> {
  return request(`/groups/${groupId}/visits/${visitId}/cities`, {
    method: 'POST',
    body: input,
  });
}

export function removeVisitCity(
  groupId: string,
  visitId: string,
  cityId: string,
): Promise<void> {
  return request(`/groups/${groupId}/visits/${visitId}/cities/${cityId}`, {
    method: 'DELETE',
  });
}
