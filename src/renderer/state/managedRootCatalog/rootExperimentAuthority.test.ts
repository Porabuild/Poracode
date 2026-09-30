import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteClientError } from "@/shared/remote/client";
import type { Experiment, RemoteExperimentState } from "@/shared/contracts";
import type { ManagedLoopbackActivationSnapshot } from "@/renderer/hostTransport/loopbackHttpWsTransport";

const transport = vi.hoisted(() => ({
  activation: null as ManagedLoopbackActivationSnapshot | null,
}));
vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", () => ({
  readManagedLoopbackActivation: () => transport.activation,
  subscribeManagedLoopbackActivation: () => () => {},
  subscribeManagedLoopbackMembershipEvents: () => () => {},
}));
vi.mock("./rootCatalogCommands", () => ({ isManagedRootDesktopRuntime: () => true }));
import { useExperimentStore } from "../experimentStore";
import { __resetManagedRootLaunchMetadataCapabilityForTest } from "./rootLaunchMetadataCapability";
import {
  __resetManagedExperimentAuthorityForTest,
  commitManagedExperimentChange,
  commitManagedExperimentCreate,
  commitManagedExperimentRemoval,
  getManagedExperimentAuthorityStatus,
  hydrateManagedExperimentState,
  ManagedExperimentOutcomeUncertainError,
} from "./rootExperimentAuthority";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function record(title: string): Experiment {
  return {
    id: "experiment",
    projectId: "project",
    title,
    prompt: "Improve the project",
    baseBranch: "main",
    baseCommit: "a".repeat(40),
    status: "running",
    createdAt: "2026-09-21",
    updatedAt: "2026-09-21",
    candidates: ["one", "two"].map((id) => ({
      threadId: id,
      agentKind: "claude",
      worktreeBranch: `branch-${id}`,
      worktreeOwnerToken: `experiment:${id}`,
      worktreeState: "pending",
    })),
  };
}
function activate(seq: number, title: string) {
  const client = {
    environment: vi.fn<() => Promise<unknown>>(async () => ({
      capabilities: { experiments: { versions: [1] } },
    })),
    experimentState: vi.fn<() => Promise<RemoteExperimentState>>(async () => ({
      revision: `rev-${seq}`,
      experiments: { experiment: record(title) },
    })),
    sendExperimentCommand: vi.fn<() => Promise<{ ok: true; revision: string }>>(async () => ({
      ok: true as const,
      revision: `changed-${seq}`,
    })),
  };
  transport.activation = {
    seq,
    endpoint: `http://localhost:${seq}`,
    // Opaque to this suite: the real authority is minted inside hostTransport.
    authority: `managed-root:test-authority:${seq}`,
    client: client as unknown as ManagedLoopbackActivationSnapshot["client"],
  };
  return client;
}

beforeEach(() => {
  __resetManagedExperimentAuthorityForTest();
  __resetManagedRootLaunchMetadataCapabilityForTest();
  useExperimentStore.getState().replaceExperiments({});
  transport.activation = null;
});

describe("experiment activation ownership", () => {
  it.each([false, true])("discards a retired hydration result (failure=%s)", async (failure) => {
    const old = activate(1, "Old host");
    const read = deferred<RemoteExperimentState>();
    old.experimentState.mockImplementation(() => read.promise);
    const pending = hydrateManagedExperimentState();
    await vi.waitFor(() => expect(old.experimentState).toHaveBeenCalledTimes(1));
    activate(2, "Current host");
    expect(await hydrateManagedExperimentState()).toBe(true);
    if (failure) read.reject(new Error("Retired host unavailable"));
    else read.resolve({ revision: "old", experiments: { experiment: record("Old host") } });
    expect(await pending).toBe(false);
    expect(useExperimentStore.getState().experiments.experiment?.title).toBe("Current host");
    expect(getManagedExperimentAuthorityStatus()).toEqual({ status: "ready" });
  });

  it.each([false, true])(
    "ignores retired command outcomes and never retries on the old host (failure=%s)",
    async (failure) => {
      const old = activate(1, "Original");
      await hydrateManagedExperimentState();
      const response = deferred<{ ok: true; revision: string }>();
      old.sendExperimentCommand.mockImplementation(() => response.promise);
      const pending = commitManagedExperimentChange("experiment", (base) => ({
        record: { ...base, title: "Old update" },
      }));
      const outcome = pending.then(
        () => ({ error: null }),
        (error: unknown) => ({ error }),
      );
      await vi.waitFor(() => expect(old.sendExperimentCommand).toHaveBeenCalledTimes(1));
      activate(2, "Current host");
      await hydrateManagedExperimentState();
      if (failure)
        response.reject(
          new RemoteClientError("connection lost", 0, "network", { requestMayHaveCommitted: true }),
        );
      else response.resolve({ ok: true, revision: "old-result" });
      expect((await outcome).error).toBeInstanceOf(ManagedExperimentOutcomeUncertainError);
      expect(useExperimentStore.getState().experiments.experiment?.title).toBe("Current host");
      expect(old.sendExperimentCommand).toHaveBeenCalledTimes(1);
    },
  );

  it("does not let an earlier read overwrite a confirmed edit on the same activation", async () => {
    const client = activate(1, "Original");
    await hydrateManagedExperimentState();
    const read = deferred<RemoteExperimentState>();
    client.experimentState.mockImplementationOnce(() => read.promise);
    const hydration = hydrateManagedExperimentState();
    await vi.waitFor(() => expect(client.experimentState).toHaveBeenCalledTimes(2));
    await commitManagedExperimentChange("experiment", (base) => ({
      record: { ...base, title: "Confirmed edit" },
    }));
    client.experimentState.mockResolvedValue({
      revision: "changed-1",
      experiments: { experiment: record("Confirmed edit") },
    });
    read.resolve({ revision: "rev-1", experiments: { experiment: record("Original") } });
    expect(await hydration).toBe(true);
    expect(useExperimentStore.getState().experiments.experiment?.title).toBe("Confirmed edit");
    expect(client.sendExperimentCommand).toHaveBeenCalledTimes(1);
  });

  it("preserves a newer host snapshot when an earlier command acknowledgement arrives late", async () => {
    const client = activate(1, "Original");
    await hydrateManagedExperimentState();
    const response = deferred<{ ok: true; revision: string }>();
    client.sendExperimentCommand.mockImplementationOnce(() => response.promise);
    const edit = commitManagedExperimentChange("experiment", (base) => ({
      record: { ...base, title: "First edit" },
    }));
    await vi.waitFor(() => expect(client.sendExperimentCommand).toHaveBeenCalledTimes(1));
    client.experimentState.mockResolvedValue({
      revision: "newer-host-edit",
      experiments: { experiment: record("Second edit") },
    });
    await hydrateManagedExperimentState();
    response.resolve({ ok: true, revision: "first-edit" });
    expect((await edit)?.title).toBe("Second edit");
    expect(useExperimentStore.getState().experiments.experiment?.title).toBe("Second edit");
    expect(client.sendExperimentCommand).toHaveBeenCalledTimes(1);
  });

  it("keeps an acknowledged create uncertain when its required refresh fails", async () => {
    const client = activate(1, "Original");
    await hydrateManagedExperimentState();
    const response = deferred<{ ok: true; revision: string }>();
    client.sendExperimentCommand.mockImplementationOnce(() => response.promise);
    const created = { ...record("New experiment"), id: "new-experiment" };
    useExperimentStore.getState().addExperiment(created);
    const create = commitManagedExperimentCreate(
      created,
      created.candidates.map((candidate) => ({
        threadId: candidate.threadId,
        projectId: created.projectId,
        title: created.title,
        agentKind: candidate.agentKind,
        config: { model: "test-model" },
        worktreeBranch: candidate.worktreeBranch,
      })),
    );
    const outcome = create.then(
      () => null,
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(client.sendExperimentCommand).toHaveBeenCalledTimes(1));
    client.experimentState.mockResolvedValue({
      revision: "newer-host-state",
      experiments: { experiment: record("Another edit"), [created.id]: created },
    });
    await hydrateManagedExperimentState();
    client.experimentState.mockRejectedValue(new Error("Read unavailable"));
    response.resolve({ ok: true, revision: "created-state" });
    expect(await outcome).toBeInstanceOf(ManagedExperimentOutcomeUncertainError);
    expect(useExperimentStore.getState().experiments[created.id]).toEqual(created);
    expect(client.sendExperimentCommand).toHaveBeenCalledTimes(1);
  });

  it("does not remove a successor record when an older removal acknowledgement arrives", async () => {
    const client = activate(1, "Original");
    await hydrateManagedExperimentState();
    const response = deferred<{ ok: true; revision: string }>();
    client.sendExperimentCommand.mockImplementationOnce(() => response.promise);
    const removal = commitManagedExperimentRemoval("experiment", "release");
    const outcome = removal.then(
      () => null,
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(client.sendExperimentCommand).toHaveBeenCalledTimes(1));
    client.experimentState.mockResolvedValue({
      revision: "recreated-state",
      experiments: { experiment: record("Recreated") },
    });
    await hydrateManagedExperimentState();
    response.resolve({ ok: true, revision: "removed-state" });
    expect(await outcome).toBeInstanceOf(Error);
    expect(useExperimentStore.getState().experiments.experiment?.title).toBe("Recreated");
    expect(client.sendExperimentCommand).toHaveBeenCalledTimes(1);
  });

  it("reads the successor's record and CAS token before its first mutation", async () => {
    activate(1, "Old host");
    await hydrateManagedExperimentState();
    const next = activate(2, "Current host");
    await commitManagedExperimentChange("experiment", (base) => ({
      record: { ...base, title: `${base.title} edited` },
    }));
    expect(next.experimentState).toHaveBeenCalledTimes(1);
    expect(next.sendExperimentCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: "rev-2",
        record: expect.objectContaining({ title: "Current host edited" }),
      }),
      expect.anything(),
    );
  });
});
