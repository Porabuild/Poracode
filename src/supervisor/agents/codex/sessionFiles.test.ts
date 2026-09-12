import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCodexRolloutMetaForLocation, readCodexRolloutMetaForLocationAsync } from "./session";
import {
  parseCodexRolloutIdFromPath,
  parseCodexRolloutMeta,
  parseCodexSessionIndex,
} from "./sessionFiles";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("parseCodexRolloutIdFromPath", () => {
  it("extracts the session id from a rollout filename", () => {
    expect(
      parseCodexRolloutIdFromPath(
        "C:\\Users\\sdsle\\.codex\\sessions\\2026\\04\\05\\rollout-2026-04-05T16-56-28-019d6013-90cc-7c60-91d2-f435c03dfd76.jsonl",
      ),
    ).toBe("019d6013-90cc-7c60-91d2-f435c03dfd76");
  });

  it("returns undefined for non-rollout filenames", () => {
    expect(parseCodexRolloutIdFromPath("session_index.jsonl")).toBeUndefined();
  });
});

describe("parseCodexSessionIndex", () => {
  it("parses codex session index entries", () => {
    const result = parseCodexSessionIndex(`
{"id":"019d6013-90cc-7c60-91d2-f435c03dfd76","thread_name":"Greeting","updated_at":"2026-04-05T23:56:28.000Z"}
`);

    expect(result).toEqual([
      {
        id: "019d6013-90cc-7c60-91d2-f435c03dfd76",
        threadName: "Greeting",
        updatedAt: Date.parse("2026-04-05T23:56:28.000Z"),
      },
    ]);
  });
});

describe("parseCodexRolloutMeta", () => {
  it("parses originator and source from a rollout session_meta line", () => {
    const result = parseCodexRolloutMeta(
      "C:\\Users\\sdsle\\.codex\\sessions\\2026\\04\\05\\rollout-2026-04-05T19-22-30-019d6099-45a3-7962-a595-2d7f59276118.jsonl",
      '{"timestamp":"2026-04-06T02:22:34.368Z","type":"session_meta","payload":{"id":"019d6099-45a3-7962-a595-2d7f59276118","cwd":"C:\\\\Users\\\\sdsle\\\\work\\\\poracode","originator":"codex-tui","source":"cli"}}',
      123,
    );

    expect(result).toEqual({
      id: "019d6099-45a3-7962-a595-2d7f59276118",
      path: "C:\\Users\\sdsle\\.codex\\sessions\\2026\\04\\05\\rollout-2026-04-05T19-22-30-019d6099-45a3-7962-a595-2d7f59276118.jsonl",
      updatedAt: 123,
      cwd: "C:\\Users\\sdsle\\work\\poracode",
      originator: "codex-tui",
      source: "cli",
    });
  });

  it("reads a large session metadata line without loading the complete rollout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-codex-rollout-"));
    tempDirs.push(dir);
    const path = join(
      dir,
      "rollout-2026-04-05T19-22-30-019d6099-45a3-7962-a595-2d7f59276118.jsonl",
    );
    const sessionMeta = JSON.stringify({
      type: "session_meta",
      payload: {
        id: "019d6099-45a3-7962-a595-2d7f59276118",
        cwd: "C:\\work\\poracode",
        originator: "codex-tui",
        source: "cli",
        base_instructions: "x".repeat(32 * 1024),
      },
    });
    writeFileSync(path, `${sessionMeta}\n${"x".repeat(1024 * 1024)}`);

    expect(sessionMeta.length).toBeGreaterThan(16 * 1024);

    expect(
      readCodexRolloutMetaForLocation(
        { kind: "windows", path: "C:\\work\\poracode" },
        { id: "019d6099-45a3-7962-a595-2d7f59276118", path },
      ),
    ).toMatchObject({
      id: "019d6099-45a3-7962-a595-2d7f59276118",
      cwd: "C:\\work\\poracode",
      originator: "codex-tui",
      source: "cli",
    });

    await expect(
      readCodexRolloutMetaForLocationAsync(
        { kind: "windows", path: "C:\\work\\poracode" },
        { id: "019d6099-45a3-7962-a595-2d7f59276118", path },
      ),
    ).resolves.toMatchObject({
      id: "019d6099-45a3-7962-a595-2d7f59276118",
      cwd: "C:\\work\\poracode",
      originator: "codex-tui",
      source: "cli",
    });
  });
});
