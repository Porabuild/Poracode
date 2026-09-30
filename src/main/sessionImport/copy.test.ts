import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copySessionIntoHome } from "./copy";
import type { ImportHome } from "./homes";

function home(provider: "codex" | "claude", agentKind: string): ImportHome {
  const dir = mkdtempSync(join(tmpdir(), `poracode-copy-${agentKind.replace(":", "-")}-`));
  return { provider, agentKind, dir };
}

function rolloutIn(base: ImportHome, ...segments: string[]): string {
  const path = join(base.dir, "sessions", ...segments);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, '{"type":"session_meta"}\n', "utf8");
  return path;
}

describe("copySessionIntoHome", () => {
  it("copies a Codex rollout to the same relative path under the profile home", () => {
    const base = home("codex", "codex");
    const work = home("codex", "codex:work");
    const path = rolloutIn(base, "2026", "09", "13", "rollout-a.jsonl");

    const copied = copySessionIntoHome({
      provider: "codex",
      path,
      homes: [base, work],
      targetAgentKind: "codex:work",
    });

    expect(copied).toBe(join(work.dir, "sessions", "2026", "09", "13", "rollout-a.jsonl"));
    expect(readFileSync(copied, "utf8")).toBe('{"type":"session_meta"}\n');
    expect(existsSync(path)).toBe(true);
  });

  it("keeps a Claude log under projects/<encoded cwd>", () => {
    const base = home("claude", "claude");
    const work = home("claude", "claude:work");
    const path = join(base.dir, "projects", "F--repo", "s1.jsonl");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "{}\n", "utf8");

    const copied = copySessionIntoHome({
      provider: "claude",
      path,
      homes: [base, work],
      targetAgentKind: "claude:work",
    });

    expect(copied).toBe(join(work.dir, "projects", "F--repo", "s1.jsonl"));
  });

  it("returns the original when it already lives in the target home", () => {
    const work = home("codex", "codex:work");
    const path = rolloutIn(work, "2026", "rollout-b.jsonl");

    expect(
      copySessionIntoHome({
        provider: "codex",
        path,
        homes: [work],
        targetAgentKind: "codex:work",
      }),
    ).toBe(path);
  });

  it("does not overwrite a copy the profile already has", () => {
    const base = home("codex", "codex");
    const work = home("codex", "codex:work");
    const path = rolloutIn(base, "2026", "rollout-c.jsonl");
    const existing = rolloutIn(work, "2026", "rollout-c.jsonl");
    writeFileSync(existing, "profile copy\n", "utf8");

    const copied = copySessionIntoHome({
      provider: "codex",
      path,
      homes: [base, work],
      targetAgentKind: "codex:work",
    });

    expect(copied).toBe(existing);
    expect(readFileSync(existing, "utf8")).toBe("profile copy\n");
  });

  it("re-copies when the source has moved on since the profile's copy", () => {
    const base = home("codex", "codex");
    const work = home("codex", "codex:work");
    const path = rolloutIn(base, "2026", "rollout-e.jsonl");
    const existing = rolloutIn(work, "2026", "rollout-e.jsonl");
    writeFileSync(existing, "stale copy\n", "utf8");
    // The conversation continued after that copy was made. Replaying the old
    // copy would resume a transcript missing its latest turns.
    const grown = '{"type":"session_meta"}\n{"type":"response_item"}\n';
    writeFileSync(path, grown, "utf8");
    const later = new Date(Date.now() + 60_000);
    utimesSync(path, later, later);

    const copied = copySessionIntoHome({
      provider: "codex",
      path,
      homes: [base, work],
      targetAgentKind: "codex:work",
    });

    expect(copied).toBe(existing);
    expect(readFileSync(existing, "utf8")).toBe(grown);
  });

  it("rejects an unknown target or a transcript outside every home", () => {
    const base = home("codex", "codex");
    const path = rolloutIn(base, "2026", "rollout-d.jsonl");

    expect(() =>
      copySessionIntoHome({
        provider: "codex",
        path,
        homes: [base],
        targetAgentKind: "codex:gone",
      }),
    ).toThrow(/codex:gone/u);
    expect(() =>
      copySessionIntoHome({
        provider: "codex",
        path: join(tmpdir(), "stray.jsonl"),
        homes: [base, home("codex", "codex:work")],
        targetAgentKind: "codex:work",
      }),
    ).toThrow(/known codex home/u);
  });
});
