import { create } from 'zustand';

export type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'error';

export interface UserProfile {
  id: string;
  name: string;
}

interface AuthState {
  status: AuthStatus;
  profile: UserProfile | null;
  setProfile: (p: UserProfile) => void;
  setStatus: (s: AuthStatus) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  profile: null,
  setProfile: (profile) => set({ profile, status: 'authenticated' }),
  setStatus: (status) => set({ status }),
  reset: () => set({ status: 'idle', profile: null })
}));
