import { describe, it, expect, vi } from 'vitest';
import { FindLeads } from '../01-find-leads.js';

describe('FindLeads template', () => {
  it('has expected metadata', () => {
    expect(FindLeads.id).toBe('find-leads');
    expect(FindLeads.kbRequired).toBe(false);
    expect(FindLeads.category).toBe('lead-gen');
  });

  it('prompt mentions industry and region', () => {
    const p = FindLeads.prompt({ industry: 'auto parts', region: 'Germany' }, undefined, undefined);
    expect(p).toContain('auto parts');
    expect(p).toContain('Germany');
  });

  it('params reject missing fields', () => {
    expect(() => FindLeads.params.parse({})).toThrow();
  });

  it('browserActions navigates to LinkedIn search and extracts results', async () => {
    const browser = {
      navigate: vi.fn().mockResolvedValue(undefined),
      extract: vi.fn().mockResolvedValue('John Doe - Acme Corp'),
    } as any;
    const out = await FindLeads.browserActions!(browser, 's1', { industry: 'auto', region: 'DE' });
    expect(browser.navigate).toHaveBeenCalled();
    expect(out).toContain('Acme');
  });
});
