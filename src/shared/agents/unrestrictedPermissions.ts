import type { AgentCapability, ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { isHomeScopeLocation } from "@/shared/homeScope";

/** The capability slice needed to resolve a provider's full-bypass posture. */
export type UnrestrictedPermissionCapabilities = Pick<
  AgentCapability,
  "approvalPolicies" | "sandboxModes" | "bypassPermissions"
>;

export interface UnrestrictedPermissionConfig {
  approvalPolicy?: string;
  sandboxMode?: string;
}

/**
 * Resolve a provider's most-permissive approval/sandbox choice from its
 * advertised capabilities, falling back to its declared bypass posture when
 * the probe exposes no choices. Provider-agnostic: the preferred-id lists are
 * only ranked candidates — a value is used solely when the target provider
 * itself advertises it. Shared by the subagent lane (unrestricted children)
 * and scheduled runs (unattended, so approvals cannot be answered).
 */
export function resolveUnrestrictedPermissionConfig(
  capabilities: UnrestrictedPermissionCapabilities,
): UnrestrictedPermissionConfig {
  const approvalPolicy = resolveUnrestrictedOption(
    capabilities.approvalPolicies,
    capabilities.bypassPermissions?.approvalPolicy,
    ["bypassPermissions", "yolo", "never", "dontAsk"],
  );
  const sandboxMode = resolveUnrestrictedOption(
    capabilities.sandboxModes,
    capabilities.bypassPermissions?.sandboxMode,
    ["danger-full-access", "yolo"],
  );
  return {
    ...(approvalPolicy ? { approvalPolicy } : {}),
    ...(sandboxMode ? { sandboxMode } : {}),
  };
}

/**
 * Home is OS-level: every agent launches with that provider's strongest
 * advertised approval/sandbox posture so the native CLI is not confined to
 * the home folder. Repo workspaces are left unchanged.
 */
export function applyHomeScopePermissions(
  location: ProjectLocation,
  config: ThreadConfig,
  capabilities: UnrestrictedPermissionCapabilities,
): ThreadConfig {
  if (!isHomeScopeLocation(location)) return config;
  const unrestricted = resolveUnrestrictedPermissionConfig(capabilities);
  if (!unrestricted.approvalPolicy && !unrestricted.sandboxMode) return config;
  return { ...config, ...unrestricted };
}

function resolveUnrestrictedOption(
  options: readonly { id: string }[],
  declaredBypass: string | undefined,
  preferredIds: readonly string[],
): string | undefined {
  for (const id of preferredIds) {
    const match = options.find((option) => option.id === id);
    if (match) return match.id;
  }
  if (
    declaredBypass &&
    (options.length === 0 || options.some((option) => option.id === declaredBypass))
  ) {
    return declaredBypass;
  }
  return undefined;
}
