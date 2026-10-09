import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import type { ThreadConfig } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import { AcpStructuredSession } from "./session";
import { AcpSessionConfigSync } from "./sessionConfigSync";
import { makeConfigSyncSession } from "./sessionTestFixture";
import { AcpConfigApplicationRetiredError } from "./sessionConfigOwnership";

type ApplicationFixture = {
  sessionGeneration: number;
  currentConfig: ThreadConfig;
  applyCurrentConfig(config: ThreadConfig): Promise<void>;
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

function fixture() {
  const connection = {
    setSessionConfigOption: vi.fn<() => Promise<{ configOptions: unknown[] }>>(),
  };
  const sync = new AcpSessionConfigSync(connection as unknown as ClientSideConnection);
  sync.rememberOptions([], [modelOption("old")]);
  const session = Object.assign(
    Object.create(AcpStructuredSession.prototype) as ApplicationFixture,
    {
      sessionId: "reused-native-id",
      sessionGeneration: 1,
      currentConfig: { model: "old" },
      _sessionConfigSync: sync,
      isDisposed: false,
      transportClosed: false,
    },
  );
  return { connection, sync, session };
}

describe("structured session configuration application", () => {
  it("captures generation before waiting for the shared writer", async () => {
    const { connection, sync, session } = fixture();
    const lease = sync.configWrites.tryAcquire()!;
    const pending = session.applyCurrentConfig({ model: "next" }).catch((error: unknown) => error);
    session.sessionGeneration += 1;
    session.currentConfig = { model: "successor" };
    lease.release();
    await expect(pending).resolves.toBeInstanceOf(AcpConfigApplicationRetiredError);
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    expect(session.currentConfig).toEqual({ model: "successor" });
  });

  it("does not commit a retired config reply to the session that reused its native id", async () => {
    const { connection, sync, session } = fixture();
    let resolveWrite!: (reply: { configOptions: unknown[] }) => void;
    connection.setSessionConfigOption.mockReturnValue(
      new Promise((resolve) => {
        resolveWrite = resolve;
      }),
    );
    const pending = session.applyCurrentConfig({ model: "next" }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());
    session.sessionGeneration += 1;
    session.currentConfig = { model: "successor" };
    sync.rememberOptions([], [modelOption("successor")]);
    resolveWrite({ configOptions: [modelOption("next")] });
    await expect(pending).resolves.toBeInstanceOf(AcpConfigApplicationRetiredError);
    expect(session.currentConfig).toEqual({ model: "successor" });
    expect(sync.listConfigOptionDescriptors()[0]).toMatchObject({ currentValue: "successor" });
  });
});

it("publishes the final accepted toggle after an intermediate full configuration echo", async () => {
  const original: ThreadConfig = { model: "model-a", effort: "low", fast: false };
  const { session, connection, listener } = makeConfigSyncSession({
    currentConfig: original,
    behavior: {
      strictConfigSelection: true,
      fastConfigBinding: { configId: "pace", disabled: "steady", enabled: "rapid" },
    },
  });
  const live = session as unknown as ApplicationFixture & {
    sessionConfigSync: AcpSessionConfigSync;
  };
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
