// Explicit registration only. These provider-owned declarations are pure data:
// the host codec and renderer migration must apply exactly the same policy.
import { claudeStatusCachePolicy } from "@/supervisor/agents/claude/statusCache";
import { commandCodeStatusCachePolicy } from "@/supervisor/agents/commandcode/statusCache";
import { devinStatusCachePolicy } from "@/supervisor/agents/devin/statusCache";
import { piStatusCachePolicy } from "@/supervisor/agents/pi/statusCache";
import { qoderStatusCachePolicy } from "@/supervisor/agents/qoder/statusCache";

const policies = [
  claudeStatusCachePolicy,
  commandCodeStatusCachePolicy,
  devinStatusCachePolicy,
  piStatusCachePolicy,
  qoderStatusCachePolicy,
];

export function isAgentStatusCacheEntryCompatible(kind: string, version: number): boolean {
  return policies.every(
    (policy) =>
      (kind !== policy.kind && !kind.startsWith(`${policy.kind}:`)) ||
      version >= policy.minimumVersion,
  );
}
