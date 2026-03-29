import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function readCodexSessionIndex(): Array<{
  id: string;
  updatedAt: number;
  threadName: string;
}> {
  const sessionIndexPath = join(homedir(), ".codex", "session_index.jsonl");
  if (!existsSync(sessionIndexPath)) {
    return [];
  }

  const content = readFileSync(sessionIndexPath, "utf8");
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

export function codexAuthPath(): string {
  return join(homedir(), ".codex", "auth.json");
}
