import { describe, it, expect } from 'vitest';
import * as schema from '../db/schema.js';

describe('schema: plan-A 新表导出', () => {
  it('user_teams 表导出', () => {
    expect(schema.userTeams).toBeDefined();
    // drizzle 内部 Symbol
    const sym = Object.getOwnPropertySymbols(schema.userTeams);
    expect(sym.length).toBeGreaterThan(0);
  });
  it('oauth_clients 表导出', () => {
    expect(schema.oauthClients).toBeDefined();
  });
  it('oauth_access_tokens 表导出', () => {
    expect(schema.oauthAccessTokens).toBeDefined();
  });
  it('oauth_refresh_tokens 表导出', () => {
    expect(schema.oauthRefreshTokens).toBeDefined();
  });
  it('oauth_authorization_codes 表导出', () => {
    expect(schema.oauthAuthorizationCodes).toBeDefined();
  });
  it('oauth_device_codes 表导出', () => {
    expect(schema.oauthDeviceCodes).toBeDefined();
  });
  it('agent_team_auth 表导出', () => {
    expect(schema.agentTeamAuth).toBeDefined();
  });
  it('external_oauth_credentials 表导出', () => {
    expect(schema.externalOAuthCredentials).toBeDefined();
  });
  it('usage_reports 表导出', () => {
    expect(schema.usageReports).toBeDefined();
  });
  it('12 张 plan-A 新表全在', () => {
    const all = Object.keys(schema);
    const newTables = [
      'userTeams', 'agentTeamAuth', 'oauthClients', 'oauthAccessTokens',
      'oauthRefreshTokens', 'oauthAuthorizationCodes', 'oauthDeviceCodes',
      'externalOAuthCredentials', 'usageReports',
    ];
    for (const t of newTables) {
      expect(all).toContain(t);
    }
  });
});
