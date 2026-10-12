import { describe, expect, it, vi } from "vitest";
import type { SubagentRunManager } from "./SubagentRunManager";
import { FakeHandle, flush, makeHarness, PARENT } from "./testHarness";

function append(handle: FakeHandle, itemId: string, delta: string) {
  handle.emit({
    type: "content.delta",
    threadId: "child",
    itemId,
    stream: "assistant_text",
    delta,
  });
}

function replace(handle: FakeHandle, itemId: string, text: string) {
  handle.emit({
    type: "item.updated",
    threadId: "child",
    itemId,
    payload: { displayAuthoritative: true, content: [{ kind: "text", text }] },
  });
}

function envelope(summary: string) {
  return (
    "```crossagents-result\n" +
    JSON.stringify({
      version: 1,
      outcome: "completed",
      summary,
      changes: [],
      checks: [],
      findings: [],
      risks: [],
      evidence: [],
    }) +
    "\n```"
  );
}

// Inspect only the ephemeral scaffolding, including the pre-extraction shape
// used to reproduce the retention regression against the existing manager.
function segments(manager: SubagentRunManager, runId: string): unknown[] {
  const record = (
    manager as unknown as {
      runs: Map<string, { outputSegments?: unknown[]; transcript?: { segments: unknown[] } }>;
    }
  ).runs.get(runId)!;
  return record.transcript?.segments ?? record.outputSegments!;
}

describe("SubagentRunManager transcript bookkeeping", () => {
  it("releases terminal segments before disposal finishes while preserving final and cursor evidence", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    const handle = h.handles[0]!;
    const disposal = Promise.withResolvers<void>();
    handle.dispose = vi.fn<() => Promise<void>>(() => disposal.promise);
    const listener = handle.listener!;
    append(handle, "first", "draft");
    append(handle, "second", "visible");
    append(handle, "first", " more draft");
    replace(handle, "first", "final");
    expect(segments(h.manager, runId)).toHaveLength(2);
    handle.completeTurn("completed");
    try {
      expect(segments(h.manager, runId)).toHaveLength(0);
      const full = h.manager.getStatus(runId, PARENT, { fullOutput: true });
      const cursor = h.manager.getStatus(runId, PARENT, { afterOutputChars: 1 });
      expect(full.output).toBe("finalvisible");
      expect(cursor).toMatchObject({ output: "finalvisible", total_output_chars: 23 });
      listener.onRuntimeEvent?.({
        type: "content.delta",
        threadId: "child",
        itemId: "late",
        stream: "assistant_text",
        delta: "must be ignored",
      });
      expect(segments(h.manager, runId)).toHaveLength(0);
      expect(h.manager.getStatus(runId, PARENT, { fullOutput: true })).toEqual(full);
      expect(h.manager.getStatus(runId, PARENT, { afterOutputChars: 1 })).toEqual(cursor);
    } finally {
      disposal.resolve();
      await h.manager.waitForSettlement(PARENT, runId);
    }
  });

  it.each(["failed", "cancelled"] as const)(
    "releases segment scaffolding on %s without discarding caller output",
    async (state) => {
      const h = makeHarness();
      const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
      await flush();
      const evidence = "evidence ".repeat(5_000);
      append(h.handles[0]!, "answer", evidence);
      if (state === "cancelled") await h.manager.cancel(runId, PARENT);
      else h.handles[0]!.completeTurn(state);
      expect(segments(h.manager, runId)).toHaveLength(0);
      expect(h.manager.getStatus(runId, PARENT, { fullOutput: true }).output).toBe(
        state === "failed" ? `${evidence}\nSubagent turn failed`.trim() : evidence,
      );
      await h.manager.waitForSettlement(PARENT, runId);
    },
  );

  it("avoids scanning old assistant items for deltas and authoritative updates", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    let comparisons = 0;
    const find = Array.prototype.find;
    const search = vi
      .spyOn(Array.prototype, "find")
      .mockImplementation(function (this: unknown[], predicate, receiver) {
        return find.call(this, (value, index, array) => {
          if (value && typeof value === "object" && "cursorRanges" in value) comparisons += 1;
          return predicate.call(receiver, value, index, array);
        });
      });
    try {
      for (let index = 0; index < 1_000; index += 1) {
        append(h.handles[0]!, `message-${index}`, "text");
      }
      append(h.handles[0]!, "message-999", " revisited");
      replace(h.handles[0]!, "message-999", "final");
    } finally {
      search.mockRestore();
      h.handles[0]!.completeTurn("completed");
      await h.manager.waitForSettlement(PARENT, runId);
    }
    expect(comparisons).toBe(0);
  });

  it("preserves exact interleaved cursor corrections across reused fallback ids and session continuation", async () => {
    const h = makeHarness({
      models: [
        { id: "first", label: "First" },
        { id: "second", label: "Second" },
      ],
      resume: { sessionId: "retained-session" },
    });
    const { runId } = h.manager.spawn(PARENT, {
      agent: "codex",
      model: "first",
      prompt: "go",
      retryMode: "any-failure",
      fallbacks: [{ agent: "codex", model: "second" }],
    });
    await flush();
    const first = h.handles[0]!;
    const staleListener = first.listener!;
    append(first, "a", "aa");
    first.emit({
      type: "item.started",
      threadId: "child",
      itemId: "tool",
      itemType: "tool_call",
      payload: { name: "read", status: "running" },
    });
    append(first, "b", "BBB");
    append(first, "a", "ccc");
    replace(first, "a", "A");
    replace(first, "b", "");
    append(first, "c", "end");
    first.completeTurn("failed");
    await flush();
    await flush();
    expect(segments(h.manager, runId)).toHaveLength(0);
    const second = h.handles[1]!;
    append(second, "a", "xx");
    append(second, "b", "YY");
    append(second, "a", "zz");
    replace(second, "a", "R");
    replace(second, "b", "B");
    staleListener.onRuntimeEvent?.({
      type: "item.updated",
      threadId: "child",
      itemId: "a",
      payload: { displayAuthoritative: true, content: [{ kind: "text", text: "stale" }] },
    });
    expect(h.manager.getStatus(runId, PARENT, { fullOutput: true })).toMatchObject({
      output: "AendRB",
      attempts: [{ output: "Aend", status: "failed" }],
    });
    expect(
      h.manager.getStatus(runId, PARENT, { fullOutput: true, currentAttemptOnly: true }).output,
    ).toBe("RB");
    expect(
      h.manager.getStatus(runId, PARENT, { outputMode: "quiet", afterOutputChars: 5 }),
    ).toMatchObject({
      output: "",
      total_output_chars: 5,
    });
    const cursors = [
      [0, "AendRB"],
      [1, "AendRB"],
      [3, "AendRB"],
      [8, "endRB"],
      [11, "RB"],
      [12, "RB"],
      [13, "BR"],
      [15, "R"],
      [17, ""],
      [1_000, ""],
    ] as const;
    for (const [offset, output] of cursors) {
      expect(h.manager.getStatus(runId, PARENT, { afterOutputChars: offset })).toMatchObject({
        output,
        total_output_chars: 17,
      });
    }
    second.completeTurn("completed");
    await h.manager.waitForSettlement(PARENT, runId);
    expect(segments(h.manager, runId)).toHaveLength(0);
    const receipt = h.manager.getStatus(runId, PARENT, { fullOutput: true });
    expect(receipt).toMatchObject({
      status: "completed",
      output: "AendRB",
      attempts: [{ output: "Aend" }, { output: "RB" }],
    });
    const next = await h.manager.steer(runId, "follow up", PARENT);
    await flush();
    expect(h.inputs[2]!.sessionRef?.providerSessionId).toBe("retained-session");
    expect(h.handles[2]!.startTurns[0]!.config.model).toBe("second");
    append(h.handles[2]!, "a", "follow-up evidence");
    h.handles[2]!.completeTurn("completed");
    await h.manager.waitForSettlement(PARENT, next.runId);
    expect(h.manager.getStatus(runId, PARENT, { fullOutput: true })).toEqual(receipt);
    for (const [offset, output] of cursors) {
      const expected = { status: "completed", output, total_output_chars: 17 };
      expect(h.manager.getStatus(runId, PARENT, { afterOutputChars: offset })).toMatchObject(
        expected,
      );
      expect(h.manager.getStatus(runId, PARENT, { afterOutputChars: offset })).toMatchObject(
        expected,
      );
    }
  });

  it("parses compact message starts before release and preserves reports and complete receipts through resume", async () => {
    const h = makeHarness({ resume: { sessionId: "compact-session" } });
    const { runId } = h.manager.spawn(PARENT, {
      agent: "codex",
      prompt: "go",
      resultMode: "compact",
    });
    await flush();
    const first = h.handles[0]!;
    const narration = "progress".repeat(4_000);
    append(first, "narration", narration);
    append(first, "suppressed", "private draft");
    replace(first, "suppressed", "");
    append(first, "report", envelope("Draft report"));
    replace(first, "report", envelope("Final report"));
    first.completeTurn("completed");
    const report = await h.manager.waitForSettlement(PARENT, runId);
    expect(report).toMatchObject({ output: "", result: { summary: "Final report" } });
    expect(segments(h.manager, runId)).toHaveLength(0);
    const final = narration + envelope("Final report");
    expect(h.manager.getStatus(runId, PARENT, { fullOutput: true }).output).toBe(final);
    expect(
      h.manager.getStatus(runId, PARENT, { fullOutput: true, currentAttemptOnly: true }).output,
    ).toBe(final);
    const cursor = h.manager.getStatus(runId, PARENT, {
      afterOutputChars: narration.length + 1,
      outputMode: "progress",
    });
    expect(cursor.output).toBe(envelope("Final report"));
    const next = await h.manager.steer(runId, "verify again", PARENT);
    await flush();
    expect(h.inputs[1]!.sessionRef?.providerSessionId).toBe("compact-session");
    append(h.handles[1]!, "report", envelope("Follow-up report"));
    h.handles[1]!.completeTurn("completed");
    expect(await h.manager.waitForSettlement(PARENT, next.runId)).toMatchObject({
      result: { summary: "Follow-up report" },
    });
    expect(h.manager.getStatus(runId, PARENT)).toEqual(report);
    expect(h.manager.getStatus(runId, PARENT, { fullOutput: true }).output).toBe(final);
    expect(
      h.manager.getStatus(runId, PARENT, {
        afterOutputChars: narration.length + 1,
        outputMode: "progress",
      }),
    ).toEqual(cursor);
  });
});
