import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";

/** A provider-owned collector may also replace its base account's collector. */
export interface UsageProfileCollector {
  providerId: string;
  collect(host: HostPort): Promise<UsageSnapshot>;
  /** Opaque source fingerprint, re-read before cached display and after collection.
   * A login/config change invalidates quota instead of showing another account. */
  cacheIdentity?(host: HostPort): Promise<string>;
}

/** Provider-specific profile discovery and accounting stay behind this registration. */
export interface UsageProfileSource {
  collectors: readonly UsageProfileCollector[];
  enrichSnapshot?(snapshot: UsageSnapshot, now: number): Promise<UsageSnapshot>;
  preserveAuthMiss?(snapshot: UsageSnapshot): boolean;
}
