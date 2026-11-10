export type GroupRole = 'owner' | 'member';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  homeCountryCode: string;
  createdAt: string;
  emailVerified?: boolean;
  consentRequired?: boolean;
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
  trips?: number;
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
  /** Identificador real de la fila trip_countries cuando `id` es sintético. */
  tripCountryId?: string;
  tripId?: string;
  tripTitle?: string;
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
  startDate?: string;
  endDate?: string;
  participants?: TripParticipant[];
  canEdit?: boolean;
  tripCount?: number;
}

export interface TripStop {
  id: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  cityName: string | null;
  lat: number | null;
  lng: number | null;
  position: number;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
}

export type TripParticipantStatus = 'pending' | 'accepted' | 'rejected';
export type TripVisibility = 'private' | 'group';

export interface TripParticipant {
  id: string;
  name: string;
  homeCountryCode: string;
  role: 'owner' | 'member';
  status: TripParticipantStatus;
  invitedAt?: string;
  respondedAt?: string;
  consentVersion?: string;
}

export interface Trip {
  id: string;
  ownerId: string;
  title: string;
  startDate: string;
  endDate: string;
  visibility: TripVisibility;
  createdAt: string;
  countries: string[];
  stops: TripStop[];
  participants: TripParticipant[];
  isOwner: boolean;
}

export interface PersonalOverview {
  user: {
    id: string;
    name: string;
    homeCountryCode: string;
  };
  stats: MemberStats & {
    trips: number;
    days: number;
    cities: number;
  };
  trips: Trip[];
  pendingInvitations: Trip[];
  visits: Visit[];
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
    trips?: number;
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
