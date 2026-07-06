import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardView } from '../DashboardView';

vi.mock('../../store', () => ({
  useStore: (selector: any) => selector({ token: 'test-token' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockStats = {
  counts: { llm: 5, embedding: 3, mcp: 2, knowledgeBases: 4, agents: 8, oauthClients: 1, skills: 6 },
  trends: [
    { date: '2026-07-01', token: 1000, skill: 10, mcp: 5, knowledge: 20 },
    { date: '2026-07-02', token: 1500, skill: 15, mcp: 8, knowledge: 25 },
  ],
};
const mockTeam = { bots: [{ name: 'b1', status: 'idle' }] };
const mockActivity = { events: [] };
const mockMemory = { stats: [] };

global.fetch = vi.fn((url: string) => {
  if (url.includes('/api/v2/admin/dashboard/stats')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats) } as Response);
  }
  if (url.includes('/api/team/status')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTeam) } as Response);
  }
  if (url.includes('/api/activity/events')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockActivity) } as Response);
  }
  if (url.includes('/api/memories/stats')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMemory) } as Response);
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
}) as any;

describe('DashboardView - resources overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 4 status cards from stats API', async () => {
    render(<MemoryRouter><DashboardView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByTestId('stat-llm')).toHaveTextContent('5');
    });
    expect(screen.getByTestId('stat-embedding')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-knowledgeBases')).toHaveTextContent('4');
    expect(screen.getByTestId('stat-agents')).toHaveTextContent('8');
  });

  it('renders 3 quick action buttons', async () => {
    render(<MemoryRouter><DashboardView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/dashboard\.newAgent/)).toBeInTheDocument();
      expect(screen.getByText(/dashboard\.uploadDoc/)).toBeInTheDocument();
      expect(screen.getByText(/dashboard\.connectChannel/)).toBeInTheDocument();
    });
  });
});
