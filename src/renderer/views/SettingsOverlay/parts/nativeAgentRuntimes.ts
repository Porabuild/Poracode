import type { MessageDescriptor } from "@lingui/core";
import type { AgentStatus, Project } from "@/shared/contracts";

/**
 * Declarative description of the independently installable runtimes behind one
 * native provider tile (e.g. Cursor's ACP CLI and its SDK package). Providers
 * own the vocabulary — labels, commands, install-source names — while the
 * shared registry card renders install targets, tags, versions and updates
 * generically from these slots plus `AgentStatus.runtimeVariants`.
 */

/** Resolves a lazily declared label at render time (`useLingui().t`). */
export type RuntimeLabelTranslator = (descriptor: MessageDescriptor) => string;

export interface NativeAgentRuntimeDetection {
  installed: boolean;
  version?: string;
  installationSource?: string;
}

/** A runtime the provider can install; also used for combined "install both" entries. */
export interface NativeAgentRuntimeInstallOption {
  /** Stable action-id suffix. Matches `runtimeVariants` keys for real runtimes. */
  id: string;
  /** `environment` is set only when several install targets are offered. */
  installLabel: (environment: string | undefined) => MessageDescriptor;
  installCommand: (project: Project) => string;
}

export interface NativeAgentRuntimeUpdateSlot {
  /** `environment` is set only when several environments offer the update. */
  actionLabel: (environment: string | undefined) => MessageDescriptor;
  /** Idle label of the standalone update button. */
  buttonLabel: MessageDescriptor;
  /** `aria-label` of the multi-environment update menu. */
  menuLabel: MessageDescriptor;
  updatedToast: (version: string) => MessageDescriptor;
  upToDateToast: MessageDescriptor;
  /** False when this installation is not app-managed (no update action shown). */
  canUpdate: (status: AgentStatus) => boolean;
  command: (status: AgentStatus, project: Project) => string | undefined;
}

export interface NativeAgentRuntimeSlot extends NativeAgentRuntimeInstallOption {
  /** Short untranslated acronym shown in the card footer (e.g. `ACP`). */
  badge: string;
  installedTag: MessageDescriptor;
  notInstalledTag: MessageDescriptor;
  /**
   * Provider-owned detection, for runtimes whose raw `runtimeVariants` entry
   * needs compatibility rules (e.g. statuses cached before the variant existed).
   * Defaults to reading `runtimeVariants[id]`.
   */
  detect?: (status: AgentStatus | undefined) => NativeAgentRuntimeDetection;
  /** Human label for `installationSource`; the vocabulary is provider-owned. */
  sourceLabel?: (source: string) => MessageDescriptor | string | undefined;
  update?: NativeAgentRuntimeUpdateSlot;
}

export interface NativeAgentRuntimeSlots {
  runtimes: readonly NativeAgentRuntimeSlot[];
  /** Offered in addition to the individual runtimes when more than one is missing. */
  bundle?: NativeAgentRuntimeInstallOption;
}

export function detectAgentRuntime(
  slot: NativeAgentRuntimeSlot,
  status: AgentStatus | undefined,
): NativeAgentRuntimeDetection {
  if (slot.detect) return slot.detect(status);
  const variant = status?.runtimeVariants?.[slot.id];
  return {
    installed: variant?.installed ?? false,
    ...(variant?.version ? { version: variant.version } : {}),
    ...(variant?.installationSource ? { installationSource: variant.installationSource } : {}),
  };
}

/**
 * Install options for one environment: every runtime not yet detected there,
 * plus the combined bundle when more than one is missing.
 */
export function availableRuntimeInstallOptions(
  slots: NativeAgentRuntimeSlots,
  status: AgentStatus | undefined,
): NativeAgentRuntimeInstallOption[] {
  const missing = slots.runtimes.filter((slot) => !detectAgentRuntime(slot, status).installed);
  if (missing.length > 1 && slots.bundle) return [...missing, slots.bundle];
  return missing;
}

/** Runtime ids detected as installed in at least one of the given environments. */
export function installedRuntimeIds(
  slots: NativeAgentRuntimeSlots,
  statuses: readonly AgentStatus[],
): ReadonlySet<string> {
  return new Set(
    slots.runtimes
      .filter((slot) => statuses.some((status) => detectAgentRuntime(slot, status).installed))
      .map((slot) => slot.id),
  );
}

/** `ACP v1.2.3 · SDK v1.0.31 (global npm)` for one detected environment. */
export function runtimeSummaryText(
  slots: NativeAgentRuntimeSlots,
  status: AgentStatus,
  translate: RuntimeLabelTranslator,
): string {
  const parts: string[] = [];
  for (const slot of slots.runtimes) {
    const detection = detectAgentRuntime(slot, status);
    if (!detection.installed) continue;
    const source = detection.installationSource
      ? slot.sourceLabel?.(detection.installationSource)
      : undefined;
    const sourceLabel =
      typeof source === "string" ? source : source ? translate(source) : undefined;
    parts.push(
      `${slot.badge}${detection.version ? ` v${detection.version}` : ""}` +
        (sourceLabel ? ` (${sourceLabel})` : ""),
    );
  }
  return parts.join(" · ");
}
