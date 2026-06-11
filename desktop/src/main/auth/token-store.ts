import keytar from 'keytar';

const SERVICE = 'panmira-desktop';
const KEY_ACCESS = 'access_token';
const KEY_REFRESH = 'refresh_token';

export class TokenStore {
  constructor(private readonly service: string = SERVICE) {}

  async getAccessToken(): Promise<string | null> {
    return keytar.getPassword(this.service, KEY_ACCESS);
  }

  async getRefreshToken(): Promise<string | null> {
    return keytar.getPassword(this.service, KEY_REFRESH);
  }

  async saveTokens(access: string, refresh: string): Promise<void> {
    await keytar.setPassword(this.service, KEY_ACCESS, access);
    await keytar.setPassword(this.service, KEY_REFRESH, refresh);
  }

  async saveAccessToken(access: string): Promise<void> {
    await keytar.setPassword(this.service, KEY_ACCESS, access);
  }

  async clear(): Promise<void> {
    await keytar.deletePassword(this.service, KEY_ACCESS);
    await keytar.deletePassword(this.service, KEY_REFRESH);
  }
}
