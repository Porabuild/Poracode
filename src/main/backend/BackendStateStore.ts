import type { BackendDatabaseCaller } from "@/shared/backendHostProtocol";

/**
 * Read-through shell projection for small UI preferences. The cache lets
 * Electron APIs that require synchronous construction read already-prefetched
 * values without opening SQLite in main; BackendHost remains authoritative.
 */
export class BackendStateStore {
  private readonly values = new Map<string, string | null>();
  private readonly pendingWrites = new Set<Promise<void>>();
  private closed = false;

  constructor(private readonly database: BackendDatabaseCaller) {}

  async preload(keys: readonly string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        this.values.set(key, await this.database.callDatabase("dbGetState", key));
      }),
    );
  }

  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string): void {
    if (this.closed) return;
    this.values.set(key, value);
    const write = this.database
      .callDatabase("dbSetState", { key, value })
      .catch((error: unknown) => {
        console.warn("[poracode] failed to persist shell state", key, error);
      })
      .finally(() => this.pendingWrites.delete(write));
    this.pendingWrites.add(write);
  }

  /** Drain saves before BackendHost disposal; later window-close events cannot enqueue more. */
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.pendingWrites);
  }
}

export interface ShellStateStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}
