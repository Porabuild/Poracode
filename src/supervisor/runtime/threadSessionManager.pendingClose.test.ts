import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StartThreadPayload } from "@/shared/contracts";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";
import type { ThreadSessionManagerOptions } from "./threadSession/managerOptions";

vi.mock("node-pty", () => ({
  spawn: vi.fn<() => never>(() => {
    throw new Error("Unexpected PTY spawn");
  }),
}));
vi.mock("node:timers/promises", () => ({ setTimeout: async () => undefined }));

import { ThreadSessionManager } from "./threadSessionManager";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function handle(): StructuredSessionHandle {
  return {
    launchOptions: {},
    setListener: vi.fn<NonNullable<StructuredSessionHandle["setListener"]>>(),
    activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(async () => undefined),
    openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(
      async () => "fixture-session",
    ),
    dispose: vi.fn<NonNullable<StructuredSessionHandle["dispose"]>>(async () => undefined),
  };
}

function adapter(kind: string, session: StructuredSessionHandle): AgentAdapter {
  return {
    kind,
    label: kind,
    binary: kind,
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      settingDefs: [],
    },
    detectInstall: vi.fn<NonNullable<AgentAdapter["detectInstall"]>>(),
    buildLaunchArgv: vi.fn<NonNullable<AgentAdapter["buildLaunchArgv"]>>(() => {
      throw new Error("Unexpected native launch");
    }),
    buildResumeArgv: vi.fn<NonNullable<AgentAdapter["buildResumeArgv"]>>(() => {
      throw new Error("Unexpected native resume");
    }),
    createInitialSessionRef: vi.fn<NonNullable<AgentAdapter["createInitialSessionRef"]>>(
      () => undefined,
    ),
    createStructuredSession: vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => session,
    ),
  };
}

const fixtures: Array<{ manager: ThreadSessionManager; directory: string }> = [];
function managerFor(adapters: AgentAdapter[], options: Partial<ThreadSessionManagerOptions> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "poracode-pending-close-"));
  const manager = new ThreadSessionManager({
    emit: vi.fn<ThreadSessionManagerOptions["emit"]>(),
    isDev: false,
    logsDir: join(directory, "logs"),
    settingsPath: join(directory, "settings.json"),
    readDisableCliHookPlugin: () => true,
    adapters: new Map(adapters.map((value) => [value.kind, value])),
    resolveWindowsShell: () => ({ shell: "", kind: "cmd", args: [] }),
    ...options,
  });
  fixtures.push({ manager, directory });
  return manager;
}

function payload(agentKind = "fixture"): Omit<StartThreadPayload, "providerSwitch"> {
  return {
    threadId: "pending-close",
    agentKind,
    projectLocation: { kind: "posix", path: process.cwd() },
    config: { model: "fixture-model" },
    prompt: "",
    initialSize: { cols: 80, rows: 24 },
    presentationMode: "gui",
  };
}

// A whole microtask drain proves an immediately resolved close was observed;
// lifecycle advancement itself is controlled only by the explicit gates.
const drain = () => new Promise<void>((resolve) => setImmediate(resolve));

async function prepareExecution(manager: ThreadSessionManager, threadId = "pending-close") {
  const result = await manager.controlThreadExecution({ version: 1, action: "prepare", threadId });
  expect(result.state).toBe("prepared");
  return result.operationId;
}

describe("controlled thread execution retirement", () => {
  it("submits the initial structured prompt exactly once under the selected configuration", async () => {
    const session = handle();
    session.startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const manager = managerFor([adapter("fixture", session)]),
      operationId = await prepareExecution(manager);
    const launch = {
      ...payload(),
      threadId: "pending-close",
      prompt: "Inspect the owned repository",
      config: {
        model: "fixture-model",
        approvalPolicy: "ask" as const,
        sandboxMode: "read-only" as const,
      },
    };
    await expect(
      manager.controlThreadExecution({ version: 1, action: "start", operationId, launch }),
    ).resolves.toMatchObject({ state: "started" });
    expect(session.startTurn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(session.startTurn).mock.calls[0]?.slice(0, 2)).toEqual([
      launch.prompt,
      launch.config,
    ]);
    await manager.controlThreadExecution({ version: 1, action: "cancel", operationId });
  });

  it("cancels a prepared operation before spawn and refuses delayed start", async () => {
    const provider = adapter("fixture", handle()),
      manager = managerFor([provider]);
    const operationId = await prepareExecution(manager);
    const cancelled = await manager.controlThreadExecution({
      version: 1,
      action: "cancel",
      operationId,
    });
    expect(cancelled).toMatchObject({ state: "cancelled", confirmed: true });
    await expect(
      manager.controlThreadExecution({
        version: 1,
        action: "start",
        operationId,
        launch: { ...payload(), threadId: "pending-close" },
      }),
    ).rejects.toThrow("unknown or cancelled");
    expect(provider.createStructuredSession).not.toHaveBeenCalled();
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
  });

  it.each(["creation", "activation", "open"] as const)(
    "joins held %s, disposal and the resource lease before admitting a replacement",
    async (phase) => {
      const gate = deferred(),
        entered = deferred(),
        disposal = deferred(),
        disposing = deferred();
      const session = handle(),
        provider = adapter("fixture", session);
      const hold = async () => {
        entered.resolve();
        await gate.promise;
      };
      if (phase === "creation")
        provider.createStructuredSession = vi.fn<
          NonNullable<AgentAdapter["createStructuredSession"]>
        >(async () => {
          await hold();
          return session;
        });
      if (phase === "activation")
        session.activate = vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(hold);
      if (phase === "open")
        session.openThread = vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(async () => {
          await hold();
          return "fixture-session";
        });
      session.dispose = vi.fn<NonNullable<StructuredSessionHandle["dispose"]>>(() => {
        disposing.resolve();
        return disposal.promise;
      });
      const manager = managerFor([provider]),
        operationId = await prepareExecution(manager);
      const start = manager.controlThreadExecution({
        version: 1,
        action: "start",
        operationId,
        launch: { ...payload(), threadId: "pending-close" },
      });
      await entered.promise;
      let joined = false;
      const cancel = manager
        .controlThreadExecution({ version: 1, action: "cancel", operationId })
        .then((result) => {
          joined = true;
          return result;
        });
      const repeat = manager.controlThreadExecution({ version: 1, action: "cancel", operationId });
      try {
        await drain();
        expect(joined).toBe(false);
        await expect(manager.startThread(payload())).rejects.toThrow(
          "Another client is running this thread",
        );
        expect(manager.hostResourceAdmission.usage().total).toBe(1);
        gate.resolve();
        await disposing.promise;
        await drain();
        expect(joined).toBe(false);
        expect(manager.hostResourceAdmission.usage().agentSessions.retiring).toBe(1);
        disposal.resolve();
        await expect(cancel).resolves.toMatchObject({ state: "cancelled", confirmed: true });
        expect(await repeat).toEqual(await cancel);
        await expect(start).resolves.toMatchObject({ state: "cancelled", confirmed: true });
        expect(session.dispose).toHaveBeenCalledTimes(1);
        expect(manager.hostResourceAdmission.usage().total).toBe(0);
        await manager.startThread(payload());
        const replacement = manager.sessions.get("pending-close");
        await expect(
          manager.controlThreadExecution({ version: 1, action: "cancel", operationId }),
        ).resolves.toMatchObject({ confirmed: true });
        expect(manager.sessions.get("pending-close")).toBe(replacement);
        expect(session.dispose).toHaveBeenCalledTimes(1);
      } finally {
        gate.resolve();
        disposal.resolve();
        await Promise.allSettled([start, cancel, repeat]);
      }
    },
  );

  it("refuses foreign input, replacement and shell reuse while preserving reads and explicit stop", async () => {
    const session = handle(),
      manager = managerFor([adapter("fixture", session)]),
      operationId = await prepareExecution(manager);
    await expect(
      manager.controlThreadExecution({
        version: 1,
        action: "start",
        operationId,
        launch: { ...payload(), threadId: "pending-close" },
      }),
    ).resolves.toMatchObject({ state: "started" });
    const input = {
      threadId: "pending-close",
      prompt: "foreign input",
      config: { model: "fixture-model" },
    };
    for (const mutate of [
      () => manager.startThread(payload()),
      () => manager.sendThreadInput(input),
      () => manager.stageThreadInput(input),
      () => manager.setPendingSteer(input),
      () => manager.queueThreadFollowUp(input),
      () => manager.resumeThreadFollowUps("pending-close"),
      () => manager.writeTerminal({ threadId: "pending-close", data: "input" }),
      () =>
        manager.startShell({
          shellId: "pending-close",
          projectLocation: payload().projectLocation,
        }),
    ])
      await expect(
        Promise.resolve().then(async () => {
          await mutate();
        }),
      ).rejects.toThrow("Another client is running this thread");
    expect(manager.getThreadSnapshots().map((snapshot) => snapshot.threadId)).toContain(
      "pending-close",
    );
    await expect(manager.closeThreadConfirmed({ threadId: "pending-close" })).resolves.toEqual({
      confirmed: true,
    });
    await expect(manager.startThread(payload())).rejects.toThrow(
      "Another client is running this thread",
    );
    await manager.controlThreadExecution({ version: 1, action: "cancel", operationId });
    await manager.startThread(payload());
    expect(manager.sessions.size).toBe(1);
  });

  it("refuses preparation for another client's runtime or an in-flight start", async () => {
    const session = handle(),
      manager = managerFor([adapter("fixture", session)]);
    const start = manager.startThread(payload());
    await expect(prepareExecution(manager)).rejects.toThrow("runtime work");
    await start;
    await expect(prepareExecution(manager)).rejects.toThrow("runtime work");
    expect(session.dispose).not.toHaveBeenCalled();
  });

  it.each(["direct", "steer", "queued"] as const)(
    "refuses preparation while earlier %s input still owns admission",
    async (kind) => {
      const manager = managerFor([adapter("fixture", handle())]);
      const input = {
        threadId: "pending-close",
        prompt: "earlier input",
        config: { model: "fixture-model" },
      };
      const submit = (
        kind === "direct"
          ? manager.sendThreadInput(input)
          : kind === "steer"
            ? manager.setPendingSteer(input)
            : manager.queueThreadFollowUp(input)
      ).catch((error: unknown) => error);
      await expect(prepareExecution(manager)).rejects.toThrow("runtime work");
      await submit;
      await prepareExecution(manager);
    },
  );

  it("retains an unconfirmed operation and resource custody for an explicit cancellation retry", async () => {
    const session = handle(),
      manager = managerFor([adapter("fixture", session)]),
      operationId = await prepareExecution(manager);
    await manager.controlThreadExecution({
      version: 1,
      action: "start",
      operationId,
      launch: { ...payload(), threadId: "pending-close" },
    });
    vi.mocked(session.dispose).mockRejectedValueOnce(new Error("Owned disposal failed"));
    await expect(
      manager.controlThreadExecution({ version: 1, action: "cancel", operationId }),
    ).rejects.toThrow("Owned disposal failed");
    expect(manager.hostResourceAdmission.usage().total).toBe(1);
    await expect(manager.startThread(payload())).rejects.toThrow(
      "Another client is running this thread",
    );
    await expect(
      manager.controlThreadExecution({ version: 1, action: "cancel", operationId }),
    ).resolves.toMatchObject({ confirmed: true });
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
  });

  it("keeps shutdown pending until a held controlled start and its handle actually retire", async () => {
    const entered = deferred(),
      gate = deferred(),
      disposal = deferred(),
      disposing = deferred(),
      session = handle();
    session.activate = vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(() => {
      entered.resolve();
      return gate.promise;
    });
    session.dispose = vi.fn<NonNullable<StructuredSessionHandle["dispose"]>>(() => {
      disposing.resolve();
      return disposal.promise;
    });
    const other = handle();
    const manager = managerFor([adapter("fixture", session), adapter("other", other)]),
      operationId = await prepareExecution(manager);
    await manager.startThread({ ...payload("other"), threadId: "other" });
    const start = manager.controlThreadExecution({
      version: 1,
      action: "start",
      operationId,
      launch: { ...payload(), threadId: "pending-close" },
    });
    await entered.promise;
    let stopped = false;
    const shutdown = manager.dispose().then((result) => {
      stopped = true;
      return result;
    });
    try {
      await drain();
      expect(stopped).toBe(false);
      expect(other.dispose).toHaveBeenCalledTimes(1);
      gate.resolve();
      await disposing.promise;
      await drain();
      expect(stopped).toBe(false);
      expect(manager.hostResourceAdmission.usage().total).toBe(1);
      disposal.resolve();
      await expect(shutdown).resolves.toBe(true);
      await expect(start).resolves.toMatchObject({ state: "cancelled", confirmed: true });
      expect(manager.hostResourceAdmission.usage().total).toBe(0);
    } finally {
      gate.resolve();
      disposal.resolve();
      await Promise.allSettled([start, shutdown]);
    }
  });
});

afterEach(async () => {
  for (const { manager, directory } of fixtures.splice(0)) {
    await manager.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("confirmed close of a pending start", () => {
  it.each([false, true])(
    "switches provider after confirmed disposal (open cancellation supported: %s)",
    async (supportsOpenCancellation) => {
      const entered = deferred();
      const gate = deferred();
      const disposing = deferred();
      const disposal = deferred();
      const source = handle();
      Object.assign(source, { supportsOpenCancellation });
      const target = handle();
      const next = adapter("next-fixture", target);
      const hold = async () => {
        entered.resolve();
        await gate.promise;
        return "fixture-session";
      };
      source.openThread = vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(hold);
      source.dispose = vi.fn<StructuredSessionHandle["dispose"]>(() => {
        disposing.resolve();
        return disposal.promise;
      });
      const manager = managerFor([adapter("fixture", source), next]);
      const start = manager.startThread(payload());
      await entered.promise;
      const replacement = manager.startThread({
        ...payload("next-fixture"),
        providerSwitch: { fromAgentKind: "fixture", handoffItemId: "handoff" },
      });
      try {
        await drain();
        expect(source.dispose).toHaveBeenCalledTimes(supportsOpenCancellation ? 1 : 0);
        expect(next.createStructuredSession).not.toHaveBeenCalled();
        if (!supportsOpenCancellation) {
          gate.resolve();
        }
        await disposing.promise;
        expect(next.createStructuredSession).not.toHaveBeenCalled();
        expect(manager.hostResourceAdmission.usage().total).toBe(1);
        disposal.resolve();
        await Promise.all([start, replacement]);
        expect(manager.sessions.get("pending-close")?.structuredSession).toBe(target);
        expect(source.dispose).toHaveBeenCalledOnce();
        expect(target.dispose).not.toHaveBeenCalled();
        gate.resolve();
        await drain();
        expect(manager.sessions.get("pending-close")?.structuredSession).toBe(target);
      } finally {
        gate.resolve();
        disposal.resolve();
        await Promise.allSettled([start, replacement]);
      }
    },
  );

  it("refuses a stale provider switch without cancelling a pending successor", async () => {
    const entered = deferred();
    const gate = deferred();
    const source = handle();
    source.openThread = vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(async () => {
      entered.resolve();
      await gate.promise;
      return "fixture-session";
    });
    const manager = managerFor([adapter("fixture", source), adapter("next-fixture", handle())]);
    const start = manager.startThread(payload());
    await entered.promise;
    try {
      await expect(
        manager.startThread({
          ...payload("next-fixture"),
          providerSwitch: { fromAgentKind: "old-fixture" },
        }),
      ).rejects.toThrow("Provider switch is stale");
      expect(source.dispose).not.toHaveBeenCalled();
    } finally {
      gate.resolve();
      await start;
    }
  });

  it("joins an immediately cancelled initial start without creating a handle", async () => {
    const session = handle();
    const provider = adapter("fixture", session);
    const manager = managerFor([provider]);
    const start = manager.startThread(payload());
    const close = manager.closeThreadConfirmed({ threadId: "pending-close" });
    await start;
    await expect(close).resolves.toEqual({ confirmed: true });
    expect(provider.createStructuredSession).not.toHaveBeenCalled();
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
    // Cancellation flags and the lock belong to the old attempt only.
    await manager.startThread(payload());
    expect(manager.sessions.get("pending-close")?.structuredSession).toBe(session);
  });

  it.each(
    ["creation", "activation", "open"].flatMap((phase) =>
      [false, true].map((switching) => ({ phase, switching })),
    ),
  )(
    "waits for held $phase and actual disposal (provider switch: $switching)",
    async ({ phase, switching }) => {
      const gate = deferred();
      const entered = deferred();
      const disposal = deferred();
      const disposing = deferred();
      const session = handle();
      const provider = adapter("fixture", session);
      const hold = async () => {
        entered.resolve();
        await gate.promise;
      };
      if (phase === "creation")
        provider.createStructuredSession = vi.fn<
          NonNullable<AgentAdapter["createStructuredSession"]>
        >(async () => {
          await hold();
          return session;
        });
      if (phase === "activation")
        session.activate = vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(hold);
      if (phase === "open")
        session.openThread = vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(async () => {
          await hold();
          return "fixture-session";
        });
      session.dispose = vi.fn<NonNullable<StructuredSessionHandle["dispose"]>>(() => {
        disposing.resolve();
        return disposal.promise;
      });
      const manager = managerFor([provider, adapter("predecessor", handle())]);
      if (switching) await manager.startThread(payload("predecessor"));
      const start = manager.startThread({
        ...payload(),
        ...(switching
          ? { providerSwitch: { fromAgentKind: "predecessor", handoffItemId: "handoff" } }
          : {}),
      });
      await entered.promise;
      // The pipeline itself uses this non-joining API under its start lock.
      await manager.closeThread({ threadId: "pending-close" });
      let closed = false;
      const close = manager.closeThreadConfirmed({ threadId: "pending-close" }).then((result) => {
        closed = true;
        return result;
      });
      try {
        await drain();
        expect(closed).toBe(false);
        expect(manager.hostResourceAdmission.usage().total).toBe(1);
        gate.resolve();
        await disposing.promise;
        await drain();
        expect(closed).toBe(false);
        expect(manager.hostResourceAdmission.usage().agentSessions.retiring).toBe(1);
        disposal.resolve();
        await start;
        await expect(close).resolves.toEqual({ confirmed: true });
        expect(session.dispose).toHaveBeenCalledTimes(1);
        expect(manager.sessions.size).toBe(0);
        expect(manager.hostResourceAdmission.usage().total).toBe(0);
        expect(session.openThread).toHaveBeenCalledTimes(phase === "open" ? 1 : 0);
      } finally {
        gate.resolve();
        disposal.resolve();
        await Promise.allSettled([start, close]);
      }
    },
  );

  it.each(["reject", "timeout"] as const)(
    "reports %s without speculative disposal retries or capacity release",
    async (outcome) => {
      const gate = deferred();
      const entered = deferred();
      const disposal = deferred();
      const session = handle();
      session.activate = vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(() => {
        entered.resolve();
        return gate.promise;
      });
      session.dispose = vi.fn<NonNullable<StructuredSessionHandle["dispose"]>>(
        () => disposal.promise,
      );
      const manager = managerFor([adapter("fixture", session)], {
        structuredDisposalTimeoutMs: 20,
      });
      const start = manager.startThread(payload()).catch((error: unknown) => error);
      await entered.promise;
      const close = manager.closeThreadConfirmed({ threadId: "pending-close" });
      gate.resolve();
      if (outcome === "reject") disposal.reject(new Error("cleanup failed"));
      // Install a rejection observer even before the pipeline receives the handle.
      void disposal.promise.catch(() => undefined);
      try {
        await start;
        await expect(close).resolves.toEqual({ confirmed: false });
        expect(session.dispose).toHaveBeenCalledTimes(1);
        expect(manager.sessions.size).toBe(0);
        expect(manager.hostResourceAdmission.usage()).toMatchObject({
          total: 1,
          agentSessions: { retiring: 1 },
        });
        if (outcome === "timeout") {
          disposal.resolve();
          await drain();
        } else {
          vi.mocked(session.dispose).mockResolvedValue(undefined);
        }
        expect(manager.hostResourceAdmission.usage().total).toBe(outcome === "timeout" ? 0 : 1);
        expect(session.dispose).toHaveBeenCalledTimes(1);
        // An explicit later close retains the existing cleanup retry policy.
        await expect(manager.closeThreadConfirmed({ threadId: "pending-close" })).resolves.toEqual({
          confirmed: true,
        });
        expect(manager.hostResourceAdmission.usage().total).toBe(0);
      } finally {
        disposal.resolve();
        vi.mocked(session.dispose).mockResolvedValue(undefined);
      }
    },
  );

  it.each([true, false])(
    "joins provider-switch predecessor disposal (confirmed=%s) without retrying it",
    async (confirmed) => {
      const disposal = deferred();
      const disposing = deferred();
      const predecessor = handle();
      const successor = handle();
      const next = adapter("next-fixture", successor);
      const manager = managerFor([adapter("fixture", predecessor), next]);
      await manager.startThread(payload());
      predecessor.dispose = vi.fn<NonNullable<StructuredSessionHandle["dispose"]>>(() => {
        disposing.resolve();
        return disposal.promise;
      });
      const start = manager
        .startThread({
          ...payload("next-fixture"),
          providerSwitch: { fromAgentKind: "fixture", handoffItemId: "handoff" },
        })
        .catch((error: unknown) => error);
      await disposing.promise;
      let closed = false;
      const close = manager.closeThreadConfirmed({ threadId: "pending-close" }).then((result) => {
        closed = true;
        return result;
      });
      try {
        await drain();
        expect(closed).toBe(false);
        if (confirmed) disposal.resolve();
        else disposal.reject(new Error("predecessor cleanup failed"));
        await start;
        await expect(close).resolves.toEqual({ confirmed });
        expect(next.createStructuredSession).not.toHaveBeenCalled();
        expect(predecessor.dispose).toHaveBeenCalledTimes(1);
        expect(manager.hostResourceAdmission.usage().total).toBe(confirmed ? 0 : 1);
      } finally {
        disposal.resolve();
        vi.mocked(predecessor.dispose).mockResolvedValue(undefined);
        await Promise.allSettled([start, close]);
      }
    },
  );

  it("does not retire a queued same-id successor or leak abort flags across concurrent closes", async () => {
    const gate = deferred();
    const entered = deferred();
    const first = handle();
    first.activate = vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(() => {
      entered.resolve();
      return gate.promise;
    });
    const successor = handle();
    const next = adapter("next-fixture", successor);
    const manager = managerFor([adapter("fixture", first), next]);
    const start = manager.startThread(payload());
    await entered.promise;
    // This waiter is registered before close. It must follow the extended
    // lock rather than publishing between the old start and close observation.
    const replacement = manager.startThread({
      ...payload("next-fixture"),
      providerSwitch: { fromAgentKind: "fixture", handoffItemId: "successor" },
    });
    const close = manager.closeThreadConfirmed({ threadId: "pending-close" });
    const duplicateClose = manager.closeThreadConfirmed({ threadId: "pending-close" });
    gate.resolve();
    await Promise.all([start, replacement]);
    await expect(close).resolves.toEqual({ confirmed: true });
    await expect(duplicateClose).resolves.toEqual({ confirmed: true });
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(next.createStructuredSession).toHaveBeenCalledTimes(1);
    expect(successor.dispose).not.toHaveBeenCalled();
    expect(manager.sessions.get("pending-close")?.structuredSession).toBe(successor);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1, pending: 0, retiring: 0 },
    });
  });

  it.each([true, false])(
    "reobserves a published runtime and joins its disposal (confirmed=%s)",
    async (confirmed) => {
      const disposal = deferred();
      const disposing = deferred();
      const session = handle();
      session.dispose = vi.fn<NonNullable<StructuredSessionHandle["dispose"]>>(() => {
        disposing.resolve();
        return disposal.promise;
      });
      const manager = managerFor([adapter("fixture", session)]);
      let close: ReturnType<ThreadSessionManager["closeThreadConfirmed"]> | undefined;
      let closed = false;
      session.startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(async () => {
        // Called synchronously after publication, before startThreadInner settles.
        expect(manager.sessions.get("pending-close")?.structuredSession).toBe(session);
        close = manager.closeThreadConfirmed({ threadId: "pending-close" }).then((result) => {
          closed = true;
          return result;
        });
      });
      const start = manager.startThread({ ...payload(), prompt: "fixture prompt" });
      await disposing.promise;
      try {
        await start;
        await drain();
        expect(closed).toBe(false);
        expect(manager.hostResourceAdmission.usage().total).toBe(1);
        if (confirmed) disposal.resolve();
        else disposal.reject(new Error("published cleanup failed"));
        await expect(close).resolves.toEqual({ confirmed });
        expect(session.dispose).toHaveBeenCalledTimes(1);
        expect(manager.sessions.size).toBe(0);
        expect(manager.hostResourceAdmission.usage().total).toBe(confirmed ? 0 : 1);
      } finally {
        disposal.resolve();
        vi.mocked(session.dispose).mockResolvedValue(undefined);
        await close;
      }
    },
  );

  it("keeps the close barrier after start finalization until published disposal finishes", async () => {
    const disposal = deferred();
    const disposing = deferred();
    const session = handle();
    const successor = handle();
    const next = adapter("next-fixture", successor);
    const manager = managerFor([adapter("fixture", session), next]);
    session.dispose = vi.fn<StructuredSessionHandle["dispose"]>(() => {
      disposing.resolve();
      return disposal.promise;
    });
    let close: ReturnType<ThreadSessionManager["closeThreadConfirmed"]> | undefined;
    session.startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(async () => {
      close = manager.closeThreadConfirmed({ threadId: "pending-close" });
    });
    await manager.startThread({ ...payload(), prompt: "fixture prompt" });
    await disposing.promise;
    let replaced = false;
    const replacement = manager
      .startThread({
        ...payload("next-fixture"),
        providerSwitch: { fromAgentKind: "fixture", handoffItemId: "successor" },
      })
      .then((result) => {
        replaced = true;
        return result;
      });
    // Observe rejection immediately as well, so a regression cannot cause an
    // unhandled rejection while disposal is deliberately held.
    const observedReplacement = replacement.catch((error: unknown) => error);
    try {
      await drain();
      expect(replaced).toBe(false);
      expect(next.createStructuredSession).not.toHaveBeenCalled();
      disposal.resolve();
      await expect(close).resolves.toEqual({ confirmed: true });
      await expect(observedReplacement).resolves.toEqual({ threadId: "pending-close" });
      expect(manager.sessions.get("pending-close")?.structuredSession).toBe(successor);
      expect(successor.dispose).not.toHaveBeenCalled();
      expect(manager.hostResourceAdmission.usage().total).toBe(1);
    } finally {
      disposal.resolve();
      await Promise.allSettled([close, observedReplacement]);
    }
  });
});
