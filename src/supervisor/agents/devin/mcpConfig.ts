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

/** ACP-injected servers connect, but 3000.10.21's discovery tools read this disk catalog. */
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

/** Overlay only this process's config root; other config entries retain their original targets. */
export async function prepareDevinMcpConfig(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[],
) {
  if (location.kind === "wsl") return prepareWslConfig(location, servers);
  const variable = process.platform === "win32" ? "APPDATA" : "XDG_CONFIG_HOME";
  const original =
    process.env[variable] ||
    (process.platform === "win32"
      ? join(homedir(), "AppData", "Roaming")
      : join(homedir(), ".config"));
  // Windows stores durable sessions under APPDATA/devin/cli. Ensure even
  // the first session writes through a persistent directory junction.
  await mkdir(join(original, "devin", "cli"), { recursive: true });
  const root = await mkdtemp(
    process.platform === "win32"
      ? join(original, ".poracode-devin-config-")
      : join(tmpdir(), "poracode-devin-config-"),
  );
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
