import { create } from 'zustand';
import { clearStoredSession, loadSession, saveSession } from '@/lib/secureStorage';
import { authenticateSocket, disconnectSocket } from '@/lib/socket';
import type { AuthTokens, User } from '@/types/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;

  hydrate: () => Promise<void>;
  setSession: (tokens: AuthTokens) => Promise<void>;
  updateUser: (user: User) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isHydrated: false,

  hydrate: async () => {
    const session = await loadSession();
    if (session) {
      set({
        user: session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        isHydrated: true,
      });
      if (session.accessToken) {
        authenticateSocket(
          session.accessToken,
          session.user?.id,
          session.user?.providerProfile?.id,
        );
      }
    } else {
      set({ isHydrated: true });
    }
  },

  setSession: async (tokens) => {
    set({
      user: tokens.user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    if (tokens.accessToken) {
      authenticateSocket(
        tokens.accessToken,
        tokens.user?.id,
        tokens.user?.providerProfile?.id,
      );
    }
    await saveSession({
      user: tokens.user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  },

  updateUser: (user) => {
    set({ user });
    const { accessToken, refreshToken } = get();
    if (accessToken && refreshToken) {
      void saveSession({ user, accessToken, refreshToken });
    }
  },

  signOut: async () => {
    disconnectSocket();
    set({ user: null, accessToken: null, refreshToken: null });
    await clearStoredSession();
  },
}));

export const selectIsAuthenticated = (state: AuthState) => Boolean(state.user && state.accessToken);
