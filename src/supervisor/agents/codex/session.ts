import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { resolveLightcodePaths } from "@/shared/lightcodePaths";
import {
  findSessionFiles,
  quotePosixShellArg,
  readSessionFileText,
  readWslCommandOutput,
  resolveWslHomeDirectory,
  resolveWslShellPath,
} from "../base";
import {
  parseCodexRolloutIdFromPath,
  parseCodexRolloutMeta,
  parseCodexSessionIndex,
  readCodexSessionIndex,
  type CodexRolloutMeta,
} from "./sessionFiles";

function nativePrivateCodexHome(): string {
  return join(
    resolveLightcodePaths(process.env.LIGHTCODE_DATA_DIR).agentPluginsDir,
    "codex",
    "home",
  );
}

function nativeCodexHomeCandidates(): string[] {
  return [join(homedir(), ".codex"), nativePrivateCodexHome()];
}

function wslPrivateCodexHome(distro: string): string | undefined {
  const home = resolveWslHomeDirectory(distro);
  return home ? `${home}/.lightcode/agent-plugins/codex/home` : undefined;
}

function dedupeById<T extends { id: string }>(items: T[], getUpdatedAt: (item: T) => number): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    const prev = byId.get(item.id);
    if (!prev || getUpdatedAt(item) > getUpdatedAt(prev)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

function dedupeRollouts(rollouts: CodexRolloutMeta[]): CodexRolloutMeta[] {
  return dedupeById(rollouts, (r) => r.updatedAt ?? 0);
}

function dedupeSessionIndex(
  sessions: Array<{ id: string; updatedAt: number; threadName: string }>,
): Array<{ id: string; updatedAt: number; threadName: string }> {
  return dedupeById(sessions, (s) => s.updatedAt).sort((a, b) => a.updatedAt - b.updatedAt);
}

export function describeCodexLocation(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
      return `windows:${location.path}`;
    case "wsl":
      return `wsl:${location.distro}:${location.linuxPath}`;
    case "posix":
      return `posix:${location.path}`;
  }
}

export function readCodexSessionIndexForLocation(location: ProjectLocation) {
  if (location.kind === "wsl") {
    const privateHome = wslPrivateCodexHome(location.distro);
    const commands = [
      "cat ~/.codex/session_index.jsonl 2>/dev/null || true",
      ...(privateHome
        ? [`cat ${quotePosixShellArg(`${privateHome}/session_index.jsonl`)} 2>/dev/null || true`]
        : []),
    ];
    const result = readWslCommandOutput(location.distro, "sh", ["-lc", commands.join("\n")]);
    if (!result.ok || result.stdout.length === 0) {
      return [];
    }
    return parseCodexSessionIndex(result.stdout);
  }

  const sessions = readCodexSessionIndex();
  const privateIndexPath = join(nativePrivateCodexHome(), "session_index.jsonl");
  let privateRaw: string;
  try {
    privateRaw = readFileSync(privateIndexPath, "utf8");
  } catch {
    return sessions;
  }
  return dedupeSessionIndex([...sessions, ...parseCodexSessionIndex(privateRaw)]);
}

/**
 * Async variant routed through the in-distro bridge on WSL (~10ms via HTTP
 * loopback) instead of `wsl.exe` cold start (~50–100ms). Used by the async
 * `discoverSessionRef` hot path; the sync version above remains for
 * `buildLaunchArgv` where the call site itself is sync.
 */
export async function readCodexSessionIndexForLocationAsync(
  location: ProjectLocation,
): Promise<Array<{ id: string; updatedAt: number; threadName: string }>> {
  if (location.kind !== "wsl") {
    return readCodexSessionIndexForLocation(location);
  }
  const home = resolveWslHomeDirectory(location.distro);
  const privateHome = wslPrivateCodexHome(location.distro);
  const paths = [
    home ? `${home}/.codex/session_index.jsonl` : undefined,
    privateHome ? `${privateHome}/session_index.jsonl` : undefined,
  ].filter((p): p is string => Boolean(p));
  const reads = await Promise.all(paths.map((p) => readSessionFileText(location, p)));
  const parts = reads.filter((r): r is string => typeof r === "string" && r.length > 0);
  if (parts.length === 0) return [];
  const merged = parts.flatMap((raw) => parseCodexSessionIndex(raw));
  return dedupeSessionIndex(merged);
}

export function isInteractiveCodexRollout(
  rollout: CodexRolloutMeta,
  location: ProjectLocation,
): boolean {
  if (rollout.originator !== "codex-tui" || rollout.source !== "cli") {
    return false;
  }

  if (!rollout.cwd) {
    return true;
  }

  switch (location.kind) {
    case "windows":
      return rollout.cwd === location.path;
    case "posix":
      return rollout.cwd === location.path;
    case "wsl":
      return rollout.cwd === location.linuxPath || rollout.cwd === location.uncPath;
  }
}

export function readCodexRolloutsForLocation(location: ProjectLocation): CodexRolloutMeta[] {
  if (location.kind === "wsl") {
    // Use the user's actual login shell (bash / zsh / fish / …) so `~`
    // expands against their passwd entry, not an assumed `bash` install.
    const shellPath = resolveWslShellPath(location.distro);
    const privateHome = wslPrivateCodexHome(location.distro);
    const roots = [
      "~/.codex/sessions",
      ...(privateHome ? [quotePosixShellArg(`${privateHome}/sessions`)] : []),
    ].join(" ");
    const result = readWslCommandOutput(location.distro, shellPath, [
      "-l",
      "-c",
      `find ${roots} -type f -name 'rollout-*.jsonl' -printf '%T@\\t%p\\n' 2>/dev/null`,
    ]);
    if (!result.ok || result.stdout.length === 0) {
      console.log(
        "[codex] WSL rollout scan returned no output for %s: %s",
        describeCodexLocation(location),
        result.stderr || "(no stderr)",
      );
      return [];
    }
    return dedupeRollouts(
      result.stdout
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          const [mtimeRaw, path] = line.split("\t");
          if (!path) return [];
          const updatedAt = Number.isFinite(Number(mtimeRaw))
            ? Math.round(Number(mtimeRaw) * 1000)
            : undefined;
          const id = parseCodexRolloutIdFromPath(path);
          if (!id) return [];
          const parsed: CodexRolloutMeta = {
            id,
            path,
            ...(updatedAt !== undefined ? { updatedAt } : {}),
          };
          return parsed ? [parsed] : [];
        }),
    );
  }

  const rollouts: CodexRolloutMeta[] = [];
  const walk = (dir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      let stat: import("node:fs").Stats;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      const id = parseCodexRolloutIdFromPath(fullPath);
      if (!id) {
        continue;
      }
      let firstLine = "";
      try {
        firstLine = readFileSync(fullPath, "utf8").split(/\r?\n/g)[0] ?? "";
      } catch {
        // Ignore unreadable rollout files.
      }
      const parsed = parseCodexRolloutMeta(fullPath, firstLine, stat.mtimeMs);
      if (parsed && isInteractiveCodexRollout(parsed, location)) {
        rollouts.push(parsed);
      }
    }
  };
  for (const home of nativeCodexHomeCandidates()) {
    walk(join(home, "sessions"));
  }
  return dedupeRollouts(rollouts);
}

export function readCodexRolloutMetaForLocation(
  location: ProjectLocation,
  rollout: CodexRolloutMeta,
): CodexRolloutMeta | undefined {
  if (location.kind === "wsl") {
    const result = readWslCommandOutput(location.distro, "head", ["-n", "1", "--", rollout.path]);
    if (!result.ok || result.stdout.length === 0) {
      console.log(
        "[codex] WSL rollout meta read failed for %s: path=%s stderr=%s",
        describeCodexLocation(location),
        rollout.path,
        result.stderr || "(no stderr)",
      );
      return rollout;
    }
    return parseCodexRolloutMeta(rollout.path, result.stdout, rollout.updatedAt) ?? rollout;
  }

  try {
    const firstLine = readFileSync(rollout.path, "utf8").split(/\r?\n/g)[0] ?? "";
    return parseCodexRolloutMeta(rollout.path, firstLine, rollout.updatedAt) ?? rollout;
  } catch {
    return rollout;
  }
}

export async function readCodexRolloutMetaForLocationAsync(
  location: ProjectLocation,
  rollout: CodexRolloutMeta,
): Promise<CodexRolloutMeta | undefined> {
  if (location.kind !== "wsl") {
    return readCodexRolloutMetaForLocation(location, rollout);
  }
  const text = await readSessionFileText(location, rollout.path);
  if (!text) return rollout;
  const firstLine = text.split(/\r?\n/g)[0] ?? "";
  return parseCodexRolloutMeta(rollout.path, firstLine, rollout.updatedAt) ?? rollout;
}

export async function readCodexRolloutsForLocationAsync(
  location: ProjectLocation,
): Promise<CodexRolloutMeta[]> {
  if (location.kind !== "wsl") {
    return readCodexRolloutsForLocation(location);
  }
  const home = resolveWslHomeDirectory(location.distro);
  const privateHome = wslPrivateCodexHome(location.distro);
  const roots = [
    home ? `${home}/.codex/sessions` : undefined,
    privateHome ? `${privateHome}/sessions` : undefined,
  ].filter((r): r is string => Boolean(r));

  const accept = (name: string): boolean => name.startsWith("rollout-") && name.endsWith(".jsonl");
  const found = (
    await Promise.all(
      roots.map((root) =>
        findSessionFiles(location, { root, acceptFile: accept, includeMtime: true }),
      ),
    )
  ).flat();

  return dedupeRollouts(
    found.flatMap((f) => {
      const id = parseCodexRolloutIdFromPath(f.path);
      if (!id) return [];
      const meta: CodexRolloutMeta = {
        id,
        path: f.path,
        ...(typeof f.mtimeMs === "number" ? { updatedAt: Math.round(f.mtimeMs) } : {}),
      };
      return [meta];
    }),
  );
}

/**
 * Returns absolute paths to watch for new/changed Codex rollouts. Native
 * paths for windows/posix; Linux paths inside the distro for WSL (consumed
 * by the in-distro bridge watch subscription, NOT UNC `\\wsl.localhost\…`).
 */
export function resolveCodexSessionWatchPaths(location: ProjectLocation): string[] {
  if (location.kind === "wsl") {
    const home = resolveWslHomeDirectory(location.distro);
    const privateHome = wslPrivateCodexHome(location.distro);
    return [
      home ? `${home}/.codex/sessions` : undefined,
      privateHome ? `${privateHome}/sessions` : undefined,
    ].filter((p): p is string => Boolean(p));
  }
  const paths: string[] = [];
  const publicSessions = join(homedir(), ".codex", "sessions");
  if (existsSync(publicSessions)) paths.push(publicSessions);
  const privateSessions = join(nativePrivateCodexHome(), "sessions");
  if (existsSync(privateSessions)) paths.push(privateSessions);
  return paths;
}
