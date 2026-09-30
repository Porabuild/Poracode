import { join } from "node:path";

/**
 * Per-environment known-hosts material (ADR §4). The file is derived state: it
 * is regenerated from the durable accepted fingerprint by an explicit
 * manage re-trust, so a lost or stale file never needs a migration and never
 * broadens trust on its own.
 */
export const ENVIRONMENT_KNOWN_HOSTS_DIRECTORY = "environment-known-hosts";

export function environmentKnownHostsPath(dataRoot: string, environmentId: string): string {
  return join(dataRoot, ENVIRONMENT_KNOWN_HOSTS_DIRECTORY, `${environmentId}.known_hosts`);
}
