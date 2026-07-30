import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import {
  readCodexRolloutsForLocation,
  readCodexSessionIndexForLocation,
  resolveCodexSessionWatchPaths,
} from "./session";

describe("Codex profile session discovery", () => {
  it("reads and watches only the selected CODEX_HOME", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "poracode-codex-session-profile-"));
    const sessionsDir = join(homeDir, "sessions", "2026", "07", "15");
    const projectPath = join(homeDir, "project");
    const location: ProjectLocation = { kind: "posix", path: projectPath };
    const id = "019f-profile-session";

    try {
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(
        join(homeDir, "session_index.jsonl"),
        `${JSON.stringify({ id, updated_at: "2026-07-15T01:02:03.000Z", thread_name: "Work" })}\n`,
      );
      writeFileSync(
        join(sessionsDir, `rollout-2026-07-15T01-02-03-${id}.jsonl`),
        `${JSON.stringify({
          type: "session_meta",
          payload: { id, cwd: projectPath, originator: "codex-tui", source: "cli" },
        })}\n`,
      );

      expect(readCodexSessionIndexForLocation(location, homeDir)).toEqual([
        { id, updatedAt: Date.parse("2026-07-15T01:02:03.000Z"), threadName: "Work" },
      ]);
      expect(readCodexRolloutsForLocation(location, homeDir).map((rollout) => rollout.id)).toEqual([
        id,
      ]);
      expect(resolveCodexSessionWatchPaths(location, homeDir)).toEqual([join(homeDir, "sessions")]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
