import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SCAN_LIMITS, SessionImportScanner } from "../../sessionImport/scanner";
import { createCodexSessionImport } from "./sessionImport";

const PARENT_ID = "019a0bc7-6665-7473-bad7-4d7866c20dea";
const FORK_ID = "019a0bc7-7777-7473-bad7-4d7866c20dea";
const LEGACY_ID = "5973b6c0-94b8-487b-a530-2aeb6098ae0e";

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function codexHome(): string {
  const home = mkdtempSync(join(tmpdir(), "poracode-codex-import-"));
  homes.push(home);
  return home;
}

function writeRollout(home: string, stamp: string, id: string, lines: unknown[]): string {
  const dir = join(home, "sessions", "2026", "09", "29");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `rollout-${stamp}-${id}.jsonl`);
  writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return path;
}

function meta(payload: Record<string, unknown>) {
  return { type: "session_meta", payload: { cwd: "/repo", ...payload } };
}

function message(role: string, text: string) {
  const type = role === "user" ? "input_text" : "output_text";
  return { type: "response_item", payload: { type: "message", role, content: [{ type, text }] } };
}

function scanner(home: string, limits = DEFAULT_SCAN_LIMITS) {
  const source = createCodexSessionImport(home);
  return { source, scan: new SessionImportScanner(() => [{ agentKind: "codex", source }], limits) };
}

describe("Codex session import", () => {
  it("keeps a fork distinct from its root and resumes each by its thread id", async () => {
    const home = codexHome();
    writeRollout(home, "2026-09-29T01-00-00", PARENT_ID, [
      meta({ id: PARENT_ID, session_id: PARENT_ID }),
      message("user", "parent prompt"),
    ]);
    const forkPath = writeRollout(home, "2026-09-29T02-00-00", FORK_ID, [
      meta({ id: FORK_ID, session_id: PARENT_ID, forked_from_id: PARENT_ID }),
      message("user", "parent prompt"),
      message("assistant", "parent answer"),
      message("user", "fork prompt"),
    ]);
    const { source, scan } = scanner(home);

    const { sessions } = await scan.list({});

    expect(sessions.map((session) => session.providerSessionId).toSorted()).toEqual(
      [PARENT_ID, FORK_ID].toSorted(),
    );
    const transcript = await source.readTranscript(forkPath);
    expect(transcript.providerSessionId).toBe(FORK_ID);
    expect(transcript.messages.map((entry) => entry.text)).toEqual([
      "parent prompt",
      "parent answer",
      "fork prompt",
    ]);
  });

  it("reads id-only legacy metadata without a timestamp-prefixed id", async () => {
    const home = codexHome();
    const path = writeRollout(home, "2025-09-29T01-00-00", LEGACY_ID, [
      meta({ id: LEGACY_ID, timestamp: "2025-09-29T01:00:00.000Z" }),
      message("user", "legacy prompt"),
    ]);
    const { source, scan } = scanner(home);

    const [session] = (await scan.list({})).sessions;

    expect(session).toMatchObject({
      providerSessionId: LEGACY_ID,
      startedAt: "2025-09-29T01:00:00.000Z",
      preview: "legacy prompt",
    });
    expect((await source.readTranscript(path)).providerSessionId).toBe(LEGACY_ID);
  });

  it("falls back to the filename id when the header exceeds the read budget", async () => {
    const home = codexHome();
    writeRollout(home, "2026-09-29T03-00-00", FORK_ID, [
      meta({ id: FORK_ID, session_id: PARENT_ID, base_instructions: "x".repeat(4096) }),
      message("user", "after a huge header"),
    ]);
    const { scan } = scanner(home, { ...DEFAULT_SCAN_LIMITS, headBytes: 1024 });

    expect((await scan.list({})).sessions.map((session) => session.providerSessionId)).toEqual([
      FORK_ID,
    ]);
  });

  it("skips sub-agent and exec rollouts and strips injected context", async () => {
    const home = codexHome();
    writeRollout(home, "2026-09-29T04-00-00", "019a0bc7-0000-0000-0000-000000000001", [
      meta({ id: "019a0bc7-0000-0000-0000-000000000001", source: { subagent: "review" } }),
    ]);
    writeRollout(home, "2026-09-29T05-00-00", "019a0bc7-0000-0000-0000-000000000002", [
      meta({ id: "019a0bc7-0000-0000-0000-000000000002", source: "exec" }),
    ]);
    writeRollout(home, "2026-09-29T06-00-00", PARENT_ID, [
      meta({ id: PARENT_ID }),
      message("user", "<environment_context>cwd</environment_context>\nreal question"),
    ]);
    writeFileSync(
      join(home, "session_index.jsonl"),
      `${JSON.stringify({ id: PARENT_ID, thread_name: "Named thread", updated_at: "2026-09-29T06:00:00Z" })}\n`,
    );

    const { sessions } = await scanner(home).scan.list({});

    expect(sessions).toEqual([
      expect.objectContaining({
        providerSessionId: PARENT_ID,
        preview: "real question",
        title: "Named thread",
      }),
    ]);
  });
});
