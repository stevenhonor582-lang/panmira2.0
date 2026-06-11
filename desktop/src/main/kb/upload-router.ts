import axios, { type AxiosInstance } from 'axios';

interface UploaderConfig {
  baseUrl: string;
  getToken: () => Promise<string>;
}

export class KbUploader {
  private client: AxiosInstance;

  constructor(private config: UploaderConfig) {
    this.client = axios.create({ baseURL: config.baseUrl });
  }

  async upload(content: Buffer, filename: string): Promise<{ id: string }> {
    const form = new FormData();
    form.append('file', new Blob([content]), filename);
    const token = await this.config.getToken();
    const response = await this.client.post<{ id: string }>(
      '/api/kb/documents',
      form,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        maxBodyLength: 100 * 1024 * 1024 // 100MB
      }
    );
    return response.data;
  }
}
