import { EngineConfig } from './engine-config.js';

type AnyPool = { query: (...args: any[]) => Promise<any> };

export interface ProviderResult {
  engine: string;
  fellBack: boolean;
  attempts: string[];
}

export class ProviderRouter {
  constructor(private opts: { pool: AnyPool }) {}

  async execute(primary: string, _prompt: string, ctx: { providerConfigs: string[] }): Promise<ProviderResult> {
    const tried: string[] = [primary, ...ctx.providerConfigs.filter(e => e !== primary)];
    let lastError: unknown;
    for (const engine of tried) {
      try {
        await EngineConfig.fromName(engine, { pool: this.opts.pool });
        return {
          engine,
          fellBack: engine !== primary,
          attempts: tried.slice(0, tried.indexOf(engine) + 1),
        };
      } catch (e) {
        lastError = e;
      }
    }
    throw new Error(`All providers failed: ${tried.join(', ')}. Last error: ${(lastError as Error)?.message ?? 'unknown'}`);
  }
}
