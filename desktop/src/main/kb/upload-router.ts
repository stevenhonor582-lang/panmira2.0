import axios, { type AxiosInstance } from 'axios';
import { triggerBackgroundIndexing } from '../kb-search/indexer.js';
import type { Embedder } from '../kb-search/embedder.js';

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
    form.append('file', new Blob([new Uint8Array(content)]), filename);
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

/**
 * Hook the upload router into the local indexer.
 * After a successful upload + local save, kick off background indexing
 * so the new document becomes searchable without blocking the upload flow.
 *
 * NOTE: Caller is responsible for persisting `rawPath` to disk before invoking
 * this. We do not write the file here — we only fire off the indexer.
 */
export interface IndexingHookOptions {
  kbDir: string;
  rawPath: string;
  filename: string;
  embedder: Pick<Embedder, 'embedBatch'>;
}

export function scheduleIndexingAfterUpload(
  uploadedDocId: string,
  hookOpts: IndexingHookOptions,
): void {
  triggerBackgroundIndexing({
    kbDir: hookOpts.kbDir,
    docId: uploadedDocId,
    docName: hookOpts.filename,
    rawPath: hookOpts.rawPath,
    embedder: hookOpts.embedder,
  });
}
