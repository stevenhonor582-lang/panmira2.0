import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserPage } from '../BrowserPage';
import type { PanmiraApi } from '../../../shared/ipc-contract.js';

function makeMockApi() {
  return {
    browser: {
      open: vi.fn(async (_taskId: string, _url: string) => ({ viewportId: 'vp-1' })),
      screenshot: vi.fn(async (_viewportId: string) => 'iVBORw0KGgo='),
      click: vi.fn(async () => {}),
      fill: vi.fn(async () => {}),
      extract: vi.fn(async () => ''),
      close: vi.fn(async () => {})
    },
    templates: {
      run: vi.fn(async () => ({ taskId: 't-1', outputFormat: 'json' })),
      list: vi.fn(async () => [])
    },
    kbSearch: {
      retrieve: vi.fn(async () => [])
    }
  } satisfies PanmiraApi;
}

describe('BrowserPage', () => {
  let mockApi: ReturnType<typeof makeMockApi>;

  beforeEach(() => {
    mockApi = makeMockApi();
    (globalThis as { window: { api: PanmiraApi } }).window = { api: mockApi };
  });

  it('renders a URL input with an https?:// placeholder pattern', () => {
    render(<BrowserPage />);
    const input = screen.getByPlaceholderText(/https?:\/\//) as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it('calls window.api.browser.open("manual", url) when Open is clicked', async () => {
    render(<BrowserPage />);
    const input = screen.getByPlaceholderText(/https?:\/\//) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://example.com' } });

    const openBtn = screen.getByRole('button', { name: /open/i });
    fireEvent.click(openBtn);

    // Microtask flush — open() is an async function returning a resolved promise.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockApi.browser.open).toHaveBeenCalledWith('manual', 'https://example.com');
  });
});
