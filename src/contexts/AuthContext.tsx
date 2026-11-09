import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '../../shared/types.ts';
import { ApiError, getMe, logout as logoutRequest } from '../lib/api';
import { clearPrivateApiCache } from '../lib/privateCache';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isError: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async ({ signal }) => {
      try {
        const result = await getMe(signal);
        return result.user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.setQueryData<AuthUser | null>(['auth', 'me'], null);
      queryClient.removeQueries({ queryKey: ['groups'] });
      queryClient.removeQueries({ queryKey: ['group'] });
      void clearPrivateApiCache();
    };
    window.addEventListener('tierras:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('tierras:unauthorized', handleUnauthorized);
  }, [queryClient]);

  const logout = useCallback(async () => {
    await logoutRequest();
    queryClient.setQueryData<AuthUser | null>(['auth', 'me'], null);
    queryClient.removeQueries({ queryKey: ['groups'] });
    queryClient.removeQueries({ queryKey: ['group'] });
    await clearPrivateApiCache();
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        user: meQuery.data ?? null,
        isLoading: meQuery.isLoading,
        isError: meQuery.isError,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
