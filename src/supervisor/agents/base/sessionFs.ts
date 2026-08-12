import { existsSync, readdirSync, statSync, watch as fsWatch } from "node:fs";
import { open, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import type { WslBridgeClient, WslLocation } from "../../wsl/bridge/client";

/**
 * Shared filesystem helpers for agent session discovery. Routes WSL reads
 * and watches through the long-lived in-distro `WslBridgeServer` (HTTP
 * loopback, ~5ms/call) instead of spawning `wsl.exe` per call (~50–100ms).
 *
 * Falls back to native `node:fs` for `posix` / `windows` locations so
 * adapters branch on platform once at the helper boundary, not at every
 * call site.
 *
 * Session files (e.g. `~/.codex/sessions/...`, `~/.grok/sessions/...`)
 * live in `$HOME`, not the project root. The bridge endpoint enforces
 * `path inside projectRoot`, so we synthesize a `WslLocation` whose
 * `linuxPath` is the distro `$HOME` for these calls. The safety check
 * still holds — reads cannot escape `$HOME`.
 */

let bridgeClient: WslBridgeClient | undefined;

export function setSessionFsBridgeClient(client: WslBridgeClient | undefined): void {
  bridgeClient = client;
}

// `$HOME` is stable for a distro over the process lifetime, but
// `bridgeLocationForHome` is called on every session-discovery read/watch.
// Cache it per distro so we don't pay a bridge round-trip just to resolve it.
const homeCache = new Map<string, string>();

async function bridgeLocationForHome(
  client: WslBridgeClient,
  distro: string,
): Promise<WslLocation | undefined> {
  let home = homeCache.get(distro);
  if (!home) {
    const rootLocation: WslLocation = {
      kind: "wsl",
      distro,
      linuxPath: "/",
      uncPath: `\\\\wsl.localhost\\${distro}\\`,
    };
    home = (await client.home(rootLocation)).home;
    if (home) homeCache.set(distro, home);
  }
  if (!home) return undefined;
  return { kind: "wsl", distro, linuxPath: home, uncPath: toWslUncPath(distro, home) };
}

export interface SessionDirEntry {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
}

export async function listSessionDir(
  location: ProjectLocation,
  absolutePath: string,
): Promise<SessionDirEntry[] | undefined> {
  if (location.kind !== "wsl") {
    try {
      return readdirSync(absolutePath, { withFileTypes: true }).map((d) => ({
        name: d.name,
        type: d.isFile()
          ? "file"
          : d.isDirectory()
            ? "directory"
            : d.isSymbolicLink()
              ? "symlink"
              : "other",
      }));
    } catch {
      return undefined;
    }
  }
  const client = bridgeClient;
  if (!client) return undefined;
  const synLoc = await bridgeLocationForHome(client, location.distro).catch((error) => {
    console.warn("[session-fs] WSL bridge location resolution failed:", error);
    return undefined;
  });
  if (!synLoc) return undefined;
  try {
    const result = await client.readdir(synLoc, absolutePath);
    return result.entries.map((e) => ({ name: e.name, type: e.type }));
  } catch {
    return undefined;
  }
}

export interface SessionStat {
  exists: boolean;
  mtimeMs?: number;
  isDirectory?: boolean;
  isFile?: boolean;
}

export async function statSessionPaths(
  location: ProjectLocation,
  paths: string[],
): Promise<Map<string, SessionStat>> {
  if (paths.length === 0) return new Map();
  if (location.kind !== "wsl") {
    const map = new Map<string, SessionStat>();
    for (const p of paths) {
      try {
        const st = statSync(p);
        map.set(p, {
          exists: true,
          mtimeMs: st.mtimeMs,
          isDirectory: st.isDirectory(),
          isFile: st.isFile(),
        });
      } catch {
        map.set(p, { exists: false });
      }
    }
    return map;
  }
  const client = bridgeClient;
  const synLoc = client
    ? await bridgeLocationForHome(client, location.distro).catch((error) => {
        console.warn("[session-fs] WSL bridge location resolution failed (stat):", error);
        return undefined;
      })
    : undefined;
  if (!client || !synLoc) {
    return new Map(paths.map((p) => [p, { exists: false }]));
  }
  try {
    const result = await client.stat(synLoc, paths);
    const map = new Map<string, SessionStat>();
    for (const s of result.stats) {
      map.set(
        s.path,
        s.exists
          ? {
              exists: true,
              ...(typeof s.mtimeMs === "number" ? { mtimeMs: s.mtimeMs } : {}),
              ...(typeof s.isDirectory === "boolean" ? { isDirectory: s.isDirectory } : {}),
              ...(typeof s.isFile === "boolean" ? { isFile: s.isFile } : {}),
            }
          : { exists: false },
      );
    }
    return map;
  } catch {
    return new Map(paths.map((p) => [p, { exists: false }]));
  }
}

export async function readSessionFileText(
  location: ProjectLocation,
  absolutePath: string,
  maxBytes = 0,
): Promise<string | undefined> {
  if (location.kind !== "wsl") {
    try {
      const raw = await readFile(absolutePath);
      if (maxBytes > 0 && raw.length > maxBytes) return undefined;
      return raw.toString("utf8");
    } catch {
      return undefined;
    }
  }
  const client = bridgeClient;
  const synLoc = client
    ? await bridgeLocationForHome(client, location.distro).catch((error) => {
        console.warn("[session-fs] WSL bridge location resolution failed (readFile):", error);
        return undefined;
      })
    : undefined;
  if (!client || !synLoc) return undefined;
  try {
    const result = await client.readFile(synLoc, absolutePath, { maxBytes });
    if ("tooLarge" in result && result.tooLarge) return undefined;
    return Buffer.from(result.contentBase64, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

export async function readSessionFilePrefixText(
  location: ProjectLocation,
  absolutePath: string,
  maxBytes: number,
): Promise<string | undefined> {
  if (location.kind === "wsl") {
    return readSessionFileText(location, absolutePath);
  }
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(absolutePath, "r");
    const buffer = Buffer.allocUnsafe(maxBytes);
    const { bytesRead } = await file.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch {
    return undefined;
  } finally {
    await file?.close().catch(() => undefined);
  }
}

export interface FindSessionFilesOptions {
  /** Absolute root directory to walk. */
  root: string;
  /** Filter on basename. Default accepts every file. */
  acceptFile?: (name: string) => boolean;
  /** Directory basenames to skip. */
  ignore?: string[];
  /** Hard cap on returned entries. Default 10 000. */
  maxEntries?: number;
  /** Populate `mtimeMs` on each returned entry. Costs one extra batched stat. */
  includeMtime?: boolean;
}

export interface FoundSessionFile {
  path: string;
  name: string;
  mtimeMs?: number;
}

export async function findSessionFiles(
  location: ProjectLocation,
  opts: FindSessionFilesOptions,
): Promise<FoundSessionFile[]> {
  const acceptFile = opts.acceptFile ?? (() => true);
  const maxEntries = opts.maxEntries ?? 10_000;
  const ignore = opts.ignore ?? [];

  if (location.kind !== "wsl") {
    const out: FoundSessionFile[] = [];
    const walk = async (dir: string): Promise<void> => {
      if (out.length >= maxEntries) return;
      let entries: import("node:fs").Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const d of entries) {
        if (ignore.includes(d.name)) continue;
        if (out.length >= maxEntries) return;
        const full = join(dir, d.name);
        if (d.isDirectory()) {
          await walk(full);
          continue;
        }
        if (d.isFile() && acceptFile(d.name)) {
          if (opts.includeMtime) {
            try {
              out.push({ path: full, name: d.name, mtimeMs: (await stat(full)).mtimeMs });
            } catch {
              out.push({ path: full, name: d.name });
            }
          } else {
            out.push({ path: full, name: d.name });
          }
        }
      }
    };
    await walk(opts.root);
    return out;
  }

  const client = bridgeClient;
  const synLoc = client
    ? await bridgeLocationForHome(client, location.distro).catch((error) => {
        console.warn("[session-fs] WSL bridge location resolution failed (find):", error);
        return undefined;
      })
    : undefined;
  if (!client || !synLoc) return [];
  try {
    const result = await client.find(synLoc, {
      root: opts.root,
      maxEntries,
      ignore,
    });
    const matches = result.entries
      .filter((e) => e.type === "file" && acceptFile(e.name))
      .map((e) => ({
        path: e.path.startsWith("/") ? e.path : `${opts.root.replace(/\/+$/, "")}/${e.path}`,
        name: e.name,
      }));
    if (!opts.includeMtime || matches.length === 0) return matches;
    const stats = await client.stat(
      synLoc,
      matches.map((m) => m.path),
    );
    const byPath = new Map(stats.stats.map((s) => [s.path, s] as const));
    return matches.map((m) => {
      const s = byPath.get(m.path);
      return typeof s?.mtimeMs === "number" ? { ...m, mtimeMs: s.mtimeMs } : m;
    });
  } catch {
    return [];
  }
}

/**
 * Watch a set of absolute paths for changes. Returns a sync teardown that is
 * safe to call before the underlying async subscribe resolves.
 */
export function watchSessionPaths(
  location: ProjectLocation,
  paths: string[],
  onChanged: () => void,
  label: string,
): () => void {
  if (paths.length === 0) return () => undefined;
  if (location.kind !== "wsl") {
    const watchers: Array<() => void> = [];
    let changed = false;
    let throttleTimer: ReturnType<typeof setTimeout> | undefined;
    const notifyChanged = (): void => {
      changed = true;
      if (throttleTimer) return;
      onChanged();
      changed = false;
      throttleTimer = setTimeout(() => {
        throttleTimer = undefined;
        if (changed) notifyChanged();
      }, 2_000);
      throttleTimer.unref?.();
    };
    for (const p of paths) {
      if (!existsSync(p)) continue;
      try {
        const w = fsWatch(p, { recursive: true }, notifyChanged);
        w.on("error", () => {
          try {
            w.close();
          } catch {
            /* ignore */
          }
        });
        watchers.push(() => {
          try {
            w.close();
          } catch {
            /* ignore */
          }
        });
      } catch (error) {
        console.log(
          "[%s] session watcher unavailable for %s: %s",
          label,
          p,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (watchers.length > 0) {
      console.log("[%s] session watcher active (%d native path(s))", label, watchers.length);
    }
    return () => {
      if (throttleTimer) clearTimeout(throttleTimer);
      for (const close of watchers) close();
    };
  }

  const client = bridgeClient;
  if (!client) return () => undefined;

  let disposed = false;
  let unsubscribe: (() => Promise<void>) | undefined;
  // The bridge's watchSubscribe rolls back ALL paths if ANY fails to start,
  // so pre-filter to paths that exist on disk. The home root itself is the
  // safest broad watch when no specific subpath is present yet.
  (async () => {
    const synLoc = await bridgeLocationForHome(client, location.distro).catch((error) => {
      console.warn("[session-fs] WSL bridge location resolution failed (watch):", error);
      return undefined;
    });
    if (!synLoc || disposed) return;
    const stats = await client.stat(synLoc, paths);
    const existing = stats.stats.filter((s) => s.exists).map((s) => s.path);
    if (existing.length === 0 || disposed) return;
    try {
      const sub = await client.watch(
        synLoc,
        { paths: existing.map((p) => ({ path: p, scope: "unknown" as const })) },
        () => {
          if (!disposed) onChanged();
        },
      );
      if (disposed) {
        void sub.unsubscribe();
        return;
      }
      unsubscribe = sub.unsubscribe;
      console.log("[%s] session watcher active (%d bridge path(s))", label, existing.length);
    } catch (err) {
      console.log(
        "[%s] bridge session watcher failed: %s",
        label,
        err instanceof Error ? err.message : String(err),
      );
    }
  })().catch((err) => {
    console.log(
      "[%s] bridge session watcher setup failed: %s",
      label,
      err instanceof Error ? err.message : String(err),
    );
  });

  return () => {
    disposed = true;
    if (unsubscribe) void unsubscribe();
  };
}
