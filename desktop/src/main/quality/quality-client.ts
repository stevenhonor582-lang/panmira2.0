import axios, { type AxiosInstance } from 'axios';

interface ReviewRequest {
  action: 'browser_login' | 'browser_publish' | 'browser_payment';
  target: string;
  payload?: unknown;
}

interface ReviewResult {
  verdict: 'PASS' | 'FAIL';
  issues: string[];
}

interface ClientConfig {
  baseUrl: string;
  getToken: () => Promise<string>;
}

export class QualityClient {
  private client: AxiosInstance;

  constructor(private config: ClientConfig) {
    this.client = axios.create({ baseURL: config.baseUrl });
  }

  async review(request: ReviewRequest): Promise<ReviewResult> {
    const token = await this.config.getToken();
    const response = await this.client.post<ReviewResult>(
      `${this.config.baseUrl}/api/quality/review`,
      request,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  }
}
