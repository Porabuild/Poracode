import {
  baseAgentKind,
  isAgentProfileKind,
  stripAgentProfileBasePrefix,
  type AgentStatus,
} from "@/shared/contracts";
import { agentEnvForStatus, type AgentEnv } from "@/shared/machines";

/**
 * One discovery card per agent. A profile (`claude:work`, `cursor:work`, …)
 * is a second account of the same installed CLI as its base agent, so its
 * statuses nest in the base agent's card instead of reading as a separate
 * discovered agent. Standalone instance kinds with no built-in base
 * (`acp-generic:<id>` registry agents) keep their own card: their prefix is a
 * driver, not an agent.
 */
export interface AgentDiscoveryGroup {
  /** Card kind: the base kind for profiles, otherwise the status kind itself. */
  kind: string;
  statuses: AgentStatus[];
}

function discoveryGroupKind(status: AgentStatus): string {
  return isAgentProfileKind(status.kind) ? baseAgentKind(status.kind) : status.kind;
}

/** Native install first, then WSL distros alphabetically. */
function compareEnvs(a: AgentEnv, b: AgentEnv): number {
  if (a.kind !== b.kind) return a.kind === "native" ? -1 : 1;
  return a.kind === "wsl" && b.kind === "wsl" ? a.distro.localeCompare(b.distro) : 0;
}

/**
 * Base-agent statuses first (the card header represents the base agent), then
 * profiles by label; statuses of one kind are ordered by environment.
 */
function compareGroupStatuses(groupKind: string, a: AgentStatus, b: AgentStatus): number {
  const aIsBase = a.kind === groupKind;
  const bIsBase = b.kind === groupKind;
  if (aIsBase !== bIsBase) return aIsBase ? -1 : 1;
  if (a.kind !== b.kind) {
    const byLabel = a.label.localeCompare(b.label);
    if (byLabel !== 0) return byLabel;
    return a.kind.localeCompare(b.kind);
  }
  return compareEnvs(agentEnvForStatus(a), agentEnvForStatus(b));
}

/** Groups found statuses into discovery cards, in first-arrival order. */
export function groupDiscoveredAgents(statuses: readonly AgentStatus[]): AgentDiscoveryGroup[] {
  const groups: AgentDiscoveryGroup[] = [];
  const groupsByKind = new Map<string, AgentStatus[]>();
  for (const status of statuses) {
    const kind = discoveryGroupKind(status);
    const existing = groupsByKind.get(kind);
    if (existing) {
      existing.push(status);
    } else {
      const grouped = [status];
      groupsByKind.set(kind, grouped);
      groups.push({ kind, statuses: grouped });
    }
  }
  for (const group of groups) {
    group.statuses.sort((a, b) => compareGroupStatuses(group.kind, a, b));
  }
  return groups;
}

/** The "agents found" count: base agents and standalone agents, not profiles or envs. */
export function countDiscoveredAgentGroups(statuses: readonly AgentStatus[]): number {
  return new Set(
    statuses.filter((status) => status.installed).map((status) => discoveryGroupKind(status)),
  ).size;
}

export interface DiscoveryCardRows {
  /** Status the card header represents: the base agent when found, else the first status. */
  header: AgentStatus;
  /**
   * The base agent's own status when it was found. In a single-env scan its
   * badge belongs on the header; absent for a profile-only card.
   */
  base: AgentStatus | undefined;
  /**
   * Statuses that need their own row under the header: every status in a
   * multi-env scan (one per machine), otherwise only the profiles — the
   * header badge already covers the base agent.
   */
  detail: AgentStatus[];
}

export function discoveryCardRows(
  group: AgentDiscoveryGroup,
  multiEnv: boolean,
): DiscoveryCardRows {
  const base = group.statuses.find((status) => status.kind === group.kind);
  return {
    header: base ?? group.statuses[0]!,
    base,
    detail: multiEnv
      ? group.statuses
      : group.statuses.filter((status) => status.kind !== group.kind),
  };
}

/**
 * A profile's short label under its base agent's card. Supervisor labels are
 * built as `<Driver> ${displayName}`, so stripping the driver word recovers
 * the display name verbatim ("Claude Qwen" → "Qwen"); the full base label
 * ("Claude Code") is only a fallback for labels not built that way, so a
 * display name starting with its second word is never over-stripped.
 */
export function profileRowLabel(status: AgentStatus, baseLabel: string): string {
  const label = status.label.trim();
  const byDriver = stripAgentProfileBasePrefix(label, status.kind);
  if (byDriver !== label) return byDriver;
  if (label.toLowerCase().startsWith(`${baseLabel.toLowerCase()} `)) {
    const rest = label.slice(baseLabel.length).trim();
    if (rest) return rest;
  }
  return label;
}
