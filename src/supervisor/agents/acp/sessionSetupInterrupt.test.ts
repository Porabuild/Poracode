import { expect, it, vi } from "vitest";
import { makeConfigSyncSession } from "./sessionTestFixture";

it.each(["idle", "orphan", "subagents"])(
  "does not start a provider prompt after setup Stop with prior %s work",
  async (prior) => {
    const { connection, listener, session } = makeConfigSyncSession();
    let model = "model-a";
    const options = () => [
      {
        id: "model",
        type: "select",
        category: "model",
        currentValue: model,
        options: [
          { value: "model-a", name: "Model A" },
          { value: "model-b", name: "Model B" },
        ],
      },
    ];
    connection.newSession.mockResolvedValue({
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: options(),
    });
    await session.openThread({ model });
    if (prior === "orphan") {
      session.handleSessionUpdate({
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "prior work" },
        },
      });
    }
    if (prior === "subagents") {
      connection.prompt.mockImplementationOnce(async () => {
        session.handleSessionUpdate({
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "prior-child",
            title: "Agent",
            status: "in_progress",
            rawInput: { _toolName: "task", background: true, subagent_type: "Explore" },
          },
        });
        return { stopReason: "end_turn" };
      });
      await session.startTurn("prior work", { model });
      connection.prompt.mockClear();
    }
    expect(listener.onRuntimeEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "turn.completed" }),
    );
    listener.onRuntimeEvent.mockClear();
    let release!: () => void;
    const reply = new Promise<void>((resolve) => {
      release = resolve;
    });
    connection.setSessionConfigOption.mockImplementation(async ({ value }) => {
      await reply;
      model = value;
      return { configOptions: options() };
    });
    // An idle provider has no prompt to cancel. Calling cancel before prompt
    // would acknowledge transport delivery but would not cancel the future work.
    connection.cancel.mockImplementation(async () => undefined);
    const turn = session.startTurn("must not reach provider", { model: "model-b" });
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalled());
    await session.interruptTurn();
    expect(connection.prompt).not.toHaveBeenCalled();
    release();
    await turn;
    expect(connection.prompt).not.toHaveBeenCalled();
    expect(connection.cancel).toHaveBeenCalledTimes(prior === "idle" ? 0 : 1);
    expect(listener.onRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "turn.completed", state: "cancelled" }),
    );
    expect(listener.onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ status: "idle" }));
    connection.prompt.mockImplementation(async () => {
      session.handleSessionUpdate({
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "fresh reply" },
        },
      });
      return { stopReason: "end_turn" };
    });
    await session.startTurn("fresh turn", { model: "model-b" });
    expect(connection.prompt).toHaveBeenCalledOnce();
  },
);

it("lets a fresh send run after Stop while idle", async () => {
  const { connection, listener, session } = makeConfigSyncSession();
  await session.openThread({ model: "model-a" });
  await session.interruptTurn();
  expect(connection.cancel).not.toHaveBeenCalled();
  connection.prompt.mockImplementationOnce(async () => {
    session.handleSessionUpdate({
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "fresh reply" },
      },
    });
    return { stopReason: "end_turn" };
  });
  await session.startTurn("fresh send", { model: "model-a" });
  expect(connection.prompt).toHaveBeenCalledOnce();
  expect(listener.onRuntimeEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: "turn.completed", state: "completed" }),
  );
});
