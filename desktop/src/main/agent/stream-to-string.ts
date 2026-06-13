// Adapter: takes a StreamRouter-shaped EventEmitter and returns a single
// concatenated string from the 'content' events until 'done' (or rejects on 'error').
// Used to bridge the event-based stream from the WS pipeline into the
// `streamAgent(prompt) => Promise<string>` contract that TemplateRunner expects.

interface StreamLike {
  on(event: 'content', listener: (chunk: string) => void): unknown;
  on(event: 'done', listener: () => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
}

export function streamToString(_prompt: string, router: StreamLike): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let out = '';
    const onContent = (chunk: string) => {
      out += chunk;
    };
    const onDone = () => {
      cleanup();
      resolve(out);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    function cleanup() {
      // EventEmitter.off not always available across Node versions — be defensive
      if (typeof (router as { off?: unknown }).off === 'function') {
        (router as unknown as { off: (e: string, l: unknown) => void }).off('content', onContent);
        (router as unknown as { off: (e: string, l: unknown) => void }).off('done', onDone);
        (router as unknown as { off: (e: string, l: unknown) => void }).off('error', onError);
      }
    }
    router.on('content', onContent);
    router.on('done', onDone);
    router.on('error', onError);
  });
}
