import { msg } from "@lingui/core/macro";
import type {
  AgentEnvVarAuthMethod,
  AgentOwnedAuthMethod,
  AgentProviderMetadata,
  AgentRuntimeVariant,
  AgentStatus,
  UsageSnapshot,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { agentEnvForStatus, agentEnvKey } from "@/shared/machines";
import {
  envLabelForStatus,
  isAgentAuthMethod,
  isEnvVarAuthMethod,
  isTerminalAuthMethod,
} from "@/renderer/utils/acpRegistryAuth";

/**
 * Whether the status advertises an interactive (browser/CLI) sign-in, i.e. the
 * methods a per-env auth row can offer a Login button for. Env-var credentials
 * are excluded — they are edited in the shared block above those rows.
 */
export function hasInteractiveAuthMethods(status: AgentStatus): boolean {
  return (
    status.authMethods?.some(
      (method) => isAgentAuthMethod(method) || isTerminalAuthMethod(method),
    ) ?? false
  );
}

function installedRuntimeVariants(status: AgentStatus): AgentRuntimeVariant[] {
  const variants = status.runtimeVariants;
  if (!variants) return [];
  return Object.values(variants).filter((variant) => variant.installed);
}

function variantHasInteractiveAuthMethods(
  variant: AgentRuntimeVariant,
  status: AgentStatus,
): boolean {
  const methods = variant.authMethods ?? status.authMethods;
  return (
    methods?.some((method) => isAgentAuthMethod(method) || isTerminalAuthMethod(method)) ?? false
  );
}

/**
 * Installed runtimes that still need the provider's ordinary login. Runtimes
 * that opt out of provider login (external API keys) are excluded so the
 * shared row does not offer a misleading CLI/browser sign-in.
 */
export function unsignedInteractiveRuntimes(status: AgentStatus): AgentRuntimeVariant[] {
  return installedRuntimeVariants(status).filter((variant) => {
    if (variant.authUsesProviderLogin === false) return false;
    if (variant.authState === "authenticated") return false;
    if (variant.authState === "missing") return true;
    return variant.authState === "unknown" && variantHasInteractiveAuthMethods(variant, status);
  });
}

function rootNeedsInteractiveLogin(status: AgentStatus): boolean {
  if (status.authState === "missing") return true;
  return (
    status.authState === "unknown" &&
    status.acpSessionEstablished !== true &&
    hasInteractiveAuthMethods(status)
  );
}

/**
 * Whether an env still needs a sign-in. `unknown` only counts when the agent
 * advertises an interactive method and its ACP session setup did not succeed —
 * a working session means the agent is usable, so prompting for login there
 * would be a false alarm.
 *
 * Independently authenticated runtimes are checked on their own: a signed-in
 * CLI must not hide Login for an installed Chat runtime that is still unsigned.
 */
export function statusNeedsInteractiveLogin(status: AgentStatus): boolean {
  if (unsignedInteractiveRuntimes(status).length > 0) return true;
  return rootNeedsInteractiveLogin(status);
}

/**
 * Logout is only offered when a logout-capable runtime is actually signed in.
 * Copying `authLogoutSupported` onto the root status is not enough — a signed-in
 * CLI plus an unsigned Chat runtime would otherwise render Logout instead of Login.
 */
/**
 * Restrict a detected status to one named runtime so a Settings row can own
 * that runtime's version, auth, and login methods without the sibling's.
 */
export function statusForRuntimeVariant(status: AgentStatus, runtimeId: string): AgentStatus {
  const variant = status.runtimeVariants?.[runtimeId];
  const {
    loginCommand: _loginCommand,
    loginCommandDisplay: _loginCommandDisplay,
    preferTerminalLogin: _preferTerminalLogin,
    authMethods: _authMethods,
    authLogoutSupported: _authLogoutSupported,
    providerMetadata: _providerMetadata,
    runtimeVariants: _runtimeVariants,
    ...base
  } = status;
  if (!variant) {
    return { ...base, installed: false, authState: "missing" };
  }
  return {
    ...base,
    installed: variant.installed,
    authState: variant.authState,
    runtimeVariants: { [runtimeId]: variant },
    ...(variant.version ? { version: variant.version } : {}),
    ...(variant.loginCommand ? { loginCommand: variant.loginCommand } : {}),
    ...(variant.loginCommandDisplay ? { loginCommandDisplay: variant.loginCommandDisplay } : {}),
    ...(variant.preferTerminalLogin !== undefined
      ? { preferTerminalLogin: variant.preferTerminalLogin }
      : {}),
    ...(variant.authMethods ? { authMethods: variant.authMethods } : {}),
    ...(variant.authLogoutSupported ? { authLogoutSupported: true } : {}),
    ...(variant.providerMetadata ? { providerMetadata: variant.providerMetadata } : {}),
  };
}

export function statusHasAuthenticatedLogout(
  status: AgentStatus,
  acpInstanceId: string | undefined,
): boolean {
  const variants = installedRuntimeVariants(status);
  if (variants.length > 0) {
    return variants.some(
      (variant) => variant.authState === "authenticated" && variant.authLogoutSupported === true,
    );
  }
  return status.authState === "authenticated" && supportsAcpLogoutStatus(status, acpInstanceId);
}

/**
 * Live plan label to show instead of the one carried by `providerMetadata`.
 *
 * Detected plans are read out of provider credentials, which snapshot the plan
 * at sign-in time — Codex, for example, derives its plan from the
 * `chatgpt_plan_type` claim of the cached OAuth id_token, so an upgrade keeps
 * rendering the old tier until that token is refreshed. Usage collectors hit
 * the provider's live quota endpoint on every poll, so their plan is the
 * authoritative one whenever it describes the same account.
 *
 * Returns `undefined` (keep the detected plan) unless the snapshot is a healthy
 * read for an account that matches the detected identity. Accounts only count
 * as mismatched when both sides name one and they differ — collectors that
 * report no account still win, since usage is collected for the signed-in user.
 */
export function resolveLivePlanLabel(
  metadata: AgentProviderMetadata | undefined,
  usage: UsageSnapshot | undefined,
): string | undefined {
  if (usage?.status !== "ok") return undefined;
  const livePlan = usage.plan?.trim();
  if (!livePlan) return undefined;
  const detectedAccount = metadata?.authenticatedAs?.trim().toLowerCase();
  const liveAccount = usage.authenticatedAs?.trim().toLowerCase();
  if (detectedAccount && liveAccount && detectedAccount !== liveAccount) return undefined;
  return livePlan;
}

export function formatAgentMetadataSummary(
  status: AgentStatus,
  options?: { includeAuthFallback?: boolean; livePlan?: string | undefined },
): string | undefined {
  const metadata = status.providerMetadata;
  const identityParts: string[] = [];
  if (metadata?.authenticatedAs) identityParts.push(metadata.authenticatedAs);
  if (metadata?.organization) identityParts.push(metadata.organization);
  const plan = options?.livePlan ?? metadata?.plan;
  if (plan) identityParts.push(plan);

  if (identityParts.length > 0) return identityParts.join(" · ");

  const providers = metadata?.connectedProviders ?? [];
  if (providers.length > 0) {
    const labels = providers.map((p) => p.label).join(", ");
    const count = providers.length;
    const noun =
      count === 1
        ? i18n._(msg`provider`)
        : i18n._(msg({ message: "providers", comment: "plural" }));
    return `${count} ${noun} · ${labels}`;
  }

  if (options?.includeAuthFallback === false) return undefined;
  if (metadata?.authMethod) return i18n._(msg`via ${metadata.authMethod}`);
  if (status.authState === "authenticated") return i18n._(msg`Signed in`);
  return undefined;
}

export function formatStatusList(statuses: readonly AgentStatus[]): string {
  return statuses
    .map((status) => envLabelForStatus(status))
    .filter((label) => label.length > 0)
    .join(", ");
}

export function findEnvVarAuthMethod(
  statuses: readonly AgentStatus[],
): AgentEnvVarAuthMethod | undefined {
  for (const status of statuses) {
    const method = status.authMethods?.find(isEnvVarAuthMethod);
    if (method) return method;
  }
  return undefined;
}

export function findAgentAuthMethod(
  statuses: readonly AgentStatus[],
): { status: AgentStatus; method: AgentOwnedAuthMethod } | undefined {
  for (const status of statuses) {
    const method = status.authMethods?.find(isAgentAuthMethod);
    if (method) return { status, method };
  }
  return undefined;
}

export function findTerminalLoginStatus(statuses: readonly AgentStatus[]): AgentStatus | undefined {
  return statuses.find(
    (status) => status.loginCommand && status.authMethods?.some(isTerminalAuthMethod),
  );
}

export function statusEnvKey(status: AgentStatus): string {
  return agentEnvKey(agentEnvForStatus(status));
}

/**
 * Key that identifies the Settings row an auth action belongs to. Rows split
 * per runtime (see `statusForRuntimeVariant`) share one environment, so the
 * environment key alone would light up every sibling's pending state while a
 * single runtime signs in. A status scoped to exactly one runtime variant gets
 * that variant appended; an unscoped status keeps the plain environment key.
 */
export function authRowKey(status: AgentStatus): string {
  const envKey = statusEnvKey(status);
  const variantIds = status.runtimeVariants ? Object.keys(status.runtimeVariants) : [];
  return variantIds.length === 1 ? `${envKey}:${variantIds[0]}` : envKey;
}

export function supportsAcpLogoutStatus(
  status: AgentStatus,
  acpInstanceId: string | undefined,
): boolean {
  return status.authLogoutSupported === true || acpInstanceId !== undefined;
}
