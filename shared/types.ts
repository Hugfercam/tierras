export type GroupRole = 'owner' | 'member';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  homeCountryCode: string;
  createdAt: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  memberCount: number;
  countryCount: number;
  myRole: GroupRole;
}

export interface MemberStats {
  countries: number;
  kilometers: number;
  continents: number;
  percentWorld: number;
}

export interface GroupMember {
  id: string;
  name: string;
  homeCountryCode: string;
  role: GroupRole;
  joinedAt: string;
  stats: MemberStats;
}

export interface VisitCity {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

export interface Visit {
  id: string;
  userId: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  /** Ciudad principal elegida al marcar el país; se conserva por compatibilidad. */
  cityName: string | null;
  lat: number;
  lng: number;
  visitedAt: string;
  createdAt: string;
  cities: VisitCity[];
}

export interface GroupOverview {
  group: {
    id: string;
    name: string;
    ownerId: string;
    inviteCode: string;
    createdAt: string;
  };
  me: {
    role: GroupRole;
  };
  members: GroupMember[];
  visits: Visit[];
  stats: {
    countries: number;
    kilometers: number;
    continents: number;
    visits: number;
  };
}

export interface LeaderboardMetric {
  id: 'countries' | 'kilometers' | 'continents';
  label: string;
  shortLabel: string;
  unit: string;
  description: string;
}

export interface PlaceResult {
  id: string;
  type: 'country' | 'city';
  name: string;
  subtitle: string;
  countryCode: string;
  lat: number;
  lng: number;
  flag: string;
  population?: number;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}
