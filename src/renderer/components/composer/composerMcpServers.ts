import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { AppWindow, Globe, Users, type LucideIcon } from "lucide-react";
import { resolveComposerMcpScope } from "@/shared/contracts";
import type {
  AgentCapability,
  ComposerMcpScope,
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
export type ComposerMcpConfigKey = "browserMcp" | "crossagentMcp" | "chromeMcp";

/**
 * Resolve an adapter-declared per-presentation scope pair to the active
 * presentation's scope. Absent values fall back to the generic behavior:
 * structured (GUI) runtimes bake MCP config at session start ("launch"),
 * terminal TUIs have no per-thread gating point ("none").
 */
export const resolveMcpScope = resolveComposerMcpScope;

/**
 * Providers that declare `mcpConfigSource: "agentSettings"` configure MCP on
 * their settings page instead of the composer: the "+" menu shows their
 * effective MCP rows read-only instead of exposing per-thread toggles.
 */
export function providerOwnsMcpConfig(
  capabilities: Pick<AgentCapability, "mcpConfigSource">,
): boolean {
  return capabilities.mcpConfigSource === "agentSettings";
}

/** Resolve a provider-owned MCP flag the same way as the supervisor runtime. */
export function providerMcpSettingEnabled(
  capabilities: Pick<AgentCapability, "agentSettingsDefaults">,
  settings: Record<string, boolean | string> | undefined,
  key: ComposerMcpConfigKey | "computerUse",
): boolean {
  return (settings?.[key] ?? capabilities.agentSettingsDefaults?.[key]) === true;
}

export interface ComposerMcpServerDescriptor {
  id: "browser" | "crossagents" | "chrome";
  configKey: ComposerMcpConfigKey;
  icon: LucideIcon;
  /** Menu row + chip label. */
  label: MessageDescriptor;
  /** Chip tooltip / aria-label shown when the server is enabled on a thread. */
  enabledTitle: MessageDescriptor;
  /** aria-label for the chip's remove button. */
  disableLabel: MessageDescriptor;
  isAvailable: (projectLocation?: ProjectLocation) => boolean;
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
  isAvailable: () => true,
  getScope: (capabilities, presentationMode) =>
    resolveMcpScope(capabilities.mcpScope, presentationMode),
};

export const crossagentMcpServer: ComposerMcpServerDescriptor = {
  id: "crossagents",
  configKey: "crossagentMcp",
  icon: Users,
  label: msg`Crossagents`,
  enabledTitle: msg`Crossagents enabled for this thread`,
  disableLabel: msg`Disable Crossagents`,
  isAvailable: () => true,
  getScope: (capabilities, presentationMode) =>
    resolveMcpScope(capabilities.mcpScope, presentationMode),
};

export const chromeMcpServer: ComposerMcpServerDescriptor = {
  id: "chrome",
  configKey: "chromeMcp",
  icon: AppWindow,
  label: msg`Chrome`,
  enabledTitle: msg`Chrome MCP enabled for this thread`,
  disableLabel: msg`Disable Chrome MCP`,
  isAvailable: (projectLocation) => projectLocation?.kind !== "wsl",
  getScope: (capabilities, presentationMode, projectLocation) =>
    !chromeMcpServer.isAvailable(projectLocation)
      ? "none"
      : resolveMcpScope(capabilities.mcpScope, presentationMode),
};

export const composerMcpServers: readonly ComposerMcpServerDescriptor[] = [
  browserMcpServer,
  crossagentMcpServer,
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
