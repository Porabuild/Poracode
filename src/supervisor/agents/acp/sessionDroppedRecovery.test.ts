import { RequestError } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import { makeConfigSyncSession } from "./sessionTestFixture";

function modelConfigOptions(currentModel: string, currentEffort: string) {
  return [
    {
      id: "model",
      category: "model",
      type: "select",
      currentValue: currentModel,
      options: [
        { value: "model-a", name: "Model A" },
        { value: "model-b", name: "Model B" },
      ],
    },
    {
      id: "thinking_level",
      category: "thought_level",
      type: "select",
      currentValue: currentEffort,
      options: [
        { value: "low", name: "Low" },
        { value: "medium", name: "Medium" },
        { value: "high", name: "High" },
      ],
    },
    {
      id: "mode",
      category: "mode",
      type: "select",
      currentValue: "default",
      options: [
        { value: "default", name: "Default" },
        { value: "yolo", name: "YOLO" },
      ],
    },
  ];
}

function isDroppedError(error: unknown): boolean {
  if (error instanceof RequestError && error.code === -32002) return true;
  const text =
    error instanceof RequestError
      ? `${error.message} ${String((error.data as { details?: unknown } | undefined)?.details ?? "")}`
      : error instanceof Error
        ? error.message
        : String(error);
  return /dropped live session|session not found/i.test(text);
}

describe("ACP dropped-session recovery", () => {
  it("reopens via session/resume, reapplies the changed model/effort, and retries the prompt once", async () => {
    const { connection, listener, session } = makeConfigSyncSession({
      agentSessionCapabilities: { resume: {} },
      isDroppedSessionError: isDroppedError,
    });

    let activeModel = "model-a";
    let activeEffort = "high";
    connection.newSession.mockResolvedValueOnce({
      sessionId: "session-1",
      modes: { availableModes: [{ id: "default" }, { id: "yolo" }] },
      configOptions: modelConfigOptions(activeModel, activeEffort),
    });
    connection.resumeSession.mockImplementationOnce(async () => {
      activeModel = "model-a";
      activeEffort = "high";
      return {
        modes: { currentModeId: "default", availableModes: [{ id: "default" }, { id: "yolo" }] },
        configOptions: modelConfigOptions(activeModel, activeEffort),
      };
    });
    connection.setSessionConfigOption.mockImplementation(async ({ configId, value }) => {
      if (configId === "model") activeModel = value;
      if (configId === "thinking_level") activeEffort = value;
      return { configOptions: modelConfigOptions(activeModel, activeEffort) };
    });

    await session.openThread({
      model: "model-a",
      effort: "high",
      mode: "agent",
      approvalPolicy: "default",
    });

    const onPromptSubmitted = vi.fn<() => void>();
    connection.prompt
      .mockRejectedValueOnce(
        new RequestError(-32603, "Internal error", {
          details: "dropped live session during model switch",
        }),
      )
      .mockImplementationOnce(async () => {
        session.handleSessionUpdate({
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Recovered reply on model-b" },
          },
        });
        return { stopReason: "end_turn" };
      });

    await session.startTurn(
      "retry with model-b",
      { model: "model-b", effort: "medium", mode: "agent", approvalPolicy: "default" },
      undefined,
      { onPromptSubmitted },
    );

    expect(connection.resumeSession).toHaveBeenCalledTimes(1);
    expect(connection.resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1" }),
    );
    expect(connection.prompt).toHaveBeenCalledTimes(2);
    expect(activeModel).toBe("model-b");
    expect(activeEffort).toBe("medium");
    expect(onPromptSubmitted).toHaveBeenCalledTimes(1);
    expect(listener.onClose).not.toHaveBeenCalled();

    const runtimeEvents = listener.onRuntimeEvent.mock.calls.map(
      ([event]) => event as { type: string; state?: string; delta?: string; itemType?: string },
    );
    expect(runtimeEvents.filter((event) => event.type === "error")).toEqual([]);
    expect(runtimeEvents.filter((event) => event.type === "turn.started")).toHaveLength(1);
    expect(
      runtimeEvents.filter(
        (event) => event.type === "item.started" && event.itemType === "user_message",
      ),
    ).toHaveLength(1);
    expect(
      runtimeEvents.some(
        (event) => event.type === "content.delta" && event.delta === "Recovered reply on model-b",
      ),
    ).toBe(true);
    expect(
      runtimeEvents.filter(
        (event) => event.type === "turn.completed" && event.state === "completed",
      ),
    ).toHaveLength(1);
  });

  it("falls back to session/load when resume capability is absent", async () => {
    const { connection, listener, session } = makeConfigSyncSession({
      agentLoadSession: true,
      isDroppedSessionError: isDroppedError,
    });

    connection.loadSession.mockResolvedValueOnce({
      modes: { availableModes: [{ id: "default" }] },
      configOptions: modelConfigOptions("model-a", "low"),
    });
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: modelConfigOptions("model-b", "medium"),
    });
    connection.prompt
      .mockRejectedValueOnce(new Error("Session not found: session-1"))
      .mockResolvedValueOnce({ stopReason: "end_turn" });

    await session.startTurn("hello", { model: "model-b", effort: "medium" });

    expect(connection.resumeSession).not.toHaveBeenCalled();
    expect(connection.loadSession).toHaveBeenCalledTimes(1);
    expect(connection.prompt).toHaveBeenCalledTimes(2);
    expect(listener.onClose).not.toHaveBeenCalled();
  });

  it("surfaces the error and retires the handle when reopening fails", async () => {
    const { connection, listener, session } = makeConfigSyncSession({
      agentSessionCapabilities: { resume: {} },
      isDroppedSessionError: isDroppedError,
    });

    connection.prompt.mockRejectedValueOnce(
      new RequestError(-32603, "Internal error", {
        details: "dropped live session during model switch",
      }),
    );
    connection.resumeSession.mockRejectedValueOnce(new Error("resume failed"));

    await session.startTurn("hello", { model: "model-b" });

    expect(connection.resumeSession).toHaveBeenCalledTimes(1);
    expect(connection.prompt).toHaveBeenCalledTimes(1);
    expect(listener.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        attention: "error",
        errorMessage: "dropped live session during model switch",
      }),
    );
    expect(listener.onClose).toHaveBeenCalledTimes(1);
    expect(listener.onError).not.toHaveBeenCalled();
  });

  it("retires the handle when the retried prompt still fails with a dropped-session error", async () => {
    const { connection, listener, session } = makeConfigSyncSession({
      agentSessionCapabilities: { resume: {} },
      isDroppedSessionError: isDroppedError,
    });

    connection.resumeSession.mockResolvedValueOnce({
      modes: { availableModes: [] },
      configOptions: [],
    });
    connection.prompt
      .mockRejectedValueOnce(new Error("dropped live session"))
      .mockRejectedValueOnce(new Error("Session not found: session-1"));

    await session.startTurn("hello", { model: "model-b" });

    expect(connection.resumeSession).toHaveBeenCalledTimes(1);
    expect(connection.prompt).toHaveBeenCalledTimes(2);
    expect(listener.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        attention: "error",
        errorMessage: "Session not found: session-1",
      }),
    );
    expect(listener.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not auto-retry after partial output arrived, and retires the broken handle", async () => {
    const { connection, listener, session } = makeConfigSyncSession({
      agentSessionCapabilities: { resume: {} },
      isDroppedSessionError: isDroppedError,
    });

    connection.prompt.mockImplementationOnce(async () => {
      session.handleSessionUpdate({
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "partial output" },
        },
      });
      throw new Error("Session not found: session-1");
    });

    await session.startTurn("hello", { model: "model-b" });

    expect(connection.resumeSession).not.toHaveBeenCalled();
    expect(connection.prompt).toHaveBeenCalledTimes(1);
    expect(listener.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        attention: "error",
        errorMessage: "Session not found: session-1",
      }),
    );
    expect(listener.onClose).toHaveBeenCalledTimes(1);
  });

  it("cancels cleanly without retrying if interrupted while reopening a dropped session", async () => {
    const { connection, listener, session } = makeConfigSyncSession({
      agentSessionCapabilities: { resume: {} },
      isDroppedSessionError: isDroppedError,
    });

    let resolveResume!: (value: {
      modes: { availableModes: Array<{ id: string }> };
      configOptions: unknown[];
    }) => void;
    connection.resumeSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveResume = resolve;
        }),
    );
    connection.prompt.mockRejectedValueOnce(new Error("dropped live session"));

    const turn = session.startTurn("hello", { model: "model-b" });
    await vi.waitFor(() => expect(connection.resumeSession).toHaveBeenCalledTimes(1));

    await session.interruptTurn();
    resolveResume({ modes: { availableModes: [] }, configOptions: [] });
    await turn;

    expect(connection.prompt).toHaveBeenCalledTimes(1);
    expect(listener.onClose).not.toHaveBeenCalled();
    const completed = listener.onRuntimeEvent.mock.calls
      .map(([event]) => event as { type: string; state?: string })
      .filter((event) => event.type === "turn.completed");
    expect(completed).toEqual([
      expect.objectContaining({ type: "turn.completed", state: "cancelled" }),
    ]);
  });

  it("disposes the dead handle before surfacing error and onClose when recovery fails", async () => {
    const { connection, listener, session } = makeConfigSyncSession({
      agentSessionCapabilities: { resume: {} },
      isDroppedSessionError: isDroppedError,
    });

    const events: string[] = [];
    const originalDispose = session.dispose.bind(session);
    session.dispose = vi.fn<() => Promise<void>>(async () => {
      events.push("dispose:start");
      await originalDispose();
      events.push("dispose:end");
    });
    listener.onUpdate.mockImplementation((update) => {
      const status = (update as { status?: string }).status;
      if (status === "error") events.push("update:error");
    });
    listener.onClose.mockImplementation(() => {
      events.push("close");
    });

    connection.prompt.mockRejectedValueOnce(new Error("dropped live session"));
    connection.resumeSession.mockRejectedValueOnce(new Error("resume failed"));

    await session.startTurn("hello", { model: "model-b" });

    expect(events).toEqual(["dispose:start", "dispose:end", "update:error", "close"]);
  });

  it("recovers under strictConfigSelection when setSessionConfigOption reports a dropped session", async () => {
    const { connection, listener, session } = makeConfigSyncSession({
      agentSessionCapabilities: { resume: {} },
      behavior: { strictConfigSelection: true },
      isDroppedSessionError: isDroppedError,
    });

    let activeModel = "model-a";
    let activeEffort = "low";
    connection.newSession.mockResolvedValueOnce({
      sessionId: "session-1",
      modes: { availableModes: [{ id: "default" }] },
      configOptions: modelConfigOptions(activeModel, activeEffort),
    });
    await session.openThread({
      model: "model-a",
      effort: "low",
      mode: "agent",
      approvalPolicy: "default",
    });

    connection.setSessionConfigOption
      .mockRejectedValueOnce(
        new RequestError(-32002, "Resource not found", { uri: "session session-1" }),
      )
      .mockImplementation(async ({ configId, value }) => {
        if (configId === "model") activeModel = value;
        if (configId === "thinking_level") activeEffort = value;
        return { configOptions: modelConfigOptions(activeModel, activeEffort) };
      });
    connection.resumeSession.mockResolvedValueOnce({
      modes: { currentModeId: "default", availableModes: [{ id: "default" }] },
      configOptions: modelConfigOptions("model-a", "low"),
    });
    connection.prompt.mockResolvedValueOnce({ stopReason: "end_turn" });

    await session.startTurn("hello", {
      model: "model-b",
      effort: "medium",
      mode: "agent",
      approvalPolicy: "default",
    });

    expect(connection.resumeSession).toHaveBeenCalledTimes(1);
    expect(connection.prompt).toHaveBeenCalledTimes(1);
    expect(activeModel).toBe("model-b");
    expect(activeEffort).toBe("medium");
    expect(listener.onClose).not.toHaveBeenCalled();
  });
});
