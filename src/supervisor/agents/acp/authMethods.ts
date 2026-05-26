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

function terminalAuthMeta(
  method: AcpAuthMethod,
): Pick<AcpTerminalAuthMethod, "args" | "env"> | undefined {
  const terminalAuth = method._meta?.["terminal-auth"];
  if (typeof terminalAuth !== "object" || terminalAuth === null) return undefined;
  const candidate = terminalAuth as { args?: unknown; env?: unknown };
  const args = Array.isArray(candidate.args)
    ? candidate.args.filter((arg): arg is string => typeof arg === "string")
    : undefined;
  const env =
    typeof candidate.env === "object" && candidate.env !== null && !Array.isArray(candidate.env)
      ? Object.fromEntries(
          Object.entries(candidate.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : undefined;
  return {
    ...(args?.length ? { args } : {}),
    ...(env && Object.keys(env).length > 0 ? { env } : {}),
  };
}

function normalizeAcpAuthMethod(method: AcpAuthMethod): AcpAuthMethod {
  if (isAcpTerminalAuthMethod(method)) return method;
  const terminalMeta = terminalAuthMeta(method);
  if (!terminalMeta) return method;
  return {
    ...method,
    ...terminalMeta,
    type: "terminal",
  };
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
  const normalized = methods.map(normalizeAcpAuthMethod);
  const envVarNames = new Set(
    normalized.filter(isAcpEnvVarAuthMethod).map((method) => method.name),
  );
  return normalized.filter(
    (method) =>
      (isAcpEnvVarAuthMethod(method) || !hasVars(method)) &&
      !isKeyLikeAgentMethod(method) &&
      !(isAcpAgentAuthMethod(method) && envVarNames.has(method.name)),
  );
}
