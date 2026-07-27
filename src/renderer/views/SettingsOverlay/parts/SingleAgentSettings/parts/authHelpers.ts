import { msg } from "@lingui/core/macro";
import type {
  AgentEnvVarAuthMethod,
  AgentOwnedAuthMethod,
  AgentProviderMetadata,
  AgentStatus,
  UsageSnapshot,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import {
  envLabelForStatus,
  isAgentAuthMethod,
  isEnvVarAuthMethod,
  isTerminalAuthMethod,
} from "@/renderer/utils/acpRegistryAuth";

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
  return status.envKind === "wsl" && status.envDistro ? `wsl:${status.envDistro}` : "native";
}

export function supportsAcpLogoutStatus(
  status: AgentStatus,
  acpInstanceId: string | undefined,
): boolean {
  return status.authLogoutSupported === true || acpInstanceId !== undefined;
}
