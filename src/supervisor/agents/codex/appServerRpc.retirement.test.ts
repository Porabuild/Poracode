import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  CodexAppServerConnection,
  CodexAppServerRpc,
  type CodexAppServerRpcListener,
} from "./appServerRpc";
import type { CodexStdioTransportListener } from "./stdioTransport";

function harness() {
  let transportListener: CodexStdioTransportListener | undefined;
  const writes: Array<Record<string, unknown>> = [];
  const connection = new CodexAppServerConnection({
    setListener: (listener) => {
      transportListener = listener;
    },
    write: (message) => {
      writes.push(message);
    },
    dispose: () => {},
    formatOutput: () => "",
  });
  const make = (local: string, remote?: string) => {
    const rpc = new CodexAppServerRpc(connection, local);
    const events: RuntimeEvent[] = [];
    const notification = vi.fn<CodexAppServerRpcListener["onNotification"]>();
    rpc.setListener({
      onNotification: notification,
      onRuntimeEvents: (next) => {
        events.push(...next);
      },
      onClose: () => {},
      onError: () => {},
    });
    if (remote) rpc.claimThread(remote);
    return { rpc, events, notification };
  };
  const A = make("local-A", "provider-A"),
    B = make("local-B", "provider-B");
  const message = (payload: unknown) => transportListener!.onMessage(payload);
  const approval = (id: string | number, threadId = "provider-A") =>
    message({
      id,
      method: "item/commandExecution/requestApproval",
      params: { threadId, command: "echo fixture" },
    });
  const resolved = (requestId: string | number, threadId = "provider-A") =>
    message({ method: "serverRequest/resolved", params: { threadId, requestId } });
  return {
    connection,
    make,
    A,
    B,
    writes,
    message,
    approval,
    resolved,
    transport: () => transportListener!,
  };
}

describe("provider request retirement", () => {
  it("retires an accepted explicit-thread request before the sole channel claims its thread", () => {
    const h = harness();
    h.A.rpc.dispose(new Error("A closed"));
    h.B.rpc.dispose(new Error("B closed"));
    const startup = h.make("local-startup");
    h.approval(0);
    expect(startup.events).toHaveLength(1);
    h.resolved(0);
    expect(startup.notification).toHaveBeenCalledWith("serverRequest/resolved", {
      threadId: "provider-A",
      requestId: 0,
    });
    startup.rpc.resolveServerRequest("0", { optionId: "accept" });
    startup.rpc.dispose(new Error("startup closed"));
    expect(h.writes).toEqual([]);
  });

  it("releases a provider-resolved request before callbacks and keeps the sibling pending", () => {
    const h = harness();
    h.approval(0);
    h.approval("B-request", "provider-B");
    h.A.notification.mockImplementation(() =>
      h.A.rpc.resolveServerRequest("0", { optionId: "accept" }),
    );
    h.resolved(0);
    expect(h.A.notification).toHaveBeenCalledWith("serverRequest/resolved", {
      threadId: "provider-A",
      requestId: 0,
    });
    expect(h.writes).toEqual([]);
    h.A.rpc.dispose(new Error("A closed"));
    expect(h.writes).toEqual([]);
    h.B.rpc.resolveServerRequest("B-request", { optionId: "decline" });
    expect(h.writes).toEqual([{ id: "B-request", result: { decision: "decline" } }]);
  });

  it("preserves canonical string-zero translation but ignores duplicate and never-issued answers", () => {
    const h = harness();
    h.approval(0);
    h.B.rpc.resolveServerRequest("0", { optionId: "decline" });
    expect(h.writes).toEqual([]);
    h.A.rpc.resolveServerRequest("0", { optionId: "accept" });
    h.A.rpc.resolveServerRequest("0", { optionId: "decline" });
    h.A.rpc.resolveServerRequest("never-issued", { optionId: "accept" });
    expect(h.writes).toEqual([{ id: 0, result: { decision: "accept" } }]);
    h.resolved(0);
    expect(h.A.notification).toHaveBeenCalledWith("serverRequest/resolved", {
      threadId: "provider-A",
      requestId: 0,
    });
  });

  it.each([
    { requestId: "0", threadId: "provider-A" },
    { requestId: 0, threadId: "provider-B" },
  ])("does not settle a held request for a contradictory notification %j", (params) => {
    const h = harness();
    h.approval(0);
    h.resolved(params.requestId, params.threadId);
    expect(h.A.notification).not.toHaveBeenCalled();
    expect(h.B.notification).not.toHaveBeenCalled();
    h.A.rpc.resolveServerRequest("0", { optionId: "accept" });
    expect(h.writes).toEqual([{ id: 0, result: { decision: "accept" } }]);
  });

  it("keeps replacement channels distinct from the old session's pending request", () => {
    const h = harness();
    h.approval("old");
    const replacement = h.make("local-A", "provider-A");
    h.resolved("old");
    expect(replacement.notification).not.toHaveBeenCalled();
    replacement.rpc.resolveServerRequest("old", { optionId: "accept" });
    expect(h.writes).toEqual([]);
    h.A.rpc.dispose(new Error("old closed"));
    expect(h.writes).toEqual([
      {
        id: "old",
        error: { code: -32800, message: "Request cancelled because the Poracode thread closed." },
      },
    ]);
    h.approval("new");
    replacement.rpc.resolveServerRequest("new", { optionId: "accept" });
    expect(h.writes.at(-1)).toEqual({ id: "new", result: { decision: "accept" } });
  });

  it("retires finite repeated resolved payloads without cancelling them again on close", () => {
    const h = harness();
    for (let index = 0; index < 128; index++) {
      h.approval(index);
      h.resolved(index);
    }
    h.A.rpc.dispose(new Error("closed"));
    expect(h.writes).toEqual([]);
    expect(h.A.notification).toHaveBeenCalledTimes(128);
  });

  it.each(["close", "error"] as const)("late answers are no-op after transport %s", (kind) => {
    const h = harness();
    h.approval(0);
    if (kind === "close") h.transport().onClose();
    else h.transport().onError(new Error("closed"));
    h.A.rpc.resolveServerRequest("0", { optionId: "accept" });
    expect(h.writes).toEqual([]);
  });

  it("does not infer a provider owner for legacy owner-less requests", () => {
    const h = harness();
    h.B.rpc.dispose(new Error("B closed"));
    h.message({
      id: "legacy",
      method: "execCommandApproval",
      params: { command: ["pwd"], cwd: "/fixture" },
    });
    h.resolved("legacy");
    h.A.rpc.resolveServerRequest("legacy", { optionId: "accept" });
    expect(h.writes.at(-1)).toEqual({ id: "legacy", result: { decision: "accept" } });
  });
});
