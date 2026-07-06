import { describe, it, expect } from 'vitest';
import { requireScopes, requireAnyScope, type OAuthContext } from '../oauth-middleware.ts';

const ctx: OAuthContext = {
  tenantId: 't1', userId: 'u1', clientId: 'c1', tokenId: 'tk1',
  scopes: ['agent:read', 'agent:run', 'team:read'],
};

describe('requireScopes', () => {
  it('passes when all required scopes granted', () => {
    const r = requireScopes(ctx, ['agent:read', 'agent:run']);
    expect(r.ok).toBe(true);
  });
  it('returns missing when scope absent', () => {
    const r = requireScopes(ctx, ['agent:read', 'admin:super']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(['admin:super']);
  });
});

describe('requireAnyScope', () => {
  it('passes when any candidate matches', () => {
    expect(requireAnyScope(ctx, ['admin:super', 'agent:read'])).toBe(true);
  });
  it('fails when no candidate matches', () => {
    expect(requireAnyScope(ctx, ['admin:super', 'billing:read'])).toBe(false);
  });
});
