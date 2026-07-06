import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModelsView } from '../ModelsView';

vi.mock('../../store', () => ({
  useStore: (selector: any) => selector({ token: 'test-token' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockModels = {
  models: [
    { id: '1', type: 'llm', name: 'GLM', baseUrl: 'https://x', model: 'glm-4', isDefault: true, status: 'active' },
    { id: '2', type: 'embedding', name: 'BGE', baseUrl: 'https://y', model: 'bge-m3', dimensions: 1024, status: 'active' },
  ],
};

global.fetch = vi.fn((url: string) => {
  if (url.endsWith('/api/v2/admin/models') && !url.includes('/test') && !url.match(/\/models\/[^/]+$/)) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockModels) } as Response);
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, latencyMs: 42 }) } as Response);
}) as any;

describe('ModelsView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders list of LLM and Embedding models', async () => {
    render(<MemoryRouter><ModelsView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('GLM')).toBeInTheDocument();
      expect(screen.getByText('BGE')).toBeInTheDocument();
    });
  });

  it('shows new model button', async () => {
    render(<MemoryRouter><ModelsView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/models\.newModel/)).toBeInTheDocument();
    });
  });

  it('renders test button for each model', async () => {
    render(<MemoryRouter><ModelsView /></MemoryRouter>);
    await waitFor(() => {
      const buttons = screen.getAllByText(/models\.test/);
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
