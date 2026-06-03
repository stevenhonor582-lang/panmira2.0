import type { BotConfigBase } from '../../config.js';
import type { Logger } from '../../utils/logger.js';
import type { Engine, Executor } from '../types.js';
import { StreamProcessor } from '../claude/stream-processor.js';
import { OpenAICompatExecutor } from './executor.js';

export class OpenAICompatEngine implements Engine {
  readonly name = 'openai-compat' as const;

  constructor(
    private config: BotConfigBase,
    private logger: Logger,
  ) {}

  createExecutor(): Executor {
    return new OpenAICompatExecutor(this.config, this.logger);
  }

  createStreamProcessor(userPrompt: string): StreamProcessor {
    return new StreamProcessor(userPrompt);
  }
}

export { OpenAICompatExecutor } from './executor.js';
