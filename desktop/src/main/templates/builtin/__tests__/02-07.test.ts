import { describe, it, expect } from 'vitest';
import { ColdOutreach } from '../02-cold-outreach.js';
import { Followup } from '../03-followup.js';
import { CustomerProfile } from '../04-customer-profile.js';
import { Competitor } from '../05-competitor.js';
import { Quotation } from '../06-quotation.js';
import { ContractReview } from '../07-contract-review.js';

describe('built-in templates 02-07', () => {
  const all = [ColdOutreach, Followup, CustomerProfile, Competitor, Quotation, ContractReview];

  it('all templates have unique ids', () => {
    const ids = all.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all templates have valid metadata', () => {
    for (const t of all) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(5);
      expect(['lead-gen', 'outreach', 'analysis', 'admin']).toContain(t.category);
      expect(t.estimatedDurationSec).toBeGreaterThan(0);
    }
  });

  it('ColdOutreach.kbRequired and uses KB context', () => {
    expect(ColdOutreach.kbRequired).toBe(true);
    const p = ColdOutreach.prompt({ recipient: 'John', company: 'Acme', product: 'pumps', tone: 'formal' }, undefined, 'OUR PRODUCT IS GREAT');
    expect(p).toContain('Acme');
    expect(p).toContain('OUR PRODUCT IS GREAT');
  });

  it('Followup accepts prior email + new context', () => {
    const p = Followup.prompt(
      { customerName: 'John', priorEmail: 'old text', newContext: 'they replied' },
      undefined,
      undefined,
    );
    expect(p).toContain('old text');
    expect(p).toContain('they replied');
  });

  it('CustomerProfile uses browser + KB', () => {
    expect(CustomerProfile.kbRequired).toBe(true);
    expect(CustomerProfile.browserActions).toBeDefined();
  });

  it('Competitor uses browser only', () => {
    expect(Competitor.kbRequired).toBe(false);
    expect(Competitor.browserActions).toBeDefined();
  });

  it('Quotation uses KB only', () => {
    expect(Quotation.kbRequired).toBe(true);
    expect(Quotation.browserActions).toBeUndefined();
  });

  it('ContractReview uses KB only', () => {
    expect(ContractReview.kbRequired).toBe(true);
    expect(ContractReview.browserActions).toBeUndefined();
  });
});
