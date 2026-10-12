import { describe, expect, it } from "vitest";
import type { CursorSdkWorkerEvent } from "./sdkWorkerProtocol";
import { createCursorSdkWorkerHarness } from "./sdkWorkerTestHarness";

describe("Cursor SDK subagent cancellation isolation", () => {
  it("keeps the parent and sibling tasks alive after a detached transport abort", async () => {
    const { client, directory } = await createCursorSdkWorkerHarness(SUBAGENT_SDK);
    await client.initialize({ createOptions: { local: { cwd: directory } } });
    const events: CursorSdkWorkerEvent[] = [];
    const errors: Error[] = [];
    client.onEvent((event) => events.push(event));
    client.onTransportError((error) => errors.push(error));

    const { runId } = await client.start({ message: "subagents" });
    await expect
      .poll(() => events.some((event) => event.type === "result") || errors.length > 0)
      .toBe(true);
    expect(errors).toEqual([]);
    expect(
      events.filter((event) => event.type === "message").map((event) => event.message),
    ).toEqual([
      expect.objectContaining({ call_id: "child-one", status: "running" }),
      expect.objectContaining({ call_id: "child-two", status: "running" }),
      expect.objectContaining({ call_id: "child-one", status: "completed" }),
      expect.objectContaining({ call_id: "child-two", status: "completed" }),
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "result",
        runId,
        result: { id: runId, status: "finished", result: "PARENT_OK" },
      }),
    );

    const followUp = await client.start({ message: "follow-up" });
    await expect
      .poll(() => events.some((event) => event.type === "result" && event.runId === followUp.runId))
      .toBe(true);
    expect(errors).toEqual([]);
    await client.dispose();
  });

  it("keeps a genuine Run terminal error visible and serves a later turn", async () => {
    const { client, directory } = await createCursorSdkWorkerHarness(SUBAGENT_SDK);
    await client.initialize({ createOptions: { local: { cwd: directory } } });
    const events: CursorSdkWorkerEvent[] = [];
    const errors: Error[] = [];
    client.onEvent((event) => events.push(event));
    client.onTransportError((error) => errors.push(error));

    const { runId } = await client.start({ message: "canceled-error" });
    await expect
      .poll(
        () =>
          events.some((event) => event.type === "result" && event.runId === runId) ||
          errors.length > 0,
      )
      .toBe(true);

    expect(errors).toEqual([]);
    expect(events.filter((event) => event.type === "result" && event.runId === runId)).toEqual([
      {
        type: "result",
        requestId: expect.any(String),
        runId,
        result: {
          id: runId,
          status: "error",
          error: { message: "[unknown] [canceled] This operation was aborted" },
        },
      },
    ]);
    expect(
      events.some(
        (event) =>
          event.type === "result" && event.runId === runId && event.result.status === "finished",
      ),
    ).toBe(false);
    expect(events.filter((event) => event.type === "run-error")).toEqual([]);

    const followUp = await client.start({ message: "follow-up" });
    await expect
      .poll(() => events.some((event) => event.type === "result" && event.runId === followUp.runId))
      .toBe(true);
    expect(errors).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "result",
        runId: followUp.runId,
        result: { id: followUp.runId, status: "finished", result: "PARENT_OK" },
      }),
    );
    await client.dispose();
  });

  it("still cancels the run through the SDK when Stop aborts a detached request", async () => {
    const { client, directory } = await createCursorSdkWorkerHarness(SUBAGENT_SDK);
    await client.initialize({ createOptions: { local: { cwd: directory } } });
    const events: CursorSdkWorkerEvent[] = [];
    const errors: Error[] = [];
    client.onEvent((event) => events.push(event));
    client.onTransportError((error) => errors.push(error));
    const { runId } = await client.start({ message: "hold" });
    await expect.poll(() => events.filter((event) => event.type === "message").length).toBe(2);
    await client.cancel(runId);
    await expect
      .poll(() => events.some((event) => event.type === "result") || errors.length > 0)
      .toBe(true);
    expect(errors).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "result",
        runId,
        result: { id: runId, status: "cancelled", result: "PARENT_OK" },
      }),
    );
    await client.dispose();
  });

  it("does not suppress unrelated unhandled failures", async () => {
    const { client, directory } = await createCursorSdkWorkerHarness(SUBAGENT_SDK);
    await client.initialize({ createOptions: { local: { cwd: directory } } });
    const errors: Error[] = [];
    client.onTransportError((error) => errors.push(error));
    await client.start({ message: "fatal" });
    await expect.poll(() => errors.length).toBe(1);
    expect(errors[0]?.message).toBe("Cursor SDK worker exited (code 1).");
    await client.dispose();
  });
});

// Cursor's local transport can reject a detached promise during cancellation
// while the public Run stream is still delivering parent/child events. This
// fixture reproduces the process-level rejection in a real worker, so an
// in-process mocked transport cannot hide Node's default exit-on-rejection.
const SUBAGENT_SDK = String.raw`
let counter = 0;
function abortDetachedRequest() {
  const cause = new DOMException("This operation was aborted", "AbortError");
  const error = new Error("[unknown] [canceled] This operation was aborted", { cause });
  error.name = "ConnectError";
  error.code = 2;
  void Promise.reject(error);
}
export class Agent {
  static messages = { async list() { return []; } };
  static async create() {
    return {
      agentId: "parent",
      async send(message) {
        const id = "run-" + ++counter;
        let cancelled = false;
        let release;
        const stopped = new Promise(resolve => { release = resolve; });
        return {
          id,
          async *stream() {
            if (message === "follow-up") return;
            for (const child of ["child-one", "child-two"]) {
              yield { type: "tool_call", agent_id: "parent", run_id: id,
                call_id: child, name: "task", status: "running" };
            }
            if (message === "hold") {
              await stopped;
            } else if (message === "fatal") {
              void Promise.reject(new Error("unrelated programming failure"));
            } else if (message !== "canceled-error") {
              abortDetachedRequest();
            }
            await new Promise(resolve => setTimeout(resolve, 40));
            for (const child of ["child-one", "child-two"]) {
              yield { type: "tool_call", agent_id: "parent", run_id: id,
                call_id: child, name: "task", status: "completed" };
            }
          },
          async wait() {
            if (message === "canceled-error") {
              return {
                id,
                status: "error",
                error: { message: "[unknown] [canceled] This operation was aborted" },
              };
            }
            return { id, status: cancelled ? "cancelled" : "finished", result: "PARENT_OK" };
          },
          async cancel() { cancelled = true; abortDetachedRequest(); release(); },
        };
      },
      async reload() {},
      close() {},
    };
  }
  static async resume() { return this.create(); }
}
export class Cursor { static models = { async list() { return []; } }; }
`;
