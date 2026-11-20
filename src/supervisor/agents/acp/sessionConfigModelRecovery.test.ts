import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import { AcpSessionConfigSync } from "./sessionConfigSync";
import { makeConfigSyncSession } from "./sessionTestFixture";

const selected: ThreadConfig = { model: "model-b", effort: "high" };

function options(model: string, effort = "low", models = ["model-a", "model-b"]) {
  return [
    {
      id: "model",
      category: "model",
      type: "select",
      currentValue: model,
      options: models.map((value) => ({ value, name: value })),
    },
    {
      id: "thought_level",
      category: "thought_level",
      type: "select",
      currentValue: effort,
      options: ["low", "high"].map((value) => ({ value, name: value })),
    },
  ];
}

function fixture() {
  // A pre-upgrade persisted selection can already match the user's choice
  // even though the resumed provider session restores a different model.
  const result = makeConfigSyncSession({
    currentConfig: selected,
    behavior: { strictConfigSelection: true },
  });
  const live = result.session as unknown as {
    sessionConfigSync: AcpSessionConfigSync;
    sessionGeneration: number;
    currentConfig: ThreadConfig;
  };
  live.sessionConfigSync.rememberOptions([], options("model-a"));
  return { ...result, live };
}

afterEach(() => vi.useRealTimers());

describe("model selection recovery before a prompt", () => {
  it("reapplies a saved choice when the resumed native model differs", async () => {
    const { session, connection, live } = fixture();
    connection.setSessionConfigOption.mockImplementation(async ({ configId }) => ({
      configOptions: options("model-b", configId === "thought_level" ? "high" : "low"),
    }));

    await session.startTurn("marker", selected);

    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
      "thought_level",
    ]);
    expect(live.currentConfig).toMatchObject(selected);
    expect(connection.prompt).toHaveBeenCalledOnce();
  });

  it("retries an unchanged model echo once and reapplies its reasoning level before prompting", async () => {
    const { session, connection, live } = fixture();
    connection.setSessionConfigOption
      .mockResolvedValueOnce({ configOptions: options("model-a") })
      .mockResolvedValueOnce({ configOptions: options("model-b") })
      .mockResolvedValueOnce({ configOptions: options("model-b", "high") });

    await session.startTurn("marker", selected);

    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.value)).toEqual([
      "model-b",
      "model-b",
      "high",
    ]);
    expect(connection.setSessionConfigOption.mock.invocationCallOrder.at(-1)).toBeLessThan(
      connection.prompt.mock.invocationCallOrder[0]!,
    );
    expect(connection.prompt).toHaveBeenCalledOnce();
    expect(live.currentConfig).toMatchObject(selected);
  });

  it("detects a model reverted by a dependent setter and restores the full selection", async () => {
    const { session, connection, live } = fixture();
    connection.setSessionConfigOption
      .mockResolvedValueOnce({ configOptions: options("model-b") })
      .mockResolvedValueOnce({ configOptions: options("model-a", "high") })
      .mockResolvedValueOnce({ configOptions: options("model-b") })
      .mockResolvedValueOnce({ configOptions: options("model-b", "high") });

    await session.startTurn("marker", selected);

    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
      "thought_level",
      "model",
      "thought_level",
    ]);
    expect(live.currentConfig).toMatchObject(selected);
    expect(connection.prompt).toHaveBeenCalledOnce();
  });

  it("keeps recovery bounded when dependent settings repeatedly revert the model", async () => {
    const { session, connection } = fixture();
    connection.setSessionConfigOption.mockImplementation(async ({ configId }) => ({
      configOptions: options(
        configId === "model" ? "model-b" : "model-a",
        configId === "thought_level" ? "high" : "low",
      ),
    }));

    await expect(session.startTurn("must not run", selected)).rejects.toMatchObject({
      name: "AcpConfigSelectionError",
      confirmedConfig: { model: "model-a", effort: "high" },
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(4);
    expect(connection.prompt).not.toHaveBeenCalled();
  });

  it("rejects an unavailable model before changing the native session", async () => {
    const { session, connection, live } = fixture();
    live.sessionConfigSync.rememberOptions([], options("model-a", "low", ["model-a"]));

    await expect(session.startTurn("must not run", selected)).rejects.toMatchObject({
      name: "AcpConfigSelectionError",
    });
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    expect(connection.request).not.toHaveBeenCalled();
    expect(connection.prompt).not.toHaveBeenCalled();
  });

  it("fails without prompting when the model still differs after recovery", async () => {
    const { session, connection, live } = fixture();
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: options("model-a"),
    });

    await expect(session.startTurn("must not run", selected)).rejects.toMatchObject({
      name: "AcpConfigSelectionError",
      confirmedConfig: { model: "model-a", effort: "low" },
    });

    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(2);
    expect(connection.prompt).not.toHaveBeenCalled();
    expect(live.currentConfig).toMatchObject({ model: "model-a", effort: "low" });
  });

  it("does not retry a model that the agent removes from its menu", async () => {
    const { session, connection } = fixture();
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: options("model-a", "low", ["model-a"]),
    });

    await expect(session.startTurn("must not run", selected)).rejects.toMatchObject({
      name: "AcpConfigSelectionError",
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledOnce();
    expect(connection.prompt).not.toHaveBeenCalled();
  });

  it("does not retry an explicit provider rejection", async () => {
    const { session, connection } = fixture();
    const refusal = new Error("model access denied");
    connection.setSessionConfigOption.mockRejectedValue(refusal);

    await expect(session.startTurn("must not run", selected)).rejects.toMatchObject({
      name: "AcpConfigSelectionError",
      cause: refusal,
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledOnce();
    expect(connection.prompt).not.toHaveBeenCalled();
  });

  it("does not retry an unknown outcome after the confirmation times out", async () => {
    vi.useFakeTimers();
    const { session, connection } = fixture();
    connection.setSessionConfigOption.mockResolvedValue(undefined);
    const result = session.startTurn("must not run", selected).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toMatchObject({ name: "AcpConfigSelectionError" });
    expect(connection.setSessionConfigOption).toHaveBeenCalledOnce();
    expect(connection.prompt).not.toHaveBeenCalled();
  });

  it("does not retry a configuration belonging to a retired session incarnation", async () => {
    const { session, connection, live } = fixture();
    connection.setSessionConfigOption.mockImplementation(async () => {
      live.sessionGeneration = (live.sessionGeneration ?? 0) + 1;
      return { configOptions: options("model-a") };
    });

    await expect(session.startTurn("must not run", selected)).rejects.toMatchObject({
      name: "AcpConfigApplicationRetiredError",
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledOnce();
    expect(connection.prompt).not.toHaveBeenCalled();
  });
});
