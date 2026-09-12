import { readOpenCode2TerminalPackages } from "./terminalPluginConfig";
import type {
  AgentPluginPackage,
  ManageAgentPluginsPayload,
  ManageAgentPluginsResult,
} from "@/shared/contracts";
import { detectProbeLocation, readAgentCommandOutput } from "../base";
import { OPENCODE2_ENV, resolveOpenCode2Binary } from "./binary";
import { acquireOpenCode2Server } from "./client";
import type { PluginInfo } from "./clientTypes";

const operations = new Map<string, Promise<unknown>>();

/** Native package entries only: local and built-in plugins cannot be removed with plugin remove. */
export function openCode2PluginPackages(plugins: PluginInfo[]): AgentPluginPackage[] {
  return plugins.flatMap((plugin) =>
    plugin.source.type !== "package"
      ? []
      : [
          {
            target: plugin.source.target,
            ...(plugin.id ? { id: plugin.id } : {}),
            ...(plugin.source.version ? { version: plugin.source.version } : {}),
            status: plugin.state.status,
            outdated: plugin.source.outdated === true,
            server: plugin.features.server === true,
            terminal: plugin.features.tui === true,
          },
        ],
  );
}

export function validateOpenCode2PluginTarget(target: string): string {
  const value = target.trim();
  // eslint-disable-next-line no-control-regex -- CLI targets must not contain control characters.
  if (!value || value.length > 512 || value.startsWith("-") || /[\s\x00-\x1f\x7f]/.test(value))
    throw new Error("Invalid plugin package target.");
  return value;
}

/** Delegate config writes and package resolution to the CLI, including its separate TUI config. */
export async function manageOpenCode2Plugins(
  input: Omit<ManageAgentPluginsPayload, "agentKind">,
): Promise<ManageAgentPluginsResult> {
  const key = input.env.kind === "wsl" ? `wsl:${input.env.distro}` : "native";
  const previous = operations.get(key) ?? Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(async () => {
      const location = detectProbeLocation(
        input.env.kind === "wsl"
          ? { envKind: "wsl", wslDistro: input.env.distro }
          : { envKind: process.platform === "win32" ? "windows" : "posix" },
      );
      const binary = await resolveOpenCode2Binary(location);
      if (!binary) throw new Error("OpenCode 2 is not installed.");
      if (input.action === "install" || input.action === "remove") {
        const target = validateOpenCode2PluginTarget(input.target ?? "");
        const result = await readAgentCommandOutput(
          location,
          binary,
          ["plugin", input.action === "install" ? "add" : input.action, target],
          { env: OPENCODE2_ENV, timeoutMs: 120_000 },
        );
        if (!result.ok)
          throw new Error(
            "OpenCode 2 could not update the plugin. Check the package name and network connection.",
          );
      }
      const acquired = await acquireOpenCode2Server({ projectLocation: location });
      try {
        const options = { signal: AbortSignal.timeout(60_000) };
        await acquired.client.plugin.awaitActivation(undefined, options);
        if (input.action === "update")
          await acquired.client.plugin.update(
            { targets: [validateOpenCode2PluginTarget(input.target ?? "")] },
            options,
          );
        const readPackages = async () => {
          await acquired.client.plugin.awaitActivation(undefined, options);
          const result =
            input.action === "check"
              ? await acquired.client.plugin.check(undefined, options)
              : await acquired.client.plugin.list(undefined, options);
          const packages = openCode2PluginPackages(result.data);
          const terminal = await readOpenCode2TerminalPackages(location, binary);
          return [
            ...packages,
            ...terminal.filter(
              (pkg) => !packages.some((existing) => existing.target === pkg.target),
            ),
          ];
        };
        let packages = await readPackages();
        if (input.action === "install" || input.action === "remove") {
          // Config watching is asynchronous even after the native CLI has exited.
          // Keep the operation pending until this location sees the changed package.
          const expected = input.action === "install";
          const target = validateOpenCode2PluginTarget(input.target ?? "");
          const deadline = Date.now() + 10_000;
          while (packages.some((pkg) => pkg.target === target) !== expected) {
            if (Date.now() >= deadline)
              throw new Error(
                "Plugin configuration changed but its catalog has not refreshed. Refresh the plugin list.",
              );
            await new Promise((resolve) => setTimeout(resolve, 250));
            packages = await readPackages();
          }
        }
        return { packages };
      } finally {
        await acquired.dispose();
      }
    });
  operations.set(key, operation);
  try {
    return await operation;
  } finally {
    if (operations.get(key) === operation) operations.delete(key);
  }
}
