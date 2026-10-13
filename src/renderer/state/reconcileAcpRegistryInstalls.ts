import type { InstalledAcpRegistryAgent } from "@/shared/contracts";

/** Mutation replies may predate concurrent installs; only their requested IDs are authoritative. */
export function reconcileAcpRegistryInstalls(
  current: Record<string, InstalledAcpRegistryAgent>,
  installed: readonly InstalledAcpRegistryAgent[],
  agentIds?: readonly string[],
): Record<string, InstalledAcpRegistryAgent> {
  const records = Object.fromEntries(installed.map((record) => [record.id, record]));
  const next = agentIds ? { ...current } : records;
  for (const id of agentIds ?? []) {
    const record = records[id];
    if (record) next[id] = record;
    else delete next[id];
  }
  if (
    Object.keys(current).length === Object.keys(next).length &&
    Object.values(next).every((record) => {
      const existing = current[record.id];
      return (
        existing !== undefined &&
        existing.name === record.name &&
        existing.version === record.version &&
        existing.icon === record.icon &&
        existing.installedAt === record.installedAt &&
        existing.adapterKind === record.adapterKind &&
        existing.installKind === record.installKind
      );
    })
  )
    return current;
  return next;
}
