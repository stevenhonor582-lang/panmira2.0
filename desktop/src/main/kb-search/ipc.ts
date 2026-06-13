import type { Retriever } from './retriever.js';
import type { KbChunk, KbRetrieveArgs } from '../../shared/ipc-contract.js';

export interface KbSearchHandlersDeps {
  retriever: Pick<Retriever, 'retrieve'>;
}

export function createKbSearchHandlers(deps: KbSearchHandlersDeps) {
  return {
    'kb-search:retrieve': async (args: KbRetrieveArgs): Promise<KbChunk[]> => {
      return deps.retriever.retrieve(args);
    },
  };
}
