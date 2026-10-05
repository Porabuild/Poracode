import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentAdapter,
  StructuredSessionHandle,
  StructuredSessionListener,
} from "@/supervisor/agents/base";
import {
  HostResourceAdmissionOwner,
  UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
} from "@/supervisor/runtime/hostResourceAdmission";
import { SubagentRunManager, MAX_CONCURRENT_CHILDREN_PER_PARENT } from "./SubagentRunManager";
import {
  SubagentWorkflowManager,
  type SubagentWorkflowHost,
  type WorkflowTask,
} from "./SubagentWorkflowManager";
import { runOneShotChild, type OneShotChildHandle } from "./oneShotChild";

vi.mock("@/supervisor/agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/supervisor/agents/base")>()),
  resolveAgentProjectLocation: async (location: unknown) => location,
}));
vi.mock("./oneShotChild", () => ({ runOneShotChild: vi.fn<typeof runOneShotChild>() }));

const PARENT = "parent";
const request = { agent: "codex", prompt: "Work" };
const flush = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve();
};

function makeHandle() {
  let listener: StructuredSessionListener | undefined;
  const handle = {
    launchOptions: {},
    setListener: (value: StructuredSessionListener) => {
      listener = value;
    },
    startTurn: vi.fn<() => Promise<void>>(async () => {}),
    interruptTurn: vi.fn<() => Promise<void>>(async () => {}),
    dispose: vi.fn<() => Promise<void>>(async () => {}),
    close: () => listener?.onClose(),
    complete: () =>
      listener?.onRuntimeEvent?.({
        type: "turn.completed",
        threadId: "child",
        turnId: "turn",
        state: "completed",
      }),
  } satisfies StructuredSessionHandle & { close(): void; complete(): void };
  return handle;
}

function setup(oneShot = false) {
  const owner = new HostResourceAdmissionOwner(() => UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY);
  const handles: ReturnType<typeof makeHandle>[] = [];
  const oneShots: Array<OneShotChildHandle & { finish(): void }> = [];
  vi.mocked(runOneShotChild).mockImplementation(async () => {
    const closed = Promise.withResolvers<void>();
    const handle = {
      closed: closed.promise,
      cancel: vi.fn<() => void>(),
      finish: () => closed.resolve(),
    };
    oneShots.push(handle);
    return handle;
  });
  const create = vi.fn<() => Promise<ReturnType<typeof makeHandle>>>(async () => {
    const handle = makeHandle();
    handles.push(handle);
    return handle;
  });
  const adapter = {
    kind: "codex",
    label: "Worker",
    capabilities: {
      models: [{ id: "worker-model", label: "Worker model" }],
      approvalPolicies: [{ id: "never", label: "Unrestricted" }],
      sandboxModes: [{ id: "danger-full-access", label: "Unrestricted" }],
    },
    ...(oneShot
      ? { buildSubagentOneShotCommand: () => undefined }
      : { createStructuredSession: create }),
  } as unknown as AgentAdapter;
  const manager = new SubagentRunManager({
    adapters: new Map([[adapter.kind, adapter]]),
    admission: owner,
    structuredDisposalTimeoutMs: 10,
    host: {
      getParentContext: () => ({
        projectLocation: { kind: "posix", path: "/tmp/project" },
        config: { model: "parent-model" },
      }),
      appendRuntimeEvent: () => {},
    },
  });
  const workflowHost: SubagentWorkflowHost = {
    validate: (parent, requests) => manager.validateRequests(parent, requests),
    spawn: vi.fn<SubagentWorkflowHost["spawn"]>((parent, input) => manager.spawn(parent, input)),
    getCapacity: (parent) => manager.getCapacity(parent).available_slots,
    waitForSettlement: (parent, run) => manager.waitForSettlement(parent, run),
    getStatus: (parent, run) => manager.getStatus(run, parent),
    subscribe: (parent, listener) => manager.subscribe(parent, listener),
    cancel: (parent, run) => manager.cancel(run, parent),
  };
  const workflows = new SubagentWorkflowManager(workflowHost);
  return { manager, owner, handles, oneShots, create, workflowHost, workflows };
}

const task = (id: string, writeScope: string[] = []): WorkflowTask => ({
  id,
  dependsOn: [],
  writeScope,
  request,
});
afterEach(() => {
  vi.useRealTimers();
});

describe("SubagentRunManager retirement notifications", () => {
  it.each(["dispose", "close", "one-shot"] as const)(
    "wakes a queued workflow exactly once on late %s proof",
    async (proof) => {
      vi.useFakeTimers();
      const h = setup(proof === "one-shot");
      const runs = h.manager.spawnMany(
        PARENT,
        Array.from({ length: MAX_CONCURRENT_CHILDREN_PER_PARENT }, () => request),
      );
      await flush();
      const disposal = Promise.withResolvers<void>();
      if (proof !== "one-shot") h.handles[0]!.dispose.mockImplementation(() => disposal.promise);
      const { workflowId } = h.workflows.start(PARENT, [task("queued")]);
      await flush();
      expect(h.workflows.getStatus(PARENT, workflowId).tasks[0]!.status).toBe("queued");
      const cancellation = h.manager
        .cancel(runs[0]!.runId, PARENT)
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10);
      expect(String(await cancellation)).toContain("did not confirm");
      expect(h.manager.getCapacity(PARENT)).toMatchObject({ available_slots: 0, stopping: 1 });
      expect(h.workflowHost.spawn).not.toHaveBeenCalled();
      const changed = vi.fn<() => void>();
      const otherParent = vi.fn<() => void>();
      h.manager.subscribe(PARENT, changed);
      h.manager.subscribe("other-parent", otherParent);
      if (proof === "dispose") disposal.resolve();
      else if (proof === "close") h.handles[0]!.close();
      else h.oneShots[0]!.finish();
      await flush();
      expect(changed).toHaveBeenCalledExactlyOnceWith("changed");
      expect(otherParent).not.toHaveBeenCalled();
      expect(h.workflowHost.spawn).toHaveBeenCalledOnce();
      expect(h.workflows.getStatus(PARENT, workflowId).tasks[0]!.status).toBe("running");
      expect(h.owner.usage().total).toBe(MAX_CONCURRENT_CHILDREN_PER_PARENT);
      expect(h.manager.getStatus(runs[0]!.runId).status).toBe("cancelled");
      disposal.resolve();
      if (proof === "one-shot") h.oneShots[0]!.finish();
      else h.handles[0]!.close();
      await flush();
      expect(changed).toHaveBeenCalledOnce();
      expect(h.workflowHost.spawn).toHaveBeenCalledOnce();
      h.manager.cancelAllForThread(PARENT);
      for (const oneShot of h.oneShots) oneShot.finish();
      await flush();
      expect(h.owner.usage().total).toBe(0);
    },
  );

  it.each(["dispose", "close", "one-shot"] as const)(
    "prunes newly eligible settled records once after late %s proof",
    async (proof) => {
      vi.useFakeTimers();
      const h = setup(proof === "one-shot");
      const old = h.manager.spawn(PARENT, request);
      await flush();
      const disposal = Promise.withResolvers<void>();
      if (proof !== "one-shot") h.handles[0]!.dispose.mockImplementation(() => disposal.promise);
      const cancellation = h.manager.cancel(old.runId, PARENT).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10);
      expect(String(await cancellation)).toContain("did not confirm");
      for (let i = 0; i < 50; i++) {
        await vi.advanceTimersByTimeAsync(1);
        const run = h.manager.spawn(PARENT, request);
        await flush();
        if (proof === "one-shot") {
          const cancel = h.manager.cancel(run.runId, PARENT);
          h.oneShots.at(-1)!.finish();
          await cancel;
        } else h.handles.at(-1)!.complete();
        await flush();
      }
      expect(h.manager.listRuns(PARENT)).toHaveLength(51);
      const changed = vi.fn<() => void>();
      h.manager.subscribe(PARENT, changed);
      const prune = vi.spyOn(
        h.manager as unknown as { pruneSettledRuns(parent: string): void },
        "pruneSettledRuns",
      );
      if (proof === "dispose") disposal.resolve();
      else if (proof === "close") h.handles[0]!.close();
      else h.oneShots[0]!.finish();
      await flush();
      expect(h.manager.listRuns(PARENT)).toHaveLength(50);
      expect(h.manager.getStatus(old.runId).output).toContain("Unknown run_id");
      expect(changed).toHaveBeenCalledExactlyOnceWith("changed");
      expect(prune).toHaveBeenCalledExactlyOnceWith(PARENT);
      disposal.resolve();
      if (proof === "one-shot") h.oneShots[0]!.finish();
      else h.handles[0]!.close();
      await flush();
      expect(changed).toHaveBeenCalledOnce();
      expect(prune).toHaveBeenCalledOnce();
      expect(h.owner.usage().total).toBe(0);
    },
  );

  it("releases an evicted parent's one-shot retirement without explicit retry", async () => {
    vi.useFakeTimers();
    const h = setup(true);
    const run = h.manager.spawn(PARENT, request);
    await flush();
    h.manager.cancelAllForThread(PARENT);
    await vi.advanceTimersByTimeAsync(10);
    expect(h.manager.getStatus(run.runId).output).toContain("Unknown run_id");
    expect(h.owner.usage().total).toBe(1);
    h.oneShots[0]!.finish();
    await flush();
    expect(h.owner.usage().total).toBe(0);
    await h.manager.retryRetirements();
    expect(h.oneShots[0]!.cancel).toHaveBeenCalledOnce();
  });

  it("keeps evicted held creation enumerable and disposes the eventual handle", async () => {
    vi.useFakeTimers();
    const h = setup();
    const creation = Promise.withResolvers<ReturnType<typeof makeHandle>>();
    h.create.mockReturnValueOnce(creation.promise);
    h.manager.spawn(PARENT, request);
    await flush();
    h.manager.cancelAllForThread(PARENT);
    const retry = h.manager.retryRetirements().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(String(await retry)).toContain("did not confirm");
    expect(h.owner.usage().total).toBe(1);
    const handle = makeHandle();
    creation.resolve(handle);
    await flush();
    expect(handle.dispose).toHaveBeenCalledOnce();
    expect(handle.startTurn).not.toHaveBeenCalled();
    expect(h.owner.usage().total).toBe(0);
    await h.manager.retryRetirements();
    expect(handle.dispose).toHaveBeenCalledOnce();
  });

  it("preserves write locks after a failed join through capacity proof until explicit successful cancellation", async () => {
    vi.useFakeTimers();
    const h = setup();
    const { workflowId } = h.workflows.start(PARENT, [task("held", ["src/owned.ts"])]);
    await flush();
    const disposal = Promise.withResolvers<void>();
    h.handles[0]!.dispose.mockImplementation(() => disposal.promise);
    h.handles[0]!.complete();
    await vi.advanceTimersByTimeAsync(10);
    expect(h.workflows.getStatus(PARENT, workflowId)).toMatchObject({
      status: "blocked",
      tasks: [{ status: "failed" }],
    });
    expect(() => h.workflows.start(PARENT, [task("conflict", ["src/owned.ts"])])).toThrow(
      "write ownership",
    );
    disposal.resolve();
    await flush();
    expect(h.owner.usage().total).toBe(0);
    expect(h.manager.getCapacity(PARENT).available_slots).toBe(MAX_CONCURRENT_CHILDREN_PER_PARENT);
    expect(h.workflows.getStatus(PARENT, workflowId)).toMatchObject({
      status: "blocked",
      tasks: [{ status: "failed" }],
    });
    expect(() => h.workflows.start(PARENT, [task("conflict", ["src/owned.ts"])])).toThrow(
      "write ownership",
    );
    await h.workflows.cancel(PARENT, workflowId);
    const replacement = h.workflows.start(PARENT, [task("replacement", ["src/owned.ts"])]);
    await flush();
    expect(h.workflows.getStatus(PARENT, replacement.workflowId).tasks[0]!.status).toBe("running");
    h.manager.cancelAllForThread(PARENT);
    await flush();
    expect(h.owner.usage().total).toBe(0);
  });
});
