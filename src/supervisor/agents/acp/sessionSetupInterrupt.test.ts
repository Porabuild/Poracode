import { expect, it, vi } from "vitest";
import { makeConfigSyncSession } from "./sessionTestFixture";

it("does not start a provider prompt when Stop arrives during awaited model setup", async () => {
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
  expect(connection.cancel).not.toHaveBeenCalled();
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
});
