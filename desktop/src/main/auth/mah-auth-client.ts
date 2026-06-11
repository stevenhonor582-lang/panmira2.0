import axios, { type AxiosInstance } from 'axios';
import type { TokenStore } from './token-store';

interface Credentials {
  email: string;
  password: string;
}

interface UserProfile {
  id: string;
  name: string;
}

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: UserProfile;
}

interface ClientConfig {
  baseUrl: string;
  tokenStore: TokenStore;
}

export class MahAuthClient {
  private client: AxiosInstance;

  constructor(private config: ClientConfig) {
    this.client = axios.create({ baseURL: config.baseUrl });
  }

  async login(creds: Credentials): Promise<UserProfile> {
    const response = await this.client.post<LoginResponse>('/api/auth/login', creds);
    await this.config.tokenStore.saveTokens(response.data.access_token, response.data.refresh_token);
    return response.data.user;
  }

  async refresh(): Promise<string> {
    const refresh = await this.config.tokenStore.getRefreshToken();
    if (!refresh) throw new Error('No refresh token');
    const response = await this.client.post<{ access_token: string }>(
      '/api/auth/refresh',
      { refreshToken: refresh }
    );
    await this.config.tokenStore.saveAccessToken(response.data.access_token);
    return response.data.access_token;
  }

  async logout(): Promise<void> {
    // mah has no /api/auth/logout endpoint (JWT is stateless).
    // Server-side token remains valid until 90d expiry; we just clear local keychain.
    await this.config.tokenStore.clear();
  }

  async getProfile(): Promise<UserProfile> {
    const token = await this.config.tokenStore.getAccessToken();
    const response = await this.client.get<UserProfile>('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  }
}
