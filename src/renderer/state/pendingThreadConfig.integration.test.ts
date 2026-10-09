import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread, ThreadConfig, SendThreadInputPayload } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "@/supervisor/agents/base";
import { useAppStore } from "./appStore";
import { applyRootCatalogThreadRows } from "./managedRootCatalog/rootCatalogRows";
import { performThreadInputSubmit } from "../actions/threadRuntimeActions";
import { makeConfigSyncSession } from "@/supervisor/agents/acp/sessionTestFixture";

vi.mock("@/renderer/analytics/posthog", () => ({
  captureThreadPromptSubmitted: vi.fn<(...args: unknown[]) => void>(),
  captureThreadStarted: vi.fn<(...args: unknown[]) => void>(),
  threadProductProperties: () => ({}),
}));

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    projects: [],
    threads: [],
    view: { kind: "home" },
    pendingThreadConfigByThreadId: {},
    lastRuntimeConfigByThreadId: {},
    runtimeLaunchConfigByThreadId: {},
    threadMentionToolsAvailableByThreadId: {},
  });
});

function current(id: string): Thread {
  return useAppStore.getState().threads.find((thread) => thread.id === id)!;
}

describe("unsubmitted config intent across real ACP turn application", () => {
  it.each([
    { agentKind: "structured-one", effortId: "reasoning_level", editAt: "setup" },
    { agentKind: "structured-two", effortId: "thought-effort", editAt: "setup" },
    { agentKind: "structured-one", effortId: "reasoning_level", editAt: "checkpoint" },
  ])(
    "keeps newer High through older setup echoes and applies it on the next $agentKind turn ($editAt)",
    async ({ agentKind, effortId, editAt }) => {
      const initial: ThreadConfig = {
        model: "model-a",
        effort: "xhigh",
        mode: "agent",
        approvalPolicy: "default",
      };
      const store = useAppStore.getState();
      const project = store.addProject({ kind: "posix", path: "/fixture" });
      const thread = store.createThread({
        projectId: project.id,
        agentKind,
        config: initial,
        prompt: "start",
        presentationMode: "gui",
        suppressHostCreateIntent: true,
      });
      const { connection, listener, session } = makeConfigSyncSession({ currentConfig: initial });
      let nativeModel = "model-a",
        nativeEffort = "xhigh";
      const options = () => [
        {
          id: "model",
          category: "model",
          type: "select",
          currentValue: nativeModel,
          options: [
            { value: "model-a", name: "Model A" },
            { value: "model-b", name: "Model B" },
          ],
        },
        {
          id: effortId,
          category: "thought_level",
          type: "select",
          currentValue: nativeEffort,
          options: [
            { value: "high", name: "High" },
            { value: "xhigh", name: "Extra High" },
          ],
        },
      ];
      connection.newSession.mockResolvedValue({
        sessionId: "session-1",
        modes: { availableModes: [] },
        configOptions: options(),
      });
      listener.onUpdate.mockImplementation((value) => {
        const update = value as StructuredSessionUpdate;
        store.updateThreadRuntime(thread.id, { ...update, agentKind, canResumeWithConfig: true });
      });
      await session.openThread(initial);
      connection.prompt.mockImplementation(async () => {
        session.handleSessionUpdate({
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "fixture reply" },
          },
        });
        return { stopReason: "end_turn" };
      });
      let releaseModel!: () => void;
      const modelReply = new Promise<void>((resolve) => {
        releaseModel = resolve;
      });
      connection.setSessionConfigOption.mockImplementation(async ({ configId, value }) => {
        if (configId === "model") {
          await modelReply;
          nativeModel = value;
        }
        if (configId === effortId) nativeEffort = value;
        return { configOptions: options() };
      });
      const transport = {
        sendThreadInput: vi.fn<(payload: SendThreadInputPayload) => Promise<void>>(
          async (payload) => {
            await session.startTurn(payload.prompt, payload.config);
          },
        ),
      };
      store.updateThreadConfig(thread.id, { ...initial, model: "model-b" });
      let releaseCheckpoint!: () => void;
      const checkpoint = new Promise<void>((resolve) => {
        releaseCheckpoint = resolve;
      });
      const captureCheckpoint = vi.fn<() => Promise<void>>(async () => checkpoint);
      const setup = performThreadInputSubmit({
        thread: current(thread.id),
        prompt: "old setup",
        transport,
        ...(editAt === "checkpoint" ? { captureCheckpoint } : {}),
      });
      expect(captureCheckpoint).toHaveBeenCalledTimes(editAt === "checkpoint" ? 1 : 0);
      if (editAt === "checkpoint") {
        store.updateThreadConfig(thread.id, { ...current(thread.id).config, effort: "high" });
        releaseCheckpoint();
      }
      await vi.waitFor(() =>
        expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
          sessionId: "session-1",
          configId: "model",
          value: "model-b",
        }),
      );
      if (editAt === "setup")
        store.updateThreadConfig(thread.id, { ...current(thread.id).config, effort: "high" });
      expect(current(thread.id).config.effort).toBe("high");
      expect(transport.sendThreadInput).toHaveBeenCalledWith(
        expect.objectContaining({ config: expect.objectContaining({ effort: "xhigh" }) }),
      );
      releaseModel();
      await setup;
      expect(nativeEffort).toBe("xhigh"); // Older turn's acknowledgement remains truthful.
      expect(current(thread.id).config.effort).toBe("high");
      expect(useAppStore.getState().lastRuntimeConfigByThreadId[thread.id]?.effort).toBe("xhigh");
      // Host persistence/page refresh carries the old confirmed config, not the
      // unsubmitted UI edit. It must preserve the newer edit and durable fields.
      applyRootCatalogThreadRows(
        [{ ...current(thread.id), title: "Host title", config: { ...initial, model: "model-b" } }],
        new Set(),
      );
      expect(current(thread.id)).toMatchObject({
        title: "Host title",
        config: { model: "model-b", effort: "high" },
      });
      connection.setSessionConfigOption.mockClear();
      await performThreadInputSubmit({ thread: current(thread.id), prompt: "new turn", transport });
      expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
        sessionId: "session-1",
        configId: effortId,
        value: "high",
      });
      expect(nativeEffort).toBe("high");
      expect((session as unknown as { currentConfig: ThreadConfig }).currentConfig.effort).toBe(
        "high",
      );
      expect(current(thread.id).config.effort).toBe("high");
      expect(useAppStore.getState().pendingThreadConfigByThreadId[thread.id]).toBeUndefined();
    },
  );
});

it("adopts the actual native effort echo when a submitted edit has no newer successor", async () => {
  const initial: ThreadConfig = { model: "model-a", effort: "xhigh" };
  const store = useAppStore.getState();
  const thread = store.createThread({
    projectId: "fixture",
    agentKind: "structured-example",
    config: initial,
    prompt: "Fixture",
    presentationMode: "gui",
    suppressHostCreateIntent: true,
  });
  const { connection, listener, session } = makeConfigSyncSession({ currentConfig: initial });
  const options = [
    {
      id: "model",
      type: "select",
      category: "model",
      currentValue: "model-a",
      options: [{ value: "model-a", name: "Model A" }],
    },
    {
      id: "reasoning",
      type: "select",
      category: "thought_level",
      currentValue: "xhigh",
      options: [
        { value: "high", name: "High" },
        { value: "xhigh", name: "Extra High" },
      ],
    },
  ];
  connection.newSession.mockResolvedValue({
    sessionId: "session-1",
    modes: { availableModes: [] },
    configOptions: options,
  });
  // The supervisor publishes its retained confirmed config with status updates;
  // unchanged native state still reaches the renderer even without a new setter echo.
  let confirmed = initial;
  listener.onUpdate.mockImplementation((value) => {
    const update = value as StructuredSessionUpdate;
    confirmed = update.config ?? confirmed;
    store.updateThreadRuntime(thread.id, {
      ...update,
      config: confirmed,
      canResumeWithConfig: true,
    });
  });
  await session.openThread(initial);
  connection.setSessionConfigOption.mockResolvedValue({ configOptions: options }); // Provider did not accept High.
  const transport = {
    sendThreadInput: vi.fn<(payload: SendThreadInputPayload) => Promise<void>>(async (payload) =>
      session.startTurn(payload.prompt, payload.config),
    ),
  };
  store.updateThreadConfig(thread.id, { ...initial, effort: "high" });
  await performThreadInputSubmit({ thread: current(thread.id), prompt: "submitted", transport });
  expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
    sessionId: "session-1",
    configId: "reasoning",
    value: "high",
  });
  expect(current(thread.id).config.effort).toBe("xhigh");
  expect((session as unknown as { currentConfig: ThreadConfig }).currentConfig.effort).toBe(
    "xhigh",
  );
  await performThreadInputSubmit({ thread: current(thread.id), prompt: "next", transport });
  expect(transport.sendThreadInput.mock.calls[1]?.[0].config.effort).toBe("xhigh");
});
