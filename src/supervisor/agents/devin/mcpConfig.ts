import {
  chmod,
  link,
  stat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import JSON5 from "json5";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { quotePosixShellArg, readAgentCommandOutput } from "../base";

/**
 * Devin session MCP serialization for the disk-catalog overlay.
 *
 * Corrected live evidence (devin 3000.11.3, tmp/devin/probe/results/):
 * native `session/new` injection works for stdio entries and spec-exact
 * remote entries (`{type:"http"|"sse", name, url, headers:[{name,value}]}`),
 * and the overlay disk catalog works for stdio — all with real
 * tools/list + tools/call round trips inside a prompt turn. Direct native
 * injection is therefore proven and is NOT the reason this overlay serializes
 * everything as stdio.
 *
 * The relay is retained because Poracode's per-server `disabledTools`
 * filtering is enforced by its stdio tool-filter proxy
 * (`prepareMcpToolFilters(..., { remoteViaStdio: true })`); a natively
 * injected remote server bypasses that proxy, and Devin's documented native
 * filter (`disabled_tools` in config.json / `permissions` patterns) has
 * different, coarser semantics. Switching a server to direct native
 * injection requires the filter guarantee to be re-established first.
 */
export function mergeDevinMcpConfig(raw: string, servers: readonly ResolvedMcpServer[]) {
  const config: unknown = JSON5.parse(raw);
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("Invalid Devin MCP configuration");
  const current = (config as Record<string, unknown>).mcpServers ?? {};
  if (!current || typeof current !== "object" || Array.isArray(current))
    throw new Error("Invalid Devin MCP server catalog");
  const injected = Object.fromEntries(
    servers.map((server) => {
      if (server.transport.type !== "stdio")
        throw new Error("Devin session MCP requires a stdio relay");
      const { command, args, env } = server.transport;
      return [server.name, { command, ...(args ? { args } : {}), ...(env ? { env } : {}) }];
    }),
  );
  return JSON.stringify({ ...config, mcpServers: { ...current, ...injected } });
}

async function optionalFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "{}";
    throw error;
  }
}
async function mirrorEntries(source: string, target: string, excluded: string) {
  const entries = await readdir(source).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const name of entries) {
    if (name === excluded || name.startsWith(".poracode-devin-config-")) continue;
    const from = join(source, name),
      to = join(target, name);
    try {
      await symlink(
        from,
        to,
        process.platform === "win32" && (await stat(from)).isDirectory() ? "junction" : "file",
      );
    } catch (error) {
      if (process.platform !== "win32") throw error;
      // File hard links retain mutable credentials/state without copying a profile.
      // Directory junctions above work without Windows symlink privileges.
      if ((await stat(from)).isDirectory()) throw error;
      await link(from, to);
    }
  }
}

/**
 * Explicit roots for the MCP config overlay, resolved from a profile's
 * execution context instead of process-global state.
 *
 * `root` is the directory the agent's config resolution starts from and must
 * contain `devin/` — for profiles this is the account/config root the context
 * already resolved (never the user's default root unless the profile IS the
 * native default). `overlayParent` is the private scratch parent for the
 * ephemeral overlay directory; its cleanup removes only the overlay, so
 * resources and account roots are preserved untouched.
 */
export interface DevinMcpConfigRoots {
  readonly root: string;
  readonly variable: "XDG_CONFIG_HOME" | "APPDATA";
  readonly overlayParent: string;
}

/** Default roots for the base native adapter (process env / platform home). */
export function devinMcpDefaultRoots(): DevinMcpConfigRoots {
  const win32 = process.platform === "win32";
  const variable = win32 ? "APPDATA" : "XDG_CONFIG_HOME";
  const root =
    process.env[variable] ||
    (win32 ? join(homedir(), "AppData", "Roaming") : join(homedir(), ".config"));
  // Windows stores durable sessions under APPDATA/devin/cli, so the overlay
  // must live under the real root to keep the first-session junction durable;
  // elsewhere the system temp dir keeps the user config tree pristine.
  return { root, variable, overlayParent: win32 ? root : tmpdir() };
}

/**
 * Overlay only this process's config root; other config entries retain their
 * original targets.
 */
export async function prepareDevinMcpConfig(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[],
) {
  if (location.kind === "wsl") return prepareWslConfig(location, servers);
  return prepareDevinMcpConfigForRoots(location, devinMcpDefaultRoots(), servers);
}

/** Context-driven overlay for profile launches; see {@link DevinMcpConfigRoots}. */
export async function prepareDevinMcpConfigForRoots(
  _location: ProjectLocation,
  roots: DevinMcpConfigRoots,
  servers: readonly ResolvedMcpServer[],
) {
  const { root: original, variable, overlayParent } = roots;
  await mkdir(join(original, "devin", "cli"), { recursive: true });
  const root = await mkdtemp(join(overlayParent, ".poracode-devin-config-"));
  const cleanup = () => rm(root, { recursive: true, force: true });
  try {
    await chmod(root, 0o700);
    await mirrorEntries(original, root, "devin");
    await mkdir(join(root, "devin"));
    await mirrorEntries(join(original, "devin"), join(root, "devin"), "mcp_config.json");
    const config = mergeDevinMcpConfig(
      await optionalFile(join(original, "devin", "mcp_config.json")),
      servers,
    );
    await writeFile(join(root, "devin", "mcp_config.json"), config, { mode: 0o600 });
    return { env: { [variable]: root }, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function prepareWslConfig(location: ProjectLocation, servers: readonly ResolvedMcpServer[]) {
  const source = await readAgentCommandOutput(location, "sh", [
    "-c",
    'cat "${XDG_CONFIG_HOME:-$HOME/.config}/devin/mcp_config.json" 2>/dev/null || printf "{}"',
  ]);
  if (!source.ok) throw new Error("Unable to read Devin MCP configuration");
  const config = mergeDevinMcpConfig(source.stdout, servers);
  const script = `set -eu
umask 077
original="\${XDG_CONFIG_HOME:-$HOME/.config}"
root=$(mktemp -d /tmp/poracode-devin-config-XXXXXX)
trap 'rm -rf "$root"' EXIT
for entry in "$original"/* "$original"/.[!.]*; do
  [ -e "$entry" ] || continue
  [ "\${entry##*/}" = devin ] || ln -s "$entry" "$root/\${entry##*/}"
done
mkdir "$root/devin"
for entry in "$original/devin"/* "$original/devin"/.[!.]*; do
  [ -e "$entry" ] || continue
  [ "\${entry##*/}" = mcp_config.json ] || ln -s "$entry" "$root/devin/\${entry##*/}"
done
printf '%s' "$PORACODE_DEVIN_MCP_CONFIG" | base64 -d > "$root/devin/mcp_config.json"
trap - EXIT
printf '%s' "$root"`;
  const result = await readAgentCommandOutput(location, "sh", ["-c", script], {
    env: { PORACODE_DEVIN_MCP_CONFIG: Buffer.from(config).toString("base64") },
  });
  const root = result.stdout.trim();
  if (!result.ok || !/^\/tmp\/poracode-devin-config-[A-Za-z0-9]+$/.test(root))
    throw new Error("Unable to prepare Devin MCP configuration");
  return {
    env: { XDG_CONFIG_HOME: root },
    cleanup: async () => {
      await readAgentCommandOutput(location, "sh", ["-c", `rm -rf -- ${quotePosixShellArg(root)}`]);
    },
  };
}
