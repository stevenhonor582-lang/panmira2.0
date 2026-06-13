import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplatesPage } from '../TemplatesPage';
import type { PanmiraApi, TemplateSummary } from '../../../shared/ipc-contract.js';

function makeMockApi() {
  const findLeads: TemplateSummary = {
    id: 'find-leads',
    name: 'Find Leads',
    description: 'Search LinkedIn for potential buyers',
    category: 'lead-gen',
    estimatedDurationSec: 45
  };
  const coldOutreach: TemplateSummary = {
    id: 'cold-outreach',
    name: 'Cold Outreach',
    description: 'Write a personalized sales email',
    category: 'outreach',
    estimatedDurationSec: 30
  };
  return {
    browser: {
      open: vi.fn(async () => ({ viewportId: 'vp-1' })),
      screenshot: vi.fn(async () => 'iVBORw0KGgo='),
      click: vi.fn(async () => {}),
      fill: vi.fn(async () => {}),
      extract: vi.fn(async () => ''),
      close: vi.fn(async () => {})
    },
    templates: {
      run: vi.fn(async (_args: { templateId: string; params: Record<string, unknown> }) => ({
        taskId: 't-1',
        outputFormat: 'markdown'
      })),
      list: vi.fn(async () => [findLeads, coldOutreach])
    },
    kbSearch: {
      retrieve: vi.fn(async () => [])
    }
  } satisfies PanmiraApi;
}

describe('TemplatesPage', () => {
  let mockApi: ReturnType<typeof makeMockApi>;

  beforeEach(() => {
    mockApi = makeMockApi();
    (globalThis as { window: { api: PanmiraApi } }).window = { api: mockApi };
  });

  it('renders template cards with names visible after list() resolves', async () => {
    render(<TemplatesPage />);
    // list() is async — wait for both names to appear
    expect(await screen.findByText('Find Leads')).toBeInTheDocument();
    expect(await screen.findByText('Cold Outreach')).toBeInTheDocument();
  });

  it('clicking Run on a card invokes templates.run with the templateId and empty params', async () => {
    render(<TemplatesPage />);
    // wait for list to populate
    await screen.findByText('Find Leads');
    const runButtons = screen.getAllByRole('button', { name: /^run$/i });
    fireEvent.click(runButtons[0]);
    // Flush microtasks
    await Promise.resolve();
    await Promise.resolve();
    expect(mockApi.templates.run).toHaveBeenCalledWith({
      templateId: 'find-leads',
      params: {}
    });
  });
});
