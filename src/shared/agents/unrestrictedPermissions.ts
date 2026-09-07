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
 * Approval-policy ids that mean "never ask the user". Ordered most- to
 * least-preferred for pickers; membership is what marks a policy as a full
 * bypass. Kept in one place so every surface that has to answer "may this
 * thread decide approvals on the user's behalf?" reads the same vocabulary.
 */
const FULL_BYPASS_APPROVAL_POLICIES = ["bypassPermissions", "yolo", "never", "dontAsk"] as const;

/**
 * Whether the thread's approval policy is a full-bypass one, i.e. the user has
 * asked never to be prompted. Provider-agnostic: policy ids are declared by
 * providers, so this only tests membership in the shared vocabulary above.
 */
export function isFullBypassApprovalPolicy(policy: string | undefined): boolean {
  return (
    policy !== undefined && (FULL_BYPASS_APPROVAL_POLICIES as readonly string[]).includes(policy)
  );
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
    FULL_BYPASS_APPROVAL_POLICIES,
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
