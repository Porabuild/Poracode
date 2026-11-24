import { basename, posix, win32 } from "node:path";
import { awaitOpenCodeActivation } from "./readiness";
import { readOpenCodeTerminalPackages } from "./terminalPluginConfig";
import type {
  AgentPluginPackage,
  ManageAgentPluginsPayload,
  ManageAgentPluginsResult,
} from "@/shared/contracts";
import {
  detectProbeLocation,
  readAgentCommandOutput,
  type AgentEnvContext,
  type AgentNativePlugin,
} from "../base";
import { fetchNpmLatestVersion } from "../updateAgent";
import { resolveOpenCodeBinary } from "./binary";
import { acquireOpenCodeServer } from "./client";
import type { PluginInfo } from "./clientTypes";

const operations = new Map<string, Promise<unknown>>();

function stripNpmPackageVersionSpecifier(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) {
    const slashIndex = trimmed.indexOf("/");
    if (slashIndex < 0) return trimmed;
    const versionAtIndex = trimmed.indexOf("@", slashIndex + 1);
    return versionAtIndex < 0 ? trimmed : trimmed.slice(0, versionAtIndex);
  }
  const versionAtIndex = trimmed.indexOf("@");
  return versionAtIndex < 0 ? trimmed : trimmed.slice(0, versionAtIndex);
}

/**
 * Normalize active OpenCode native plugins (local directories and npm package
 * plugins) into Poracode `AgentNativePlugin` descriptors so Poracode's plugin
 * and skill pipeline can recognize plugins already loaded by OpenCode.
 */
export function openCodeNativePlugins(
  plugins: readonly PluginInfo[],
  packageRoots?: ReadonlyMap<string, string>,
): AgentNativePlugin[] {
  const entries: AgentNativePlugin[] = [];
  const seen = new Set<string>();
  const add = (name: string | undefined, root: string | undefined) => {
    const trimmedName = name?.trim();
    const trimmedRoot = root?.trim();
    if (!trimmedName || !trimmedRoot) return;
    const key = `${trimmedName}\0${trimmedRoot}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ name: trimmedName, root: trimmedRoot });
  };

  for (const plugin of plugins) {
    if (plugin.state.status !== "active") continue;
    if (plugin.source.type === "local") {
      const root = plugin.source.path;
      const folderName = (root.includes("\\") ? win32 : posix).basename(
        root.replace(/[\\/]+$/u, ""),
      );
      add(plugin.id, root);
      add(folderName, root);
      continue;
    }
    if (plugin.source.type === "package") {
      const packageName = stripNpmPackageVersionSpecifier(plugin.source.target);
      const root =
        packageRoots?.get(plugin.source.target) ?? packageRoots?.get(packageName) ?? packageName;
      const unscopedName = packageName.includes("/") ? basename(packageName) : packageName;
      add(packageName, root);
      add(unscopedName, root);
      add(plugin.id, root);
    }
  }
  return entries;
}

export async function listNativeOpenCodePlugins(
  ctx: AgentEnvContext,
): Promise<readonly AgentNativePlugin[]> {
  const location = detectProbeLocation(ctx);
  const binary = await resolveOpenCodeBinary(location, ctx.signal);
  if (!binary) return [];
  const acquired = await acquireOpenCodeServer({ projectLocation: location });
  try {
    const options = { signal: ctx.signal ?? AbortSignal.timeout(15_000) };
    await awaitOpenCodeActivation(acquired.client, undefined, options);
    const result = await acquired.client.plugin.list(undefined, options);
    return openCodeNativePlugins(result.data);
  } finally {
    await acquired.dispose({ closeServerIfIdle: true });
  }
}

/** Native package entries only: local and built-in plugins cannot be removed with plugin remove. */
export function openCodePluginPackages(plugins: PluginInfo[]): AgentPluginPackage[] {
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
            ...(plugin.source.updating ? { updating: true } : {}),
            server: plugin.features.server === true,
            terminal: plugin.features.tui === true,
          },
        ],
  );
}

/** Plain npm package name for a plugin target, or undefined for Git/file/URL targets. */
export function npmPackageName(target: string): string | undefined {
  // Anything with a scheme, host, or SSH separator is not an npm name; without
  // this, `git@github.com:vendor/goal.git` strips to the unrelated `git` package.
  if (target.includes(":")) return undefined;
  const name = stripNpmPackageVersionSpecifier(target);
  return /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name) ? name : undefined;
}

/**
 * The OpenCode server flags outdated packages but never reports the version
 * an update would install. Resolve it from the npm registry (best effort:
 * undefined on any failure) so the UI can show what Update will deliver.
 */
export async function resolveNpmLatestVersion(target: string): Promise<string | undefined> {
  const name = npmPackageName(target);
  return name ? fetchNpmLatestVersion(name) : undefined;
}

async function withLatestVersions(packages: AgentPluginPackage[]): Promise<AgentPluginPackage[]> {
  const latestByName = new Map<string, Promise<string | undefined>>();
  return Promise.all(
    packages.map(async (pkg) => {
      if (!pkg.outdated) return pkg;
      const name = npmPackageName(pkg.target);
      if (!name) return pkg;
      let latest = latestByName.get(name);
      if (!latest) {
        latest = fetchNpmLatestVersion(name);
        latestByName.set(name, latest);
      }
      const latestVersion = await latest;
      return latestVersion && latestVersion !== pkg.version ? { ...pkg, latestVersion } : pkg;
    }),
  );
}

export function validateOpenCodePluginTarget(target: string): string {
  const value = target.trim();
  // eslint-disable-next-line no-control-regex -- CLI targets must not contain control characters.
  if (!value || value.length > 512 || value.startsWith("-") || /[\s\x00-\x1f\x7f]/.test(value))
    throw new Error("Invalid plugin package target.");
  return value;
}

/** Delegate config writes and package resolution to the CLI, including its separate TUI config. */
export async function manageOpenCodePlugins(
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
      const binary = await resolveOpenCodeBinary(location);
      if (!binary) throw new Error("OpenCode is not installed.");
      if (input.action === "install" || input.action === "remove") {
        const target = validateOpenCodePluginTarget(input.target ?? "");
        const result = await readAgentCommandOutput(
          location,
          binary,
          ["plugin", input.action === "install" ? "add" : input.action, target],
          { timeoutMs: 120_000 },
        );
        if (!result.ok)
          throw new Error(
            "OpenCode could not update the plugin. Check the package name and network connection.",
          );
      }
      const acquired = await acquireOpenCodeServer({ projectLocation: location });
      try {
        // One options object per call: a shared 60s abort signal would
        // already be spent by the update wait's later reads.
        await awaitOpenCodeActivation(acquired.client, undefined, {
          signal: AbortSignal.timeout(60_000),
        });
        if (input.action === "update")
          await acquired.client.plugin.update(
            { targets: [validateOpenCodePluginTarget(input.target ?? "")] },
            { signal: AbortSignal.timeout(60_000) },
          );
        const readPackages = async () => {
          const options = { signal: AbortSignal.timeout(60_000) };
          const result =
            input.action === "check"
              ? await acquired.client.plugin.check(undefined, options)
              : await acquired.client.plugin.list(undefined, options);
          const packages = openCodePluginPackages(result.data);
          const terminal = await readOpenCodeTerminalPackages(location, binary);
          return [
            ...packages,
            ...terminal.filter(
              (pkg) => !packages.some((existing) => existing.target === pkg.target),
            ),
          ];
        };
        let packages = await readPackages();
        if (input.action === "update") {
          // `plugin.update` only starts the server-side update; the package
          // stays flagged `updating` until the new version is in place. Keep
          // this operation pending so the caller sees the finished version
          // instead of an unchanged list that looks like a no-op. The flag is
          // raised asynchronously, so also accept a version change, and give
          // the flag a short grace period to appear before concluding.
          const target = validateOpenCodePluginTarget(input.target ?? "");
          const beforeVersion = packages.find((pkg) => pkg.target === target)?.version;
          const startedAt = Date.now();
          const deadline = startedAt + 120_000;
          let seenUpdating = packages.some((pkg) => pkg.target === target && pkg.updating);
          for (;;) {
            const pkg = packages.find((entry) => entry.target === target);
            if (!pkg) break;
            if (pkg.updating) seenUpdating = true;
            else if (seenUpdating) break;
            else if (pkg.version && beforeVersion && pkg.version !== beforeVersion) break;
            else if (Date.now() - startedAt >= 1000) break;
            if (Date.now() >= deadline) break;
            await new Promise((resolve) => setTimeout(resolve, 500));
            packages = await readPackages();
          }
        }
        if (input.action === "check") packages = await withLatestVersions(packages);
        if (input.action === "install" || input.action === "remove") {
          // Config watching is asynchronous even after the native CLI has exited.
          // Keep the operation pending until this location sees the changed package.
          const expected = input.action === "install";
          const target = validateOpenCodePluginTarget(input.target ?? "");
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
