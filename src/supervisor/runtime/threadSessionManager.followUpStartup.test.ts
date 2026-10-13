import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import type {
  AgentAdapter,
  StructuredSessionHandle,
  StructuredSessionListener,
} from "../agents/base";
import { ThreadSessionManager } from "./threadSessionManager";

vi.mock("node-pty", () => ({ spawn: vi.fn<() => never>() }));

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function createHarness() {
  let listener!: StructuredSessionListener;
  const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>();
  const dispose = vi.fn<StructuredSessionHandle["dispose"]>(async () => {});
  const structured: StructuredSessionHandle = {
    launchOptions: {},
    setListener: (next) => {
      listener = next;
    },
    openThread: async () => "saved-session",
    startTurn,
    interruptTurn: async () => listener.onUpdate({ status: "idle", attention: "none" }),
    dispose,
  };
  const adapter = {
    kind: "fixture-agent",
    label: "Fixture Agent",
    capabilities: {
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      supportsResume: true,
      supportsDirectInput: true,
      models: [],
      efforts: [],
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      settingDefs: [],
    },
    createStructuredSession: async () => structured,
  } as unknown as AgentAdapter;
  const root = mkdtempSync(join(tmpdir(), "poracode-follow-up-startup-"));
  const events: SupervisorEvent[] = [];
  const manager = new ThreadSessionManager({
    emit: (event) => events.push(event),
    isDev: false,
    logsDir: join(root, "logs"),
    settingsPath: join(root, "settings.json"),
    adapters: new Map([[adapter.kind, adapter]]),
    readDisableCliHookPlugin: () => false,
    resolveWindowsShell: () => ({ shell: "powershell.exe", kind: "powershell", args: [] }),
  });
  cleanups.push(async () => {
    await manager.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  await manager.startThread({
    threadId: "follow-up-startup",
    agentKind: adapter.kind,
    projectLocation: { kind: "windows", path: "C:\\fixture" },
    config: { model: "saved-model" },
    sessionRef: { providerSessionId: "saved-session", discoveredAt: "2026-10-08T00:00:00Z" },
    initialSize: { cols: 80, rows: 24 },
    presentationMode: "gui",
    prompt: "",
  });
  events.length = 0;
  const session = manager.sessions.get("follow-up-startup")!;
  return {
    manager,
    session,
    get listener() {
      return listener;
    },
    startTurn,
    dispose,
    events,
  };
}

it.each(["direct", "queued", "restarted"] as const)(
  "keeps a %s follow-up working through settings sync on a saved GUI session",
  async (delivery) => {
    const harness = await createHarness();
    const { manager, startTurn, events } = harness;
    let session = harness.session;
    if (delivery === "restarted") {
      harness.listener.onClose();
      events.length = 0;
    }
    const configSync = Promise.withResolvers<void>();
    startTurn.mockImplementation(async (_prompt, config) => {
      // Providers can publish metadata with their old idle status before a
      // turn exists. The supervisor must preserve the optimistic working edge.
      harness.listener.onUpdate({ status: "idle", attention: "none", config });
      await configSync.promise;
      harness.listener.onUpdate({ status: "idle", attention: "none", config });
      harness.listener.onRuntimeEvent?.({
        type: "turn.started",
        threadId: session.threadId,
        turnId: "reply",
      });
      harness.listener.onUpdate({ status: "working", attention: "working" });
    });
    let submitting: Promise<void> | undefined;
    try {
      const payload = {
        threadId: session.threadId,
        prompt: "follow-up",
        config: { model: "new-model" },
      };
      if (delivery === "queued") await manager.queueThreadFollowUp(payload);
      else submitting = manager.sendThreadInput({ ...payload, userMessageItemId: "user-origin" });
      await vi.waitFor(() => expect(startTurn).toHaveBeenCalledOnce());
      session = manager.sessions.get(session.threadId)!;
      expect(session.status).toBe("working");
      expect(session.attention).toBe("working");
      expect(session.config).toEqual(payload.config);
      expect(
        events.filter((event) => event.type === "thread-state").map((event) => event.status),
      ).not.toContain("idle");
      const rowIds = events.flatMap((event) =>
        event.type === "thread-runtime-event" &&
        event.event.type === "item.started" &&
        event.event.itemType === "user_message"
          ? [event.event.itemId]
          : [],
      );
      // Restart reuses the originating renderer's already-painted row.
      const submittedItemId = startTurn.mock.calls[0]?.[3]?.userMessageItemId;
      expect(rowIds).toHaveLength(delivery === "restarted" ? 0 : 1);
      expect(submittedItemId).toBe(delivery === "queued" ? rowIds[0] : "user-origin");
      expect(rowIds[0]).toBe(delivery === "restarted" ? undefined : submittedItemId);

      configSync.resolve();
      await submitting;
      await vi.waitFor(() => expect(session.suppressInitialStructuredIdle).toBeUndefined());
      expect(
        events.filter((event) => event.type === "thread-state").map((event) => event.status),
      ).not.toContain("idle");
      harness.listener.onRuntimeEvent?.({
        type: "turn.completed",
        threadId: session.threadId,
        turnId: "reply",
        state: "completed",
      });
      harness.listener.onUpdate({ status: "idle", attention: "none" });
      expect(session.status).toBe("idle");
    } finally {
      configSync.resolve();
      await submitting;
    }
  },
);

it("settles a failed follow-up instead of leaving the optimistic timer running", async () => {
  const { manager, session, startTurn, events } = await createHarness();
  startTurn.mockRejectedValue(new Error("admission rejected"));
  await manager.sendThreadInput({
    threadId: session.threadId,
    prompt: "follow-up",
    config: session.config,
  });
  await vi.waitFor(() => expect(session.status).toBe("error"));
  expect(
    events.some(
      (event) =>
        event.type === "thread-state" &&
        event.status === "error" &&
        event.errorMessage === "admission rejected",
    ),
  ).toBe(true);
});

it.each([false, true])("settles a turnless command (restart: %s)", async (restart) => {
  const harness = await createHarness();
  const { manager, startTurn } = harness;
  let session = harness.session;
  if (restart) harness.listener.onClose();
  startTurn.mockImplementation(async () => {
    harness.listener.onUpdate({ status: "idle", attention: "none" });
    return { outcome: "completed-without-turn" };
  });
  await manager.sendThreadInput({
    threadId: session.threadId,
    prompt: "/status",
    config: session.config,
  });
  session = manager.sessions.get(session.threadId)!;
  await vi.waitFor(() => expect(session.status).toBe("idle"));
  expect(session.suppressInitialStructuredIdle).toBeUndefined();
});

it.each(["initial", "restarted"] as const)(
  "dispatches the FIFO after a %s command completes without a turn",
  async (delivery) => {
    const harness = await createHarness();
    const { manager, startTurn } = harness;
    const session = harness.session;
    const command = Promise.withResolvers<void>();
    startTurn
      .mockImplementationOnce(async () => {
        await command.promise;
        harness.listener.onUpdate({ status: "idle", attention: "none" });
        return { outcome: "completed-without-turn" };
      })
      .mockImplementation(async () => {
        harness.listener.onUpdate({ status: "working", attention: "working" });
      });
    let submitting: Promise<unknown> | undefined;
    try {
      const payload = { threadId: session.threadId, prompt: "/status", config: session.config };
      if (delivery === "initial")
        submitting = manager.startThread({
          ...payload,
          agentKind: session.agentKind,
          projectLocation: session.projectLocation,
          sessionRef: session.sessionRef!,
          presentationMode: "gui",
          initialSize: { cols: 80, rows: 24 },
        });
      else {
        harness.listener.onClose();
        submitting = manager.sendThreadInput(payload);
      }
      await vi.waitFor(() => expect(startTurn).toHaveBeenCalledOnce());
      await manager.queueThreadFollowUp({ ...payload, prompt: "queued after command" });
      expect(startTurn).toHaveBeenCalledOnce();
      command.resolve();
      await submitting;
      await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(2));
      expect(startTurn.mock.calls[1]?.[0]).toBe("queued after command");
    } finally {
      command.resolve();
      await submitting;
    }
  },
);

it.each(["direct", "queued", "initial", "restarted"] as const)(
  "retires %s startup on Stop before delayed admission",
  async (delivery) => {
    const harness = await createHarness();
    const { manager, startTurn, dispose, events } = harness;
    let session = harness.session;
    if (delivery === "restarted") harness.listener.onClose();
    const admission = Promise.withResolvers<void>();
    let admitted = false;
    startTurn.mockImplementation(async () => {
      await admission.promise;
      admitted = true;
    });
    let submitting: Promise<unknown> | undefined;
    try {
      const payload = { threadId: session.threadId, prompt: "follow-up", config: session.config };
      if (delivery === "queued") await manager.queueThreadFollowUp(payload);
      else if (delivery === "initial")
        submitting = manager.startThread({
          ...payload,
          agentKind: session.agentKind,
          projectLocation: session.projectLocation,
          sessionRef: session.sessionRef!,
          presentationMode: "gui",
          initialSize: { cols: 80, rows: 24 },
        });
      else submitting = manager.sendThreadInput(payload);
      await vi.waitFor(() => expect(startTurn).toHaveBeenCalledOnce());
      session = manager.sessions.get(session.threadId)!;
      expect(session.status).toBe("working");
      dispose.mockImplementation(async () => {
        admission.reject(new Error("transport closed during configuration"));
      });
      await manager.interruptThread({ threadId: session.threadId });
      harness.listener.onUpdate({ status: "idle", attention: "none", config: session.config });
      await submitting;
      await vi.waitFor(() => expect(dispose).toHaveBeenCalled());
      expect(session.status).toBe("idle");
      expect(session.structuredSession).toBeUndefined();
      expect(session.ignoreExit).toBe(true);
      expect(admitted).toBe(false);
      expect(events.filter((event) => event.type === "thread-state").at(-1)).toMatchObject({
        status: "idle",
        forceCloseActiveTurn: true,
      });
      const queue = manager.getThreadFollowUpQueue(session.threadId);
      expect(queue?.items.map((item) => item.prompt) ?? []).toEqual(
        delivery === "queued" ? ["follow-up"] : [],
      );
      expect(queue?.paused).toBe(delivery === "queued" ? true : undefined);
    } finally {
      admission.resolve();
      await submitting;
    }
  },
);
