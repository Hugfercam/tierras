import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  GroupMember,
  GroupOverview,
  GroupSummary,
} from '../../shared/types.ts';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { getGroupOverview, getGroups } from '../lib/api';
import { CreateGroupDialog } from '../components/group/CreateGroupDialog';
import { JoinGroupDialog } from '../components/group/JoinGroupDialog';

const ACTIVE_GROUP_KEY = 'tierras.activeGroupId';

interface GroupContextValue {
  groups: GroupSummary[];
  groupsLoading: boolean;
  groupsError: boolean;
  activeGroup: GroupSummary | null;
  activeGroupId: string | null;
  setActiveGroupId: (id: string) => void;
  overview: GroupOverview | null;
  overviewLoading: boolean;
  overviewError: boolean;
  refetchOverview: () => void;
  currentMember: GroupMember | null;
  openCreateGroup: () => void;
  openJoinGroup: () => void;
  refreshGroups: () => Promise<void>;
  addGroupLocally: (group: GroupSummary) => void;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_GROUP_KEY),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: ({ signal }) => getGroups(signal),
    enabled: Boolean(user),
    retry: 1,
  });

  const groups = groupsQuery.data?.groups ?? [];
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;

  useEffect(() => {
    if (!groupsQuery.data) return;
    if (activeGroupId && groups.some((group) => group.id === activeGroupId)) return;
    const preferred = [...groups].sort(
      (a, b) =>
        b.memberCount - a.memberCount ||
        b.countryCount - a.countryCount ||
        b.createdAt.localeCompare(a.createdAt),
    )[0];
    const next = preferred?.id ?? null;
    setActiveGroupIdState(next);
    if (next) localStorage.setItem(ACTIVE_GROUP_KEY, next);
    else localStorage.removeItem(ACTIVE_GROUP_KEY);
  }, [activeGroupId, groups, groupsQuery.data]);

  useEffect(() => {
    if (activeGroupId) localStorage.setItem(ACTIVE_GROUP_KEY, activeGroupId);
  }, [activeGroupId]);

  const setActiveGroupId = useCallback((id: string) => {
    setActiveGroupIdState(id);
    localStorage.setItem(ACTIVE_GROUP_KEY, id);
  }, []);

  const overviewQuery = useQuery({
    queryKey: ['group', activeGroupId, 'overview'],
    queryFn: ({ signal }) => getGroupOverview(activeGroupId as string, signal),
    enabled: Boolean(activeGroupId),
    retry: 1,
  });

  const currentMember = useMemo(() => {
    if (!user || !overviewQuery.data) return null;
    return overviewQuery.data.members.find((member) => member.id === user.id) ?? null;
  }, [overviewQuery.data, user]);

  const refreshGroups = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['groups'] });
  }, [queryClient]);

  const addGroupToCache = useCallback(
    (group: GroupSummary) => {
      queryClient.setQueryData<{ groups: GroupSummary[] }>(['groups'], (current) => ({
        groups: [group, ...(current?.groups ?? []).filter((item) => item.id !== group.id)],
      }));
    },
    [queryClient],
  );

  const handleCreated = useCallback(
    async (group: GroupSummary) => {
      setCreateOpen(false);
      addGroupToCache(group);
      setActiveGroupId(group.id);
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast(`Creaste “${group.name}”. Ya podés invitar a tu gente.`, 'success');
      navigate('/mapa');
    },
    [addGroupToCache, navigate, queryClient, setActiveGroupId, toast],
  );

  const handleJoined = useCallback(
    async (group: GroupSummary) => {
      setJoinOpen(false);
      addGroupToCache(group);
      setActiveGroupId(group.id);
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast(`Ya sos parte de “${group.name}”.`, 'success');
      navigate('/mapa');
    },
    [addGroupToCache, navigate, queryClient, setActiveGroupId, toast],
  );

  return (
    <GroupContext.Provider
      value={{
        groups,
        groupsLoading: groupsQuery.isLoading,
        groupsError: groupsQuery.isError,
        activeGroup,
        activeGroupId,
        setActiveGroupId,
        overview: overviewQuery.data ?? null,
        overviewLoading: overviewQuery.isLoading,
        overviewError: overviewQuery.isError,
        refetchOverview: () => {
          void overviewQuery.refetch();
        },
        currentMember,
        openCreateGroup: () => setCreateOpen(true),
        openJoinGroup: () => setJoinOpen(true),
        refreshGroups,
        addGroupLocally: addGroupToCache,
      }}
    >
      {children}
      <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} onJoined={handleJoined} />
    </GroupContext.Provider>
  );
}

export function useGroup(): GroupContextValue {
  const context = useContext(GroupContext);
  if (!context) throw new Error('useGroup debe usarse dentro de GroupProvider');
  return context;
}
