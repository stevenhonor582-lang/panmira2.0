import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../auth-store';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'idle', profile: null });
  });

  it('starts in idle state', () => {
    expect(useAuthStore.getState().status).toBe('idle');
  });

  it('setProfile transitions to authenticated', () => {
    useAuthStore.getState().setProfile({ id: 'u1', name: '老板' });
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().profile?.name).toBe('老板');
  });
});
