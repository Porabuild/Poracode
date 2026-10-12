import { z } from "zod";
import type { AgentStatus } from "@/shared/contracts";
import type { AppControlsToolContext, ToolDomain } from "./types";

const listArgsSchema = z.object({ refresh: z.boolean().optional() });

export const agentTools: ToolDomain = {
  specs: [
    {
      name: "list_installed_agents",
      description:
        "List the CLI-agent inventory across the native host and any WSL distros the user's projects use: each agent's kind, whether it is installed, its version, executable path, environment, and auth state. Reads the cached inventory by default; set refresh:true to force a fresh detection sweep (slower).",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { refresh: { type: "boolean" } },
      },
    },
  ],
  handlers: {
    list_installed_agents: async (args, ctx) => {
      const { refresh } = listArgsSchema.parse(args);
      // Detection scans the native host plus every WSL distro backing a project,
      // exactly like the app's own callers (see buildAgentStatuses / MainView).
      const wslDistros = wslDistrosFromProjects(ctx);
      const payload = { wslDistros };
      const response = refresh
        ? await ctx.supervisor.refreshAgentStatuses(payload)
        : await ctx.supervisor.getAgentStatuses(payload);
      const native = response.windows.map(agentView);
      const wsl = response.wsl.map(agentView);
      return {
        fromCache: response.fromCache,
        ...(native.length > 0 ? { native } : {}),
        ...(wsl.length > 0 ? { wsl } : {}),
      };
    },
  },
};

/** Distinct WSL distros backing the user's projects (native env needs none). */
function wslDistrosFromProjects(ctx: AppControlsToolContext): string[] {
  return [
    ...new Set(
      ctx
        .getProjects()
        .flatMap((project) => (project.location.kind === "wsl" ? [project.location.distro] : [])),
    ),
  ];
}

/** Provider-agnostic projection of one detected agent (no secrets). */
function agentView(status: AgentStatus) {
  return {
    kind: status.kind,
    label: status.label,
    installed: status.installed,
    authState: status.authState,
    ...(status.version ? { version: status.version } : {}),
    ...(status.executablePath ? { path: status.executablePath } : {}),
    ...(status.envKind ? { env: status.envKind } : {}),
    ...(status.envDistro ? { distro: status.envDistro } : {}),
  };
}
