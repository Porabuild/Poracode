import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";
import type { SharedSettings } from "@/shared/settings";
import { collectCodexProfile, readCodexUsageProfiles } from "./codex/codexUsageProfiles";

/** Provider-owned profile collectors. The runtime does not parse profile payloads. */
export interface ProfileUsageCollector {
  collect(host: HostPort): Promise<UsageSnapshot>;
}

const factories: ReadonlyArray<(settings: SharedSettings) => Map<string, ProfileUsageCollector>> = [
  (settings) =>
    new Map(
      [...readCodexUsageProfiles(settings)].map(([id, profile]) => [
        id,
        { collect: (host: HostPort) => collectCodexProfile(profile, host) },
      ]),
    ),
];

export function readProfileUsageCollectors(
  settings: SharedSettings,
): Map<string, ProfileUsageCollector> {
  return new Map(factories.flatMap((factory) => [...factory(settings)]));
}
