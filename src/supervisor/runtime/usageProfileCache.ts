import type { UsageProfileCollector } from "./usageProfileTypes";
import type { HostPort } from "@poracode/agents-usage";

/** Account-source custody for cached usage. Only opaque fingerprints persist. */
export class UsageProfileCacheIdentities {
  private readonly identities = new Map<string, string>();

  constructor(
    private readonly invalidate: (id: string) => void,
    private readonly host: HostPort,
  ) {}

  load(value: unknown): void {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [id, identity] of Object.entries(value)) {
      if (typeof identity === "string" && identity.length <= 200) this.identities.set(id, identity);
    }
  }

  serialize(): Record<string, string> {
    return Object.fromEntries(this.identities);
  }

  get(id: string): string | undefined {
    return this.identities.get(id);
  }

  async synchronize(
    collectors: Map<string, UsageProfileCollector>,
    ids: readonly string[],
  ): Promise<void> {
    for (const id of this.identities.keys()) {
      if (!collectors.get(id)?.cacheIdentity) {
        this.identities.delete(id);
        this.invalidate(id);
      }
    }
    await Promise.all(
      ids.map(async (id) => {
        const collector = collectors.get(id);
        if (!collector?.cacheIdentity) return;
        const identity = await this.readIdentity(() => collector.cacheIdentity!(this.host));
        if (identity !== this.identities.get(id)) this.invalidate(id);
        if (identity === undefined) this.identities.delete(id);
        else this.identities.set(id, identity);
      }),
    );
  }

  async accepts(
    id: string,
    collector: UsageProfileCollector | undefined,
    expected: string | undefined,
  ): Promise<boolean> {
    if (!collector?.cacheIdentity) {
      if (expected !== undefined) {
        this.invalidate(id);
        this.identities.delete(id);
      }
      return expected === undefined;
    }
    const current = await this.readIdentity(() => collector.cacheIdentity!(this.host));
    const accepted =
      current !== undefined &&
      current === expected &&
      this.identities.get(collector.providerId) === expected;
    if (!accepted) {
      this.invalidate(collector.providerId);
      if (current === undefined) this.identities.delete(collector.providerId);
      else this.identities.set(collector.providerId, current);
    }
    return accepted;
  }

  private async readIdentity(read: () => Promise<string>): Promise<string | undefined> {
    try {
      const identity = await read();
      return identity.length > 0 && identity.length <= 200 ? identity : undefined;
    } catch {
      return undefined;
    }
  }
}
