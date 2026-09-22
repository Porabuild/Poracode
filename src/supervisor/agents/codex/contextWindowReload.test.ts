import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import {
  setupCodexStructuredSession,
  type CodexStructuredSessionHarness,
} from "./structuredSessionTestHarness";

const WINDOW_400K = { model: "gpt-5.4", contextSize: "400k" } satisfies ThreadConfig;
const WINDOW_1M = { model: "gpt-5.4", contextSize: "1m" } satisfies ThreadConfig;

function windowOf(params: unknown): unknown {
  return (params as { config?: { model_context_window?: number } }).config?.model_context_window;
}

async function openedSession(
  respond?: (method: string, params: unknown, h: CodexStructuredSessionHarness) => unknown,
): Promise<CodexStructuredSessionHarness> {
  let harness: CodexStructuredSessionHarness | undefined;
  harness = setupCodexStructuredSession((method, params) => {
    if (method === "thread/start") return { thread: { id: "provider-thread" } };
    return harness ? respond?.(method, params, harness) : undefined;
  });
  await harness.session.openThread(WINDOW_400K);
  harness.requests.length = 0;
  return harness;
}

afterEach(() => vi.restoreAllMocks());

describe("Codex context-window reload", () => {
  it("cold-resumes an idle thread before the turn when the window changed", async () => {
    const h = await openedSession();

    await h.session.startTurn("hello", WINDOW_1M);

    expect(h.requests.map((request) => request.method)).toEqual([
      "thread/unsubscribe",
      "thread/resume",
      "thread/read",
      "turn/start",
    ]);
    expect(h.requests[0]?.params).toEqual({ threadId: "provider-thread" });
    expect(h.requests[1]?.params).toMatchObject({ threadId: "provider-thread" });
    expect(windowOf(h.requests[1]?.params)).toBe(1_000_000);

    // Applied: the next turn on the same window does not reload again.
    h.notify("turn/completed", {
      threadId: "provider-thread",
      turn: { id: "turn-user", status: "completed", items: [] },
    });
    h.requests.length = 0;
    await h.session.startTurn("again", WINDOW_1M);
    expect(h.requests.map((request) => request.method)).toEqual(["turn/start"]);
  });

  it("does not reload when the window is unchanged", async () => {
    const h = await openedSession();

    await h.session.startTurn("hello", { ...WINDOW_400K, effort: "high" });

    expect(h.requests.map((request) => request.method)).toEqual(["turn/start"]);
  });

  it("holds the resume's replayed notifications out of the live thread", async () => {
    const h = await openedSession((method, _params, harness) => {
      if (method === "thread/unsubscribe") {
        harness.notify("thread/status/changed", {
          threadId: "provider-thread",
          status: { type: "notLoaded" },
        });
      }
      if (method === "thread/resume") {
        harness.notify("thread/status/changed", {
          threadId: "provider-thread",
          status: { type: "idle" },
        });
        harness.notify("thread/goal/cleared", { threadId: "provider-thread" });
        harness.notify("deprecationNotice", { summary: "Full-history hydration", details: null });
      }
      return undefined;
    });
    const eventsBefore = h.events.length;
    const updatesBefore = h.updates.length;

    await h.session.startTurn("hello", WINDOW_1M);

    // Only the user bubble, and the working status set before the reload.
    expect(h.events.slice(eventsBefore).map((event) => event.type)).toEqual([
      "item.started",
      "item.completed",
    ]);
    expect(h.updates.slice(updatesBefore)).toEqual([{ status: "working", attention: "working" }]);
  });

  it("does not reload while a turn is running", async () => {
    const h = await openedSession();
    h.notify("turn/started", {
      threadId: "provider-thread",
      turn: { id: "turn-live", status: "inProgress", items: [] },
    });

    await h.session.startTurn("concurrent", WINDOW_1M);

    expect(h.requests.map((request) => request.method)).toEqual(["turn/start"]);
  });

  it("keeps the old window and still sends the turn when the resume fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let resumes = 0;
    const h = await openedSession((method) => {
      if (method === "thread/resume" && resumes++ === 0) return new Error("resume failed");
      return undefined;
    });

    await h.session.startTurn("hello", WINDOW_1M);

    expect(h.requests.map((request) => request.method)).toEqual([
      "thread/unsubscribe",
      "thread/resume",
      "thread/resume",
      "thread/read",
      "turn/start",
    ]);
    // The retry re-subscribes on the previously applied window.
    expect(windowOf(h.requests[2]?.params)).toBe(400_000);
  });

  it("skips the resume when unsubscribing fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = await openedSession((method) =>
      method === "thread/unsubscribe" ? new Error("unsubscribe failed") : undefined,
    );

    await h.session.startTurn("hello", WINDOW_1M);

    expect(h.requests.map((request) => request.method)).toEqual([
      "thread/unsubscribe",
      "turn/start",
    ]);
  });
});
