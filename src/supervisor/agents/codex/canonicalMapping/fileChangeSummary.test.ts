import { describe, expect, it } from "vitest";
import { createCodexMapperState, mapCodexNotification } from "../canonicalMapping";
import { readCodexChangesDiffSummary } from "./toolExtraction";

// The genuine R40 native add used these exact bytes in changes[].diff.
const createdContent = "GENUINE_CREATED\nline two\nline three\n";
const ownedPath = "/owned/fixture/notes/created.txt";

function createdChange(diff: string) {
  return { path: ownedPath, kind: { type: "add" }, diff };
}

describe("Codex app-server created file summaries", () => {
  it("normalizes the genuine add through started and completed without altering source bytes", () => {
    const state = createCodexMapperState("owned-thread");
    const change = Object.freeze({
      ...createdChange(createdContent),
      kind: Object.freeze({ type: "add" }),
    });
    const changes = Object.freeze([change]);
    const started = mapCodexNotification(
      "item/started",
      {
        threadId: "provider-thread",
        item: { id: "native-create", type: "fileChange", changes, status: "inProgress" },
      },
      state,
    );
    expect(started).toHaveLength(1);
    const startedItem = started.find((event) => event.type === "item.started")!;
    expect(started[0]).toMatchObject({
      type: "item.started",
      itemType: "file_change",
      payload: {
        path: ownedPath,
        changeKind: "create",
        diffSummary: { added: 3, removed: 0 },
        status: "running",
        args: { changes: [createdChange(createdContent)] },
      },
    });
    const completed = mapCodexNotification(
      "item/completed",
      {
        threadId: "provider-thread",
        item: { id: "native-create", type: "fileChange", changes, status: "completed" },
      },
      state,
    );
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      type: "item.completed",
      itemId: startedItem.itemId,
      payload: {
        path: ownedPath,
        changeKind: "create",
        diffSummary: { added: 3, removed: 0 },
        status: "success",
        result: { changes: [createdChange(createdContent)] },
      },
    });
    expect(changes).toEqual([createdChange(createdContent)]);
  });

  it("normalizes a completion-first add backfill with the same three-line total", () => {
    const events = mapCodexNotification(
      "item/completed",
      {
        threadId: "provider-thread",
        item: {
          id: "completion-first-create",
          type: "fileChange",
          changes: [createdChange(createdContent)],
          status: "completed",
        },
      },
      createCodexMapperState("owned-thread"),
    );
    expect(events).toHaveLength(2);
    const startedItem = events.find((event) => event.type === "item.started")!;
    expect(events[0]).toMatchObject({
      type: "item.started",
      payload: { changeKind: "create", diffSummary: { added: 3, removed: 0 } },
    });
    expect(events[1]).toMatchObject({
      type: "item.completed",
      itemId: startedItem.itemId,
      payload: { changeKind: "create", diffSummary: { added: 3, removed: 0 } },
    });
  });

  it.each([
    ["terminal LF", createdContent, 3],
    ["no terminal LF", "one\ntwo\nthree", 3],
    ["CRLF", "one\r\ntwo\r\n", 2],
    ["blank file line", "\n", 1],
    ["blank last line", "one\n\n", 2],
    ["whitespace", " \n\t\n", 2],
    [
      "literal patch prefixes",
      "+literal\n-literal\n+++ source\n--- source\n@@ literal\ndiff --git literal\n",
      6,
    ],
    ["Unicode units", "😀\n\ud800\n\udc00\n", 3],
    ["non-LF separators", "one\rtwo\u2028three\u2029four", 1],
  ] as const)("counts raw %s as additions without patch parsing", (_label, diff, added) => {
    expect(readCodexChangesDiffSummary([createdChange(diff)])).toEqual({ added, removed: 0 });
  });

  it("adds the new-file total to a normal update without duplicating trailing newlines", () => {
    expect(
      readCodexChangesDiffSummary([
        createdChange(createdContent),
        {
          path: "/owned/fixture/value.mjs",
          kind: { type: "update", move_path: null },
          diff: "@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n",
        },
      ]),
    ).toEqual({ added: 4, removed: 1 });
  });

  it("preserves update headers, context, deletion and no-newline marker handling", () => {
    expect(
      readCodexChangesDiffSummary([
        {
          kind: { type: "update", move_path: "/owned/moved.txt" },
          diff: "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n context\n-old\n+new\n\\ No newline at end of file\n",
        },
        { kind: { type: "delete" }, diff: "--- a/old\n+++ /dev/null\n-removed\n" },
      ]),
    ).toEqual({ added: 1, removed: 2 });
  });

  it("keeps empty and malformed changes absent, and untagged legacy patches on the existing path", () => {
    for (const changes of [undefined, null, {}, [], [createdChange("")], [null, {}, { diff: 1 }]]) {
      expect(readCodexChangesDiffSummary(changes)).toBeUndefined();
    }
    expect(readCodexChangesDiffSummary([{ diff: "@@ -1 +1 @@\n-before\n+after\n" }])).toEqual({
      added: 1,
      removed: 1,
    });
  });
});
