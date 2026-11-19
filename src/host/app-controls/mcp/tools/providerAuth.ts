import { z } from "zod";
import {
  appProviderAuthTargetSchema,
  appProviderSignInSchema,
} from "@/shared/contracts/appProviderAuth";
import {
  providerAuthDiscovery,
  selectProviderAuthStatus,
  selectProviderSignIn,
} from "@/shared/providerAuthSelection";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireAppRuntime } from "./types";

const manageProviderAuth = defineAppControlTool({
  name: "manage_provider_auth",
  description:
    "Inspect sign-in methods and authentication status for a provider in its native or WSL environment. status returns method IDs, terminal availability and sign-out support. At the user's request, sign_in uses a provider-owned method. Set terminal:true to use an available private desktop login panel. Submit passwords and codes in that panel. sign_out signs the provider out of the selected environment. Set runtime for a named provider runtime.",
  input: z.discriminatedUnion("action", [
    appProviderAuthTargetSchema.extend({ action: z.literal("status") }),
    appProviderSignInSchema.extend({ action: z.literal("sign_in") }),
    appProviderAuthTargetSchema.extend({ action: z.literal("sign_out") }),
  ]),
  run: async (args, ctx) => {
    const discovery = providerAuthDiscovery(args);
    const status = selectProviderAuthStatus(
      await ctx.supervisor.refreshAgentStatuses(discovery),
      args,
    );
    if (args.action === "status") {
      return {
        authState: status.authState,
        terminalLogin: Boolean(status.loginCommand),
        terminalPreferred: status.preferTerminalLogin === true,
        signOutSupported: status.authLogoutSupported === true,
        runtimes: Object.keys(status.runtimeVariants ?? {}),
        methods:
          status.authMethods?.map(({ id, name, ...method }) => ({
            id,
            name,
            type: method.type ?? "agent",
            ...(method.type === "env_var"
              ? { variables: method.vars.map((variable) => variable.name) }
              : {}),
          })) ?? [],
      };
    }
    const { agentKind, env } = args;
    const environment =
      env.kind === "wsl"
        ? { envKind: "wsl" as const, wslDistro: env.distro }
        : { envKind: process.platform === "win32" ? ("windows" as const) : ("posix" as const) };
    if (args.action === "sign_out") {
      if (!status.authLogoutSupported)
        throw new Error("This provider does not support sign-out in this environment.");
      await requireAppRuntime(ctx).call("logoutAcpAgent", { agentKind, ...environment });
      return { loggedOut: true };
    }
    const method = selectProviderSignIn(status, args);
    if (method.type === "terminal") {
      if (!ctx.openProviderLogin)
        throw new Error("Terminal sign-in requires the owning desktop window.");
      const { action: _action, ...input } = args;
      return { ...(await ctx.openProviderLogin(input)), interaction: "desktop" };
    }
    await requireAppRuntime(ctx)
      .call("authenticateAcpAgent", {
        agentKind,
        ...environment,
        methodId: method.methodId,
      })
      .catch(() => {
        throw new Error(
          "Provider sign-in was not confirmed. Check provider auth status before retrying.",
        );
      });
    return { authenticated: true };
  },
});

export const providerAuthTools = appControlToolDomain(manageProviderAuth);
