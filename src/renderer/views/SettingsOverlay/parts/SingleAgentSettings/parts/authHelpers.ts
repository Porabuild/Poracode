import { msg } from "@lingui/core/macro";
import type { AgentEnvVarAuthMethod, AgentOwnedAuthMethod, AgentStatus } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import {
  envLabelForStatus,
  isAgentAuthMethod,
  isEnvVarAuthMethod,
  isTerminalAuthMethod,
} from "@/renderer/utils/acpRegistryAuth";

export function formatAgentMetadataSummary(
  status: AgentStatus,
  options?: { includeAuthFallback?: boolean },
): string | undefined {
  const metadata = status.providerMetadata;
  const identityParts: string[] = [];
  if (metadata?.authenticatedAs) identityParts.push(metadata.authenticatedAs);
  if (metadata?.organization) identityParts.push(metadata.organization);
  if (metadata?.plan) identityParts.push(metadata.plan);

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

export function shouldPreferTerminalLogin(status: AgentStatus): boolean {
  return status.kind === "grok" && Boolean(status.loginCommand);
}
