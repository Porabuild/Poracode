import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { aggregateClaudeCost, type CostEstimate } from "@lightcode/agents-usage";

/**
 * Supervisor-side estimated-cost scanner. Reads Claude Code session JSONL from
 * ~/.claude/projects, filtered to the last 30 days, and hands the contents to
 * the package's pure aggregator. Only runs when the user enables estimated cost.
 *
 * Bounded + cached: files older than 30d (by mtime) are skipped, total bytes
 * are capped, and the result is memoized on a (path, mtime, size) signature so
 * an unchanged log tree is not re-read on every refresh. Native host only —
 * WSL-side logs are out of scope (matches the WSL "simple fallback" decision).
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;

interface FileRef {
  path: string;
  mtimeMs: number;
  size: number;
}

function claudeProjectsDirs(): string[] {
  const dirs: string[] = [];
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (configDir) dirs.push(join(configDir, "projects"));
  dirs.push(join(homedir(), ".claude", "projects"));
  dirs.push(join(homedir(), ".config", "claude", "projects"));
  return dirs;
}

async function safeReaddir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function collectRecentClaudeLogs(sinceMs: number): Promise<FileRef[]> {
  const files: FileRef[] = [];
  for (const dir of claudeProjectsDirs()) {
    for (const project of await safeReaddir(dir)) {
      if (!project.isDirectory()) continue;
      const projectDir = join(dir, project.name);
      for (const entry of await safeReaddir(projectDir)) {
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
        const path = join(projectDir, entry.name);
        try {
          const st = await stat(path);
          if (st.mtimeMs < sinceMs) continue;
          files.push({ path, mtimeMs: st.mtimeMs, size: st.size });
        } catch {
          // unreadable file — skip
        }
      }
    }
  }
  return files;
}

export interface ClaudeCostScan {
  estimate: CostEstimate | undefined;
  /** True if the byte cap was hit and some recent logs were skipped. */
  truncated: boolean;
}

let cache: { signature: string; result: ClaudeCostScan } | undefined;

function signatureOf(files: readonly FileRef[]): string {
  return files
    .map((f) => `${f.path}:${f.mtimeMs}:${f.size}`)
    .sort()
    .join("|");
}

/**
 * Estimate Claude 30-day cost + tokens from local logs. Memoized on the log
 * tree's signature, so repeated calls with unchanged logs are free.
 */
export async function scanClaudeCost(nowMs: number): Promise<ClaudeCostScan> {
  const sinceMs = nowMs - THIRTY_DAYS_MS;
  const files = await collectRecentClaudeLogs(sinceMs);
  const signature = signatureOf(files);
  if (cache && cache.signature === signature) return cache.result;

  // Newest first so a byte cap keeps the most relevant data.
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const contents: string[] = [];
  let bytes = 0;
  let truncated = false;
  for (const file of files) {
    if (bytes + file.size > MAX_TOTAL_BYTES) {
      truncated = true;
      continue;
    }
    try {
      contents.push(await readFile(file.path, "utf8"));
      bytes += file.size;
    } catch {
      // unreadable file — skip
    }
  }
  if (truncated) {
    console.log(
      `[usage] Claude cost scan capped at ${MAX_TOTAL_BYTES / (1024 * 1024)}MB; some 30d logs skipped.`,
    );
  }

  const estimate = aggregateClaudeCost(contents, { sinceMs, nowMs });
  const result: ClaudeCostScan = { estimate, truncated };
  cache = { signature, result };
  return result;
}
