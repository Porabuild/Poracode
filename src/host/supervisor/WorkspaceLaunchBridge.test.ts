import { WorkspaceLaunchUnavailableError } from "@/shared/threadWorkspaceRefusal";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceLaunchBridge, type WorkspaceLaunchSelection } from "./WorkspaceLaunchBridge";
import type { StartThreadPayload } from "@/shared/contracts";

const launch: StartThreadPayload = {
  threadId: "thread",
  agentKind: "neutral",
  projectLocation: { kind: "posix", path: "/primary" },
  config: { model: "model" },
  prompt: "",
  initialSize: { cols: 120, rows: 40 },
  presentationMode: "gui",
};
const selection = (): WorkspaceLaunchSelection => ({
  owner: "host-owner",
  scope: {
    primaryLocation: launch.projectLocation,
    additionalDirectories: [{ kind: "posix", path: "/extra" }],
    revision: 7,
  },
});
const reply = { version: 1, incarnation: "b36805a3-1c39-49af-af5c-3fe205ad45ef" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function input() {
  const current = selection();
  return {
    child: {},
    procedure: "startThread" as const,
    launch,
    selection: current,
    readSelection: () => current,
    isCurrent: () => true,
    requestSupport: vi.fn<() => Promise<typeof reply>>(async () => reply),
  };
}
describe("workspace launch negotiation", () => {
  it("coalesces support per child, never transfers it to another child", async () => {
    const bridge = new WorkspaceLaunchBridge();
    const a = input();
    const [first, second] = await Promise.all([bridge.prepare(a), bridge.prepare(a)]);
    expect(first).toEqual(second);
    expect(a.requestSupport).toHaveBeenCalledTimes(1);
    const b = { ...a, child: {} };
    await bridge.prepare(b);
    expect(a.requestSupport).toHaveBeenCalledTimes(2);
  });
  it.each([
    {},
    { version: 0, incarnation: reply.incarnation },
    { version: 2, incarnation: reply.incarnation },
    { version: 1, incarnation: "bad" },
  ])("refuses invalid support", async (result) => {
    const a = input();
    await expect(
      new WorkspaceLaunchBridge().prepare({ ...a, requestSupport: async () => result }),
    ).rejects.toThrow(WorkspaceLaunchUnavailableError);
  });
  it("retains no failed support entry and allows a fresh proven query", async () => {
    const bridge = new WorkspaceLaunchBridge(),
      a = input();
    a.requestSupport.mockRejectedValueOnce(new Error("old peer"));
    await expect(bridge.prepare(a)).rejects.toThrow(WorkspaceLaunchUnavailableError);
    await expect(bridge.prepare(a)).resolves.toMatchObject({
      action: "launch",
      scope: a.selection.scope,
    });
    expect(a.requestSupport).toHaveBeenCalledTimes(2);
  });
  it.each(["owner", "revision", "roots", "absent", "transport"] as const)(
    "refuses %s changes while waiting before effects",
    async (field) => {
      const a = input(),
        pending = deferred<typeof reply>();
      let fresh: WorkspaceLaunchSelection | undefined = selection();
      let connected = true;
      const run = new WorkspaceLaunchBridge().prepare({
        ...a,
        requestSupport: () => pending.promise,
        readSelection: () => fresh,
        isCurrent: () => connected,
      });
      if (field === "owner") fresh = { ...fresh!, owner: "replacement" };
      if (field === "revision") fresh!.scope.revision++;
      if (field === "roots") fresh!.scope.additionalDirectories = [];
      if (field === "absent") fresh = undefined;
      if (field === "transport") connected = false;
      pending.resolve(reply);
      await expect(run).rejects.toThrow(WorkspaceLaunchUnavailableError);
    },
  );
  it("detaches launch and scope before awaiting, including nested caller edits", async () => {
    const a = input(),
      pending = deferred<typeof reply>();
    const mutable = selection();
    const current = selection();
    const copiedLaunch = structuredClone(launch);
    const run = new WorkspaceLaunchBridge().prepare({
      ...a,
      launch: copiedLaunch,
      selection: mutable,
      readSelection: () => current,
      requestSupport: () => pending.promise,
    });
    const root = mutable.scope.additionalDirectories[0]!;
    if (root.kind === "posix") root.path = "/forged";
    copiedLaunch.config.model = "changed";
    pending.resolve(reply);
    await expect(run).resolves.toMatchObject({
      launch: { config: { model: "model" } },
      scope: { additionalDirectories: [{ path: "/extra" }] },
    });
  });
});
