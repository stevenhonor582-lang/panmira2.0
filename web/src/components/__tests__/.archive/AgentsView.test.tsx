import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentsView } from '../AgentsView';

vi.mock('../../store', () => ({
  useStore: (selector: any) => selector({ token: 'test-token' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockAgents = {
  agents: [
    { id: 'a1', name: 'Sales Agent', description: 'sales bot', isActive: true, roleTemplate: 'sales' },
    { id: 'a2', name: 'Support Agent', description: 'support bot', isActive: true, roleTemplate: 'support' },
  ],
};

global.fetch = vi.fn((url: string) => {
  if (url.endsWith('/api/v2/admin/agents') && !url.match(/agents\/[^/]+$/)) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAgents) } as Response);
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
}) as any;

describe('AgentsView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders agent list', async () => {
    render(<MemoryRouter><AgentsView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Sales Agent')).toBeInTheDocument();
      expect(screen.getByText('Support Agent')).toBeInTheDocument();
    });
  });

  it('has new agent button', async () => {
    render(<MemoryRouter><AgentsView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/agents\.newAgent/)).toBeInTheDocument();
    });
  });
});
