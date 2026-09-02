/* A read against the node that occasionally stalls is worse than one that
   fails, because a stalled request holds a database transaction open for
   as long as the socket does. Every read the adapters make goes through
   here: bounded, and retried once, since the second attempt on a fresh
   request is what a stalled keep alive connection needs. */
export class ChainReadTimedOut extends Error {
  constructor(label: string, attempts: number, detail: string) {
    super(`${label} did not answer within the time allowed after ${attempts} attempts${detail}`);
    this.name = 'ChainReadTimedOut';
  }
}

export const chainReadTimeoutMs = 15_000;

export async function boundedChainRead<T>(
  label: string,
  read: (signal: AbortSignal) => Promise<T>,
  attempts = 2,
  timeoutMs = chainReadTimeoutMs,
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await read(controller.signal);
    } catch (error: unknown) {
      if (!controller.signal.aborted || attempt === attempts) {
        if (controller.signal.aborted) {
          throw new ChainReadTimedOut(label, attempts, '');
        }
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ChainReadTimedOut(label, attempts, '');
}

/* Waits for a transaction the node has already executed to be answerable by
   digest, which trails execution by the checkpoint interval and, on a local
   network, occasionally by much longer. Polls quickly and keeps the last
   answer, so a timeout says what the node was saying. */
export async function waitUntilVisible(
  lookup: (signal: AbortSignal) => Promise<unknown>,
  label: string,
  onSlow: (elapsedMs: number, lastAnswer: string) => void = () => undefined,
  patienceMs = 120_000,
  intervalMs = 250,
): Promise<number> {
  const started = Date.now();
  let lastAnswer = 'no answer yet';
  let reported = false;
  while (Date.now() - started < patienceMs) {
    try {
      await boundedChainRead(label, lookup, 1, 5_000);
      return Date.now() - started;
    } catch (error: unknown) {
      lastAnswer = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
    const elapsed = Date.now() - started;
    if (!reported && elapsed > 10_000) {
      reported = true;
      onSlow(elapsed, lastAnswer);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new ChainReadTimedOut(label, 1, `; last answer: ${lastAnswer}`);
}
