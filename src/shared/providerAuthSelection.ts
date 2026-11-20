import type { AppProviderAuthTarget, AppProviderSignIn } from "./contracts/appProviderAuth";
import type { AgentStatus, AgentStatusesResponse, GetAgentStatusesPayload } from "./contracts";

export function providerAuthDiscovery(target: AppProviderAuthTarget): GetAgentStatusesPayload {
  return {
    wslDistros: target.env.kind === "wsl" ? [target.env.distro] : [],
    scope: { agentKinds: [target.agentKind], envs: [target.env] },
  };
}

export function selectProviderAuthStatus(
  response: AgentStatusesResponse,
  { agentKind, env, runtime }: AppProviderAuthTarget,
): AgentStatus {
  const status = (env.kind === "wsl" ? response.wsl : response.windows).find(
    (candidate) =>
      candidate.kind === agentKind &&
      (env.kind === "native" ? candidate.envKind !== "wsl" : candidate.envDistro === env.distro),
  );
  if (!status?.installed) throw new Error("Provider is not installed in this environment.");
  if (!runtime) return status;
  const variant = status.runtimeVariants?.[runtime];
  if (!variant?.installed) throw new Error("The selected provider runtime is unavailable.");

  const hasRuntimeLogin =
    variant.loginCommand !== undefined ||
    variant.authMethods !== undefined ||
    variant.preferTerminalLogin !== undefined ||
    variant.authLogoutSupported !== undefined;
  const login = variant.authUsesProviderLogin ? (hasRuntimeLogin ? variant : status) : undefined;
  const methods =
    login?.authMethods ??
    (login ? undefined : variant.authMethods?.filter(({ type }) => type === "env_var"));
  const {
    loginCommand: _command,
    authMethods: _methods,
    preferTerminalLogin: _terminal,
    authLogoutSupported: _logout,
    providerMetadata: _metadata,
    ...base
  } = status;
  return {
    ...base,
    authState: variant.authState,
    ...(login?.loginCommand ? { loginCommand: login.loginCommand } : {}),
    ...(methods ? { authMethods: methods } : {}),
    ...(login?.preferTerminalLogin ? { preferTerminalLogin: true } : {}),
    ...(login?.authLogoutSupported ? { authLogoutSupported: true } : {}),
    ...(variant.providerMetadata ? { providerMetadata: variant.providerMetadata } : {}),
  };
}

export function selectProviderSignIn(
  status: AgentStatus,
  { methodId, terminal }: AppProviderSignIn,
) {
  const methods = status.authMethods ?? [];
  if (terminal && !methodId) {
    if (!status.loginCommand)
      throw new Error("This provider has no terminal sign-in for this environment.");
    return {
      type: "terminal" as const,
      command: status.loginCommand,
      method: methods.find(({ type }) => type === "terminal"),
    };
  }
  const method = methodId
    ? methods.find(({ id }) => id === methodId)
    : methods.length === 1
      ? methods[0]
      : undefined;
  if (methodId && !method) throw new Error("Choose a sign-in method from provider auth status.");
  if (terminal && method?.type !== "terminal") {
    throw new Error("Choose an advertised terminal method or omit methodId for terminal sign-in.");
  }
  if (method?.type === "env_var") {
    throw new Error("Enter this method's environment credentials in the provider settings.");
  }
  if (status.preferTerminalLogin && status.loginCommand) {
    return { type: "terminal" as const, command: status.loginCommand, method };
  }
  if (!method && methods.length > 1) {
    throw new Error("Choose a sign-in method from provider auth status.");
  }
  if (method && method.type !== "terminal") {
    return { type: "agent" as const, methodId: method.id };
  }
  if (!status.loginCommand)
    throw new Error("This provider has no terminal sign-in for this environment.");
  return { type: "terminal" as const, command: status.loginCommand, method };
}
