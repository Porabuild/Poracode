import type { AgentStatus, Project } from "@/shared/contracts";
import { agentEnvForStatus } from "@/shared/machines";
import {
  agentAuthTarget,
  findAgentAuthMethodForStatus,
  findProjectForMachine,
  findTerminalAuthMethodForStatus,
  shouldPreferTerminalLogin,
} from "@/renderer/utils/acpRegistryAuth";

/**
 * Client facts the discovery screen cannot infer from a provider status alone.
 * `isBrowserClient` matches the screen's own browser-runtime gate: such a
 * client cannot open this machine's OAuth window, secret store, or a routed
 * login shell. `isWindows` is the local bridge platform, because discovery
 * statuses are that host's own inventory and never a paired desktop's.
 */
export interface DiscoverySignInContext {
  readonly isBrowserClient: boolean;
  readonly isWindows: boolean;
  readonly projects: readonly Project[];
}

/**
 * The one supported sign-in (or fallback) for a single discovered row. Every
 * variant carries the EXACT status it came from, so the action never addresses
 * a different provider, account, or environment than the row the user pressed.
 */
export type DiscoverySignIn =
  | { readonly kind: "notNeeded" }
  | {
      readonly kind: "agentAuth";
      readonly status: AgentStatus;
      readonly methodId: string;
      readonly target: ReturnType<typeof agentAuthTarget>;
    }
  | {
      readonly kind: "terminal";
      readonly status: AgentStatus;
      readonly command: string;
      readonly env: Record<string, string> | undefined;
      /** Concrete, exact local project; never undefined (see the resolver). */
      readonly project: Project;
    }
  /** Local desktop, but no provider-reported direct login method: add credentials in Settings. */
  | { readonly kind: "settings" }
  /** Browser/remote client: sign-in happens on the paired desktop, then refresh. */
  | { readonly kind: "browserFallback" };

/**
 * Resolve the provider-agnostic sign-in action for one discovered status.
 *
 * Mirrors ThreadAuthRequiredDock's decision order (terminal login when the
 * provider prefers it or no ACP method is advertised, otherwise the agent-owned
 * ACP auth flow), so discovery offers only supported direct auth actions and a
 * clear fallback when the client cannot initiate locally.
 */
export function resolveDiscoverySignIn(
  status: AgentStatus,
  context: DiscoverySignInContext,
): DiscoverySignIn {
  if (status.authState !== "missing") return { kind: "notNeeded" };
  // No local sign-in surface on a browser/remote client — the paired desktop
  // owns the credential store and login shell. Refresh stays the actionable step.
  if (context.isBrowserClient) return { kind: "browserFallback" };

  const agentAuthMethod = findAgentAuthMethodForStatus(status);
  const canUseAgentAuth = agentAuthMethod !== undefined;
  const loginCommand = status.loginCommand;
  const canUseTerminalLogin = Boolean(loginCommand);
  const useTerminalLogin =
    canUseTerminalLogin && (shouldPreferTerminalLogin(status) || !canUseAgentAuth);

  if (useTerminalLogin && loginCommand) {
    const env = agentEnvForStatus(status);
    const wslDistro = env.kind === "wsl" ? env.distro : undefined;
    // Discovery statuses are the local bridge inventory. Pin the login shell
    // to THIS status's own machine with a home-rooted, remote-free project so
    // a paired desktop, another WSL distro, or a focused unrelated project can
    // never receive the credentials. Same pattern as runAppProviderLogin.
    const project = findProjectForMachine(
      {
        id: wslDistro ?? "native",
        ref: { host: "local", env },
        kind: wslDistro ? "local-wsl" : "local",
        label: status.label,
        status: "online",
      },
      context.projects,
      context.isWindows,
      [status],
      { allowHomeWithoutProject: true },
    );
    // allowHomeWithoutProject makes this unreachable, but never hand a login
    // terminal an undefined project: it would fall back to the focused project.
    if (project) {
      return {
        kind: "terminal",
        status,
        command: loginCommand,
        env: findTerminalAuthMethodForStatus(status)?.env,
        project,
      };
    }
  }
  if (agentAuthMethod) {
    return {
      kind: "agentAuth",
      status,
      methodId: agentAuthMethod.id,
      target: agentAuthTarget(status),
    };
  }
  return { kind: "settings" };
}
