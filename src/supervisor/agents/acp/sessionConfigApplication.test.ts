import type { ThreadConfig } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import { AcpConfigApplicationRetiredError } from "./sessionConfigOwnership";
import type { AcpSessionConfigSync } from "./sessionConfigSync";
import { makeConfigSyncSession } from "./sessionTestFixture";

type InternalConfigSession = {
  sessionId: string;
  sessionGeneration: number;
  currentConfig: ThreadConfig;
  sessionConfigSync: AcpSessionConfigSync;
  applyCurrentConfig(config: ThreadConfig): Promise<void>;
  steerRunningTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: unknown,
    options?: unknown,
  ): Promise<void>;
};

function modelOption(currentValue: string) {
  return {
    id: "model",
    category: "model",
    type: "select",
    currentValue,
    options: ["old", "next", "successor"].map((value) => ({ value, name: value })),
  };
}

function makeInternalConfigSession(overrides: Parameters<typeof makeConfigSyncSession>[0] = {}) {
  const result = makeConfigSyncSession({
    currentConfig: { model: "old" },
    ...overrides,
  });
  const live = result.session as unknown as InternalConfigSession;
  live.sessionId = "reused-native-id";
  live.sessionGeneration = 1;
  live.sessionConfigSync.rememberOptions([], [modelOption("old")]);
  return { ...result, live };
}

describe("structured session configuration application", () => {
  it("captures generation before waiting for the shared writer", async () => {
    const { connection, live } = makeInternalConfigSession();
    const lease = live.sessionConfigSync.configWrites.tryAcquire()!;
    const pending = live.applyCurrentConfig({ model: "next" }).catch((error: unknown) => error);
    live.sessionGeneration += 1;
    live.currentConfig = { model: "successor" };
    lease.release();
    await expect(pending).resolves.toBeInstanceOf(AcpConfigApplicationRetiredError);
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    expect(live.currentConfig).toEqual({ model: "successor" });
  });

  it("does not commit a retired config reply to the session that reused its native id", async () => {
    const { connection, live } = makeInternalConfigSession();
    let resolveWrite!: (reply: { configOptions: unknown[] }) => void;
    connection.setSessionConfigOption.mockReturnValue(
      new Promise((resolve) => {
        resolveWrite = resolve;
      }),
    );
    const pending = live.applyCurrentConfig({ model: "next" }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());
    live.sessionGeneration += 1;
    live.currentConfig = { model: "successor" };
    live.sessionConfigSync.rememberOptions([], [modelOption("successor")]);
    resolveWrite({ configOptions: [modelOption("next")] });
    await expect(pending).resolves.toBeInstanceOf(AcpConfigApplicationRetiredError);
    expect(live.currentConfig).toEqual({ model: "successor" });
    expect(live.sessionConfigSync.listConfigOptionDescriptors()[0]).toMatchObject({
      currentValue: "successor",
    });
  });

  it.each(["isDisposed", "transportClosed"] as const)(
    "rejects startTurn with a closed-session error instead of config rejection when %s is set",
    async (flag) => {
      const { session, connection } = makeConfigSyncSession({
        currentConfig: { model: "old" },
        behavior: { strictConfigSelection: true },
      });
      Object.assign(session, { [flag]: true });
      await expect(session.startTurn("hello", { model: "old" })).rejects.toThrow(
        "ACP session is closed.",
      );
      expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
      expect(connection.prompt).not.toHaveBeenCalled();
    },
  );

  it.each(["isDisposed", "transportClosed"] as const)(
    "converts mid-flight config retirement to a closed-session error when %s flips during applyCurrentConfig",
    async (flag) => {
      const { session, connection, live } = makeInternalConfigSession({
        behavior: { strictConfigSelection: true },
      });
      let resolveWrite!: (reply: { configOptions: unknown[] }) => void;
      connection.setSessionConfigOption.mockReturnValue(
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
      );
      const pending = live.applyCurrentConfig({ model: "next" });
      await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());
      Object.assign(session, { [flag]: true });
      resolveWrite({ configOptions: [modelOption("next")] });
      await expect(pending).rejects.toThrow("ACP session is closed.");
      expect(live.currentConfig).toEqual({ model: "old" });
    },
  );

  it.each(["isDisposed", "transportClosed"] as const)(
    "rejects a queued startTurn with a closed-session error when %s flips while awaiting the prior turn",
    async (flag) => {
      const { session, connection } = makeConfigSyncSession({
        currentConfig: { model: "old" },
      });
      let resolveFirstPrompt!: (reply: { stopReason: string }) => void;
      connection.prompt.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstPrompt = resolve;
        }),
      );
      const firstTurn = session.startTurn("first", { model: "old" });
      await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledOnce());

      const queuedTurn = session.startTurn("second", { model: "old" });
      Object.assign(session, { [flag]: true });
      resolveFirstPrompt({ stopReason: "end_turn" });

      await expect(firstTurn).resolves.toBeUndefined();
      await expect(queuedTurn).rejects.toThrow("ACP session is closed.");
      expect(connection.prompt).toHaveBeenCalledOnce();
    },
  );

  it.each(["isDisposed", "transportClosed"] as const)(
    "rejects steerRunningTurn with a closed-session error when %s flips before prompt dispatch",
    async (flag) => {
      const { session, connection } = makeConfigSyncSession({
        currentConfig: { model: "old" },
        promptSteering: {
          isSupported: () => true,
          requestMeta: { steer: true },
        },
      });
      const internal = session as unknown as Record<string, unknown>;
      internal["promptInFlight"] = true;
      let resolveBlocks!: (blocks: unknown[]) => void;
      internal["outboundPromptBlocks"] = () =>
        new Promise((resolve) => {
          resolveBlocks = resolve;
        });

      const steerPromise = (session as unknown as InternalConfigSession).steerRunningTurn(
        "steer message",
        { model: "old" },
      );
      await vi.waitFor(() => expect(resolveBlocks).toBeTypeOf("function"));
      Object.assign(session, { [flag]: true });
      resolveBlocks([{ type: "text", text: "steer message" }]);

      await expect(steerPromise).rejects.toThrow("ACP session is closed.");
      expect(connection.prompt).not.toHaveBeenCalled();
    },
  );

  it("publishes the final accepted toggle after an intermediate full configuration echo", async () => {
    const original: ThreadConfig = { model: "model-a", effort: "low", fast: false };
    const { session, connection, listener } = makeConfigSyncSession({
      currentConfig: original,
      behavior: {
        strictConfigSelection: true,
        fastConfigBinding: { configId: "pace", disabled: "steady", enabled: "rapid" },
      },
    });
    const live = session as unknown as InternalConfigSession;
    const options = (effort: string, pace: string) => [
      { ...modelOption("model-a"), options: [{ value: "model-a" }] },
      {
        id: "thought_level",
        category: "thought_level",
        type: "select",
        currentValue: effort,
        options: ["low", "high"].map((value) => ({ value })),
      },
      {
        id: "pace",
        category: "model_config",
        type: "select",
        currentValue: pace,
        options: ["steady", "rapid"].map((value) => ({ value })),
      },
    ];
    live.sessionConfigSync.rememberOptions([], options("low", "steady"));
    connection.setSessionConfigOption.mockImplementation(async ({ configId }) => {
      if (configId === "thought_level") {
        const configOptions = options("high", "steady");
        session.handleSessionUpdate({
          update: { sessionUpdate: "config_option_update", configOptions },
        });
        return { configOptions };
      }
      return { configOptions: options("high", "rapid") };
    });
    await live.applyCurrentConfig({ ...original, effort: "high", fast: true });
    expect(connection.setSessionConfigOption.mock.calls.map(([request]) => request.value)).toEqual([
      "high",
      "rapid",
    ]);
    expect(live.currentConfig).toMatchObject({ model: "model-a", effort: "high", fast: true });
    const updates = listener.onUpdate.mock.calls.map(
      ([update]) => update as { config?: ThreadConfig },
    );
    expect(updates.filter((update) => update.config).at(-1)?.config).toMatchObject({
      fast: true,
      effort: "high",
    });
  });
});
