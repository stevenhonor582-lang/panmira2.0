import { TemplateRegistry } from './template-registry.js';
import { FindLeads } from './builtin/01-find-leads.js';
import { ColdOutreach } from './builtin/02-cold-outreach.js';
import { Followup } from './builtin/03-followup.js';
import { CustomerProfile } from './builtin/04-customer-profile.js';
import { Competitor } from './builtin/05-competitor.js';
import { Quotation } from './builtin/06-quotation.js';
import { ContractReview } from './builtin/07-contract-review.js';

export function createDefaultRegistry(): TemplateRegistry {
  const reg = new TemplateRegistry();
  reg.register([
    FindLeads,
    ColdOutreach,
    Followup,
    CustomerProfile,
    Competitor,
    Quotation,
    ContractReview,
  ]);
  return reg;
}
