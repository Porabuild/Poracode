import type { BackendDatabaseCaller } from "@/shared/backendHostProtocol";

/**
 * Read-through shell projection for small UI preferences. The cache lets
 * Electron APIs that require synchronous construction read already-prefetched
 * values without opening SQLite in main; BackendHost remains authoritative.
 */
export class BackendStateStore {
  private readonly values = new Map<string, string | null>();

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
    this.values.set(key, value);
    void this.database.callDatabase("dbSetState", { key, value });
  }
}

export interface ShellStateStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}
