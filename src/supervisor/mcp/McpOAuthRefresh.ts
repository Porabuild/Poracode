/** One refresh per resource, with cancellation that also fences credential writes. */
export class McpOAuthRefresh {
  private readonly pending = new Map<
    string,
    { controller: AbortController; result: Promise<string | undefined> }
  >();
  private readonly versions = new Map<string, number>();
  private disposed = false;

  constructor(private readonly timeoutMs?: number) {}

  version(url: string): number {
    return this.versions.get(url) ?? 0;
  }

  run(
    url: string,
    refresh: (signal: AbortSignal) => Promise<string | undefined>,
    timeoutMs: number,
  ): Promise<string | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    const existing = this.pending.get(url);
    if (existing) return existing.result;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs ?? timeoutMs);
    timer.unref?.();
    const result = Promise.resolve()
      .then(() => refresh(controller.signal))
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        if (this.pending.get(url)?.controller === controller) this.pending.delete(url);
      });
    this.pending.set(url, { controller, result });
    return result;
  }

  invalidate(url: string): void {
    this.versions.set(url, this.version(url) + 1);
    this.pending.get(url)?.controller.abort();
    this.pending.delete(url);
  }

  dispose(): void {
    this.disposed = true;
    for (const { controller } of this.pending.values()) controller.abort();
    this.pending.clear();
  }
}

/** The SDK uses this fetch for discovery, registration and the token grant. */
export function fetchWithSignal(signal: AbortSignal): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
    });
}
