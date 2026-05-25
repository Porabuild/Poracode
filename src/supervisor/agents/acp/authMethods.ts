/**
 * Helpers for working with the `authMethods` array surfaced by an ACP
 * `initialize()` response. Shared across the generic ACP driver and the
 * built-in ACP-speaking adapters (Copilot, Gemini, Cursor) so all four
 * surface the same auth options to the renderer.
 */

import type { AcpProbeResult } from "./probe";

type AcpAuthMethod = NonNullable<AcpProbeResult["authMethods"]>[number];
type AcpEnvVarAuthMethod = Extract<AcpAuthMethod, { type: "env_var" }>;
type AcpTerminalAuthMethod = Extract<AcpAuthMethod, { type: "terminal" }>;
type AcpAgentAuthMethod = Exclude<AcpAuthMethod, AcpEnvVarAuthMethod | AcpTerminalAuthMethod>;

export function isAcpEnvVarAuthMethod(method: AcpAuthMethod): method is AcpEnvVarAuthMethod {
  return "type" in method && method.type === "env_var";
}

export function isAcpTerminalAuthMethod(method: AcpAuthMethod): method is AcpTerminalAuthMethod {
  return "type" in method && method.type === "terminal";
}

export function isAcpAgentAuthMethod(method: AcpAuthMethod): method is AcpAgentAuthMethod {
  return !isAcpEnvVarAuthMethod(method) && !isAcpTerminalAuthMethod(method) && !hasVars(method);
}

function hasVars(method: AcpAuthMethod): boolean {
  return "vars" in method;
}

function isKeyLikeAgentMethod(method: AcpAuthMethod): boolean {
  if (!isAcpAgentAuthMethod(method)) return false;
  return /\b(api[-_\s]*key|token|secret)\b/iu.test(`${method.id} ${method.name}`);
}

/**
 * Some ACP agents advertise both an env_var method and a typeless "agent"
 * method for the same credential — the agent-owned one is a stub whose
 * `authenticate()` just acks. Drop those duplicates so the UI shows only the
 * real flow.
 */
export function dedupeAcpAuthMethods(methods: readonly AcpAuthMethod[]): AcpAuthMethod[] {
  const envVarNames = new Set(methods.filter(isAcpEnvVarAuthMethod).map((method) => method.name));
  return methods.filter(
    (method) =>
      (isAcpEnvVarAuthMethod(method) || !hasVars(method)) &&
      !isKeyLikeAgentMethod(method) &&
      !(isAcpAgentAuthMethod(method) && envVarNames.has(method.name)),
  );
}
