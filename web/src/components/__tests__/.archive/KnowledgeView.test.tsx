import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgeView } from '../KnowledgeView';

vi.mock('../../store', () => ({
  useStore: (selector: any) => selector({ token: 'test-token' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockKBs = {
  data: [{
    id: 'kb-1', name: 'E2E Test KB', type: 'product', visibility: 'team',
    indexStatus: 'ready', documentCount: 2, chunkCount: 2,
  }],
};
const mockDocs = {
  documents: [
    { id: 'd1', title: 'doc1.txt', kbId: 'kb-1', status: 'ready', chunkCount: 1 },
  ],
};

global.fetch = vi.fn((url: string) => {
  if (url.includes('/knowledge-bases/') && url.endsWith('/documents')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDocs) } as Response);
  }
  if (url.includes('/knowledge-bases')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockKBs) } as Response);
  }
  if (url.includes('/search')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ chunks: [{ content: 'chunk1', score: 0.9 }] }) } as Response);
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
}) as any;

describe('KnowledgeView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders KB list', async () => {
    render(<MemoryRouter><KnowledgeView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('E2E Test KB')).toBeInTheDocument();
    });
  });

  it('has upload button', async () => {
    render(<MemoryRouter><KnowledgeView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/knowledge\.upload/)).toBeInTheDocument();
    });
  });

  it('has search input', async () => {
    render(<MemoryRouter><KnowledgeView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/knowledge\.searchPlaceholder/)).toBeInTheDocument();
    });
  });
});
