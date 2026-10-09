import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export function parseCodexSessionIndex(content: string): Array<{
  id: string;
  updatedAt: number;
  threadName: string;
}> {
  return content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as {
          id?: string;
          updated_at?: string;
          thread_name?: string;
        };
        if (!parsed.id || !parsed.updated_at) {
          return [];
        }
        return [
          {
            id: parsed.id,
            updatedAt: Date.parse(parsed.updated_at),
            threadName: parsed.thread_name?.trim() ?? "",
          },
        ];
      } catch {
        return [];
      }
    });
}

export function readCodexSessionIndex(): Array<{
  id: string;
  updatedAt: number;
  threadName: string;
}> {
  const sessionIndexPath = join(homedir(), ".codex", "session_index.jsonl");
  if (!existsSync(sessionIndexPath)) {
    return [];
  }

  return parseCodexSessionIndex(readFileSync(sessionIndexPath, "utf8"));
}

export function parseCodexRolloutIdFromPath(path: string): string | undefined {
  // Codex rollouts on Windows arrive with `\` separators; node:path/basename on
  // posix doesn't treat `\` as a separator, so normalise first.
  const leaf = basename(path.replace(/\\/g, "/"));
  const match = /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/i.exec(leaf);
  return match?.[1];
}

export interface CodexRolloutMeta {
  id: string;
  path: string;
  updatedAt?: number;
  cwd?: string;
  originator?: string;
  source?: string;
  /** `session_meta.payload.timestamp`. */
  startedAt?: string;
  /** Spawned by another thread (`source: { subagent }` or `thread_source: "subagent"`). */
  subagent?: true;
}

export function parseCodexRolloutMeta(
  path: string,
  firstLine: string,
  updatedAt?: number,
): CodexRolloutMeta | undefined {
  const idFromPath = parseCodexRolloutIdFromPath(path);
  if (!idFromPath) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(firstLine) as {
      type?: string;
      payload?: {
        id?: string;
        cwd?: string;
        originator?: string;
        source?: unknown;
        thread_source?: string;
        timestamp?: string;
      };
    };
    if (parsed.type !== "session_meta" || !parsed.payload?.id) {
      return undefined;
    }
    const { source } = parsed.payload;
    const subagent =
      parsed.payload.thread_source === "subagent" ||
      (typeof source === "object" && source !== null && "subagent" in source);
    return {
      id: parsed.payload.id,
      path,
      ...(updatedAt !== undefined ? { updatedAt } : {}),
      ...(parsed.payload.cwd ? { cwd: parsed.payload.cwd } : {}),
      ...(parsed.payload.originator ? { originator: parsed.payload.originator } : {}),
      ...(typeof source === "string" && source ? { source } : {}),
      ...(parsed.payload.timestamp ? { startedAt: parsed.payload.timestamp } : {}),
      ...(subagent ? { subagent: true as const } : {}),
    };
  } catch {
    return {
      id: idFromPath,
      path,
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    };
  }
}

export function codexAuthPath(): string {
  return join(homedir(), ".codex", "auth.json");
}
