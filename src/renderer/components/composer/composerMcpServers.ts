import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { AppWindow, Globe, Users, type LucideIcon } from "lucide-react";
import type {
  AgentCapability,
  ComposerMcpScope,
  ComposerMcpScopes,
  ProjectLocation,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";

/**
 * Registry of composer MCP toggles. Adding a server means appending one
 * descriptor here — the "+" add menu (`ComposerAddMenu`), the enabled chips
 * (`McpChip`), and the draft/active composers all iterate this list.
 *
 * Labels/hints are lazy `msg` descriptors (module-level macros must use `msg`,
 * not `t`) resolved to strings at render time via `useLingui` — see the
 * settingsOptions.ts pattern.
 */

export type { ComposerMcpScope };

/** `ThreadConfig` keys that hold the per-thread enable flag for each MCP. */
export type ComposerMcpConfigKey = "browserMcp" | "subagentMcp" | "chromeMcp";

/**
 * Resolve an adapter-declared per-presentation scope pair to the active
 * presentation's scope. Absent values fall back to the generic behavior:
 * structured (GUI) runtimes bake MCP config at session start ("launch"),
 * terminal TUIs have no per-thread gating point ("none").
 */
export function resolveMcpScope(
  scopes: ComposerMcpScopes | undefined,
  presentationMode: ThreadPresentationMode,
): ComposerMcpScope {
  if (presentationMode === "gui") {
    return scopes?.gui ?? "launch";
  }
  return scopes?.terminal ?? "none";
}

export interface ComposerMcpServerDescriptor {
  id: "browser" | "subagents" | "chrome";
  configKey: ComposerMcpConfigKey;
  icon: LucideIcon;
  /** Menu row + chip label. */
  label: MessageDescriptor;
  /** Chip tooltip / aria-label shown when the server is enabled on a thread. */
  enabledTitle: MessageDescriptor;
  /** aria-label for the chip's remove button. */
  disableLabel: MessageDescriptor;
  getScope: (
    capabilities: AgentCapability,
    presentationMode: ThreadPresentationMode,
    projectLocation?: ProjectLocation,
  ) => ComposerMcpScope;
}

export const browserMcpServer: ComposerMcpServerDescriptor = {
  id: "browser",
  configKey: "browserMcp",
  icon: Globe,
  label: msg`Browser`,
  enabledTitle: msg`Browser MCP enabled for this thread`,
  disableLabel: msg`Disable Browser MCP`,
  getScope: (capabilities, presentationMode) =>
    resolveMcpScope(capabilities.browserMcpScope, presentationMode),
};

export const subagentMcpServer: ComposerMcpServerDescriptor = {
  id: "subagents",
  configKey: "subagentMcp",
  icon: Users,
  label: msg`Subagents`,
  enabledTitle: msg`Subagents enabled for this thread`,
  disableLabel: msg`Disable Subagents`,
  getScope: (capabilities, presentationMode) =>
    resolveMcpScope(capabilities.subagentMcpScope, presentationMode),
};

export const chromeMcpServer: ComposerMcpServerDescriptor = {
  id: "chrome",
  configKey: "chromeMcp",
  icon: AppWindow,
  label: msg`Chrome`,
  enabledTitle: msg`Chrome MCP enabled for this thread`,
  disableLabel: msg`Disable Chrome MCP`,
  getScope: (capabilities, presentationMode, projectLocation) =>
    projectLocation?.kind === "wsl"
      ? "none"
      : resolveMcpScope(capabilities.chromeMcpScope, presentationMode),
};

export const composerMcpServers: readonly ComposerMcpServerDescriptor[] = [
  browserMcpServer,
  subagentMcpServer,
  chromeMcpServer,
];

/**
 * Persistent-enablement key for Computer Use. It is not a registry descriptor
 * (its gating lives in `getComputerUseScope`), but it shares the same
 * `enabledMcpServers` map, so it needs a stable id alongside the registry ones.
 */
export const COMPUTER_USE_MCP_ID = "computer-use";

/**
 * Build a `ThreadConfig` patch that flips one MCP toggle. Typed on the shared
 * config-key union so callers stay `exactOptionalPropertyTypes`-safe.
 */
export function mcpTogglePatch(
  configKey: ComposerMcpConfigKey,
  enabled: boolean,
): Partial<ThreadConfig> {
  const patch: Partial<Record<ComposerMcpConfigKey, boolean>> = { [configKey]: enabled };
  return patch;
}
