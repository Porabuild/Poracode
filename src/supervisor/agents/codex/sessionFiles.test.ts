import { describe, expect, it } from "vitest";
import {
  parseCodexRolloutIdFromPath,
  parseCodexRolloutMeta,
  parseCodexSessionIndex,
} from "./sessionFiles";

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
      '{"timestamp":"2026-04-06T02:22:34.368Z","type":"session_meta","payload":{"id":"019d6099-45a3-7962-a595-2d7f59276118","cwd":"C:\\\\Users\\\\sdsle\\\\work\\\\lightcode","originator":"codex-tui","source":"cli"}}',
      123,
    );

    expect(result).toEqual({
      id: "019d6099-45a3-7962-a595-2d7f59276118",
      path: "C:\\Users\\sdsle\\.codex\\sessions\\2026\\04\\05\\rollout-2026-04-05T19-22-30-019d6099-45a3-7962-a595-2d7f59276118.jsonl",
      updatedAt: 123,
      cwd: "C:\\Users\\sdsle\\work\\lightcode",
      originator: "codex-tui",
      source: "cli",
    });
  });
});
