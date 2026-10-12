import type { ClientSideConnection, SessionUpdate } from "@agentclientprotocol/sdk";
import type { ThreadConfig } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import { resolveAcpMode, resolveModelConfigValue } from "./sessionConfig";
import { AcpConfigSelectionError, AcpSessionConfigSync } from "./sessionConfigSync";

type ConfigOptionResponse = { configOptions: unknown[] } | Record<string, never>;

const previousConfig: ThreadConfig = {
  model: "model-a",
  effort: "low",
  mode: "agent",
  approvalPolicy: "default",
};

function thoughtLevelOption(id = "thought-level", currentValue = "low") {
  return {
    id,
    category: "thought_level",
    type: "select",
    currentValue,
    options: [
      { value: "low", name: "Low" },
      { value: "high", name: "High" },
    ],
  };
}

function toggleThoughtLevelOption(id = "thought-level", currentValue = "default") {
  return {
    ...thoughtLevelOption(id, currentValue),
    name: "Reasoning",
    options: [
      { value: "none", name: "None" },
      { value: "default", name: "Default" },
    ],
    _meta: { "qwenCode/reasoning": { toggleOnly: true } },
  };
}

function modelSelectOption(currentValue = "model-a") {
  return {
    id: "model",
    category: "model",
    type: "select",
    currentValue,
    options: [
      { value: "model-a", name: "Model A" },
      { value: "model-b", name: "Model B" },
    ],
  };
}

function makeConfigSync(
  overrides: {
    availableModeIds?: string[];
    configOptions?: unknown[];
  } = {},
) {
  const configOptions = overrides.configOptions ?? [thoughtLevelOption()];
  const connection = {
    setSessionMode: vi
      .fn<(args: { sessionId: string; modeId: string }) => Promise<void>>()
      .mockResolvedValue(undefined),
    setSessionConfigOption: vi
      .fn<
        (args: {
          sessionId: string;
          configId: string;
          value: string;
        }) => Promise<ConfigOptionResponse>
      >()
      .mockResolvedValue({ configOptions }),
    request: vi
      .fn<(method: string, params: { sessionId: string; modelId: string }) => Promise<unknown>>()
      .mockResolvedValue(undefined),
  };
  const sync = new AcpSessionConfigSync(connection as unknown as ClientSideConnection);
  sync.rememberOptions(
    overrides.availableModeIds ?? ["default", "plan", "yolo", "autoEdit", "autopilot"],
    configOptions,
  );
  return { connection, sync };
}

describe("queued configuration ownership", () => {
  it("does not send a queued configuration after its session owner retires", async () => {
    const { connection, sync } = makeConfigSync({ configOptions: [modelSelectOption()] });
    const lease = sync.configWrites.tryAcquire()!;
    let live = true;
    const pending = sync.applyTurnConfig(
      "old-session",
      { ...previousConfig, model: "model-b" },
      previousConfig,
      () => {
        if (!live) throw new Error("retired config owner");
      },
    );
    const rejected = pending.then(
      () => undefined,
      (error: unknown) => error,
    );
    live = false;
    lease.release();
    await expect(rejected).resolves.toEqual(
      expect.objectContaining({ message: "retired config owner" }),
    );
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    expect(connection.setSessionMode).not.toHaveBeenCalled();
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("discards a late write echo before it replaces the successor's configuration", async () => {
    const { connection, sync } = makeConfigSync({ configOptions: [modelSelectOption()] });
    let resolveWrite!: (value: ConfigOptionResponse) => void;
    connection.setSessionConfigOption.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveWrite = resolve;
      }),
    );
    let live = true;
    const pending = sync.applyTurnConfig(
      "old-session",
      { ...previousConfig, model: "model-b", effort: "high" },
      previousConfig,
      () => {
        if (!live) throw new Error("retired config owner");
      },
    );
    const rejected = pending.then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());
    live = false;
    sync.rememberOptions([], [modelSelectOption("successor-model")]);
    resolveWrite({ configOptions: [modelSelectOption("model-b"), thoughtLevelOption()] });
    await expect(rejected).resolves.toEqual(
      expect.objectContaining({ message: "retired config owner" }),
    );
    expect(sync.listConfigOptionDescriptors()[0]).toMatchObject({
      currentValue: "successor-model",
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledOnce();
  });
});

describe("AcpSessionConfigSync", () => {
  it("uses the declared mode resolver for initial and subsequent turns", async () => {
    const { connection } = makeConfigSync();
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      (config) => (config.mode === "plan" ? "planning" : "unrestricted"),
    );
    sync.rememberOptions(["planning", "unrestricted"], []);
    await sync.applyTurnConfig("session-1", { model: "", mode: "agent" }, undefined);
    expect(connection.setSessionMode).toHaveBeenLastCalledWith({
      sessionId: "session-1",
      modeId: "unrestricted",
    });
    await sync.applyTurnConfig(
      "session-1",
      { model: "", mode: "plan" },
      { model: "", mode: "agent" },
    );
    expect(connection.setSessionMode).toHaveBeenLastCalledWith({
      sessionId: "session-1",
      modeId: "planning",
    });
    expect(sync.resolvePlanModeId()).toBe("planning");
  });
  it("applies mode, unstable model fallback, and effort changes before a new turn", async () => {
    const { connection, sync } = makeConfigSync();
    const nextConfig: ThreadConfig = {
      model: "model-b",
      effort: "high",
      mode: "plan",
      approvalPolicy: "default",
    };

    await expect(sync.applyTurnConfig("session-1", nextConfig, previousConfig)).resolves.toEqual(
      nextConfig,
    );

    expect(connection.setSessionMode).toHaveBeenCalledWith({
      sessionId: "session-1",
      modeId: "plan",
    });
    expect(connection.request).toHaveBeenCalledWith("session/set_model", {
      sessionId: "session-1",
      modelId: "model-b",
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "thought-level",
      value: "high",
    });
    expect(connection.setSessionMode.mock.invocationCallOrder[0]).toBeLessThan(
      connection.request.mock.invocationCallOrder[0]!,
    );
    expect(connection.request.mock.invocationCallOrder[0]).toBeLessThan(
      connection.setSessionConfigOption.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    [false, "none"],
    [true, "default"],
  ] as const)("maps ACP toggle-only reasoning %s to %s", async (thinking, value) => {
    const { connection, sync } = makeConfigSync({
      configOptions: [
        modelSelectOption(),
        toggleThoughtLevelOption("thought-level", thinking ? "none" : "default"),
      ],
    });
    const previous = { ...previousConfig, thinking: !thinking };
    const next = { ...previous, thinking };

    await sync.applyTurnConfig("session-1", next, previous);

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "thought-level",
      value,
    });
  });

  it("uses the toggle selector's advertised wire values", async () => {
    const toggleOption = {
      ...toggleThoughtLevelOption("thought-level", "on"),
      options: [
        { value: "off", name: "Reasoning Off" },
        { value: "on", name: "Reasoning On" },
      ],
    };
    const { connection, sync } = makeConfigSync({ configOptions: [toggleOption] });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, thinking: false },
      { ...previousConfig, thinking: true },
    );

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "thought-level",
      value: "off",
    });
  });

  it("skips an ambiguous toggle selector", async () => {
    const toggleOption = {
      ...toggleThoughtLevelOption("thought-level", "on"),
      options: [
        { value: "off", name: "Reasoning Off" },
        { value: "on", name: "Reasoning On" },
        { value: "auto", name: "Reasoning Auto" },
      ],
    };
    const { connection, sync } = makeConfigSync({ configOptions: [toggleOption] });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, thinking: false },
      { ...previousConfig, thinking: true },
    );

    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("falls back to ACP autopilot mode when approvals change but yolo is unavailable", async () => {
    const { connection, sync } = makeConfigSync({
      availableModeIds: ["default", "autopilot"],
    });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, approvalPolicy: "never" },
      previousConfig,
    );

    expect(connection.setSessionMode).toHaveBeenCalledWith({
      sessionId: "session-1",
      modeId: "autopilot",
    });
  });

  it("applies arbitrary ACP mode ids through a mode config option", async () => {
    const modeOption = {
      id: "autonomy-level",
      category: "mode",
      type: "select",
      currentValue: "normal",
      options: [
        { value: "normal", name: "Normal" },
        { value: "auto-high", name: "Auto High" },
      ],
    };
    const { connection, sync } = makeConfigSync({
      availableModeIds: ["normal", "auto-low", "auto-high"],
      configOptions: [modeOption, thoughtLevelOption()],
    });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, approvalPolicy: "auto-high" },
      previousConfig,
    );

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "autonomy-level",
      value: "auto-high",
    });
    expect(connection.setSessionMode).not.toHaveBeenCalled();
  });

  it("uses Kimi mode options when the ACP response has no legacy modes field", async () => {
    const modeOption = {
      id: "mode",
      category: "mode",
      type: "select",
      currentValue: "default",
      options: [
        { value: "default", name: "Default" },
        { value: "plan", name: "Plan" },
        { value: "auto", name: "Auto" },
        { value: "yolo", name: "YOLO" },
      ],
    };
    const { connection, sync } = makeConfigSync({
      availableModeIds: [],
      configOptions: [modeOption],
    });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, approvalPolicy: "yolo" },
      previousConfig,
    );

    expect(sync.availableModeIds).toEqual(["default", "plan", "auto", "yolo"]);
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "mode",
      value: "yolo",
    });
    expect(connection.setSessionMode).not.toHaveBeenCalled();
  });

  it("uses ACP session config options for Cursor-style model aliases", async () => {
    const modelOption = {
      id: "model",
      category: "model",
      type: "select",
      currentValue: "kimi-k2.5[]",
      options: [
        { value: "default[]", name: "Auto" },
        { value: "composer-2[fast=true]", name: "composer-2" },
      ],
    };
    const { connection, sync } = makeConfigSync({
      configOptions: [modelOption, thoughtLevelOption()],
    });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "composer-2", fast: true },
      previousConfig,
    );

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "model",
      value: "composer-2[fast=true]",
    });
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("maps Qwen's public model id to its provider-tagged ACP value", async () => {
    const modelOption = {
      id: "model",
      category: "model",
      type: "select",
      currentValue: "coder-model(qwen-oauth)",
      options: [
        { value: "coder-model(qwen-oauth)", name: "coder-model" },
        {
          value: "qwen3.8-max-preview(openai)",
          name: "[ModelStudio Coding Plan] qwen3.8-max-preview",
        },
      ],
    };
    const { connection, sync } = makeConfigSync({ configOptions: [modelOption] });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "qwen3.8-max-preview" },
      previousConfig,
    );

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "model",
      value: "qwen3.8-max-preview(openai)",
    });
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("maps Antigravity's base model and effort to its exact ACP variant", async () => {
    const modelOption = {
      id: "model",
      category: "model",
      type: "select",
      currentValue: "gemini-3-flash-agent",
      options: [
        { value: "gemini-3-flash-agent", name: "Gemini 3.5 Flash (High)" },
        { value: "gemini-3.5-flash-low", name: "Gemini 3.5 Flash (Medium)" },
        { value: "gemini-3.5-flash-extra-low", name: "Gemini 3.5 Flash (Low)" },
      ],
    };
    const { connection, sync } = makeConfigSync({ configOptions: [modelOption] });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "gemini-3.5-flash", effort: "Medium" },
      previousConfig,
    );

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "model",
      value: "gemini-3.5-flash-low",
    });
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("prioritizes Cursor-style effort aliases over the base ACP model alias", async () => {
    const modelOption = {
      id: "model",
      category: "model",
      type: "select",
      currentValue: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
      options: [
        {
          value: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
          name: "GPT-5.5",
        },
        {
          value: "gpt-5.5[context=272k,reasoning=high,fast=true]",
          name: "GPT-5.5 High Fast",
        },
      ],
    };
    const { connection, sync } = makeConfigSync({
      configOptions: [modelOption, thoughtLevelOption()],
    });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "gpt-5.5", effort: "high", fast: true },
      previousConfig,
    );

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "model",
      value: "gpt-5.5[context=272k,reasoning=high,fast=true]",
    });
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("uses ACP session config options for mode when the agent exposes one", async () => {
    const modeOption = {
      id: "mode",
      category: "mode",
      type: "select",
      currentValue: "agent",
      options: [
        { value: "agent", name: "Agent" },
        { value: "plan", name: "Plan" },
      ],
    };
    const { connection, sync } = makeConfigSync({
      configOptions: [modeOption, thoughtLevelOption()],
    });

    await sync.applyTurnConfig("session-1", { ...previousConfig, mode: "plan" }, previousConfig);

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "mode",
      value: "plan",
    });
    expect(connection.setSessionMode).not.toHaveBeenCalled();
  });

  it("refreshes returned config metadata between ordered mode, model, and effort updates", async () => {
    const initialOptions = [
      {
        id: "mode",
        category: "mode",
        type: "select",
        currentValue: "agent",
        options: [
          { value: "agent", name: "Agent" },
          { value: "plan", name: "Plan" },
        ],
      },
      {
        id: "model-old",
        category: "model",
        type: "select",
        currentValue: "model-a",
        options: [
          { value: "model-a", name: "Model A" },
          { value: "model-b", name: "Model B" },
        ],
      },
      thoughtLevelOption("thought-old"),
    ];
    const afterModeOptions = [
      initialOptions[0],
      { ...(initialOptions[1] as object), id: "model-new" },
      thoughtLevelOption("thought-mid"),
    ];
    const afterModelOptions = [
      afterModeOptions[0],
      { ...(afterModeOptions[1] as object), currentValue: "model-b" },
      thoughtLevelOption("thought-new"),
    ];
    const { connection, sync } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption
      .mockResolvedValueOnce({ configOptions: afterModeOptions })
      .mockResolvedValueOnce({ configOptions: afterModelOptions })
      .mockResolvedValue({ configOptions: afterModelOptions });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "model-b", effort: "high", mode: "plan" },
      previousConfig,
    );

    expect(connection.setSessionConfigOption.mock.calls).toEqual([
      [{ sessionId: "session-1", configId: "mode", value: "plan" }],
      [{ sessionId: "session-1", configId: "model-new", value: "model-b" }],
      [{ sessionId: "session-1", configId: "thought-new", value: "high" }],
    ]);
  });

  it("waits for a matching config-option update after an empty model response", async () => {
    const initialOptions = [modelSelectOption(), thoughtLevelOption("thought-old", "low")];
    const afterModelOptions = [
      modelSelectOption("model-b"),
      thoughtLevelOption("thought-new", "low"),
    ];
    const { connection, sync } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockResolvedValueOnce({});

    const applying = sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "model-b", effort: "high" },
      previousConfig,
    );
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());
    expect(connection.setSessionConfigOption.mock.calls[0]?.[0].configId).toBe("model");

    sync.rememberConfigOptionUpdate({
      sessionUpdate: "config_option_update",
      configOptions: afterModelOptions,
    } as SessionUpdate);
    await applying;

    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
      "thought-new",
    ]);
  });

  it("retains a config-option update that arrives before the empty response", async () => {
    const initialOptions = [modelSelectOption(), thoughtLevelOption("thought-old", "low")];
    const { connection, sync } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockImplementationOnce(async () => {
      sync.reduceSessionUpdate(undefined, {
        sessionUpdate: "config_option_update",
        configOptions: [modelSelectOption("model-b"), thoughtLevelOption("thought-new", "low")],
      } as SessionUpdate);
      return {};
    });

    await sync.applyTurnConfig(
      "session-1",
      { model: "model-b", effort: "high", mode: "agent", approvalPolicy: "default" },
      undefined,
    );

    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
      "thought-new",
    ]);
  });

  it("handles a config RPC that outlasts the update waiter", async () => {
    vi.useFakeTimers();
    const { connection, sync } = makeConfigSync({
      configOptions: [modelSelectOption(), thoughtLevelOption()],
    });
    connection.setSessionConfigOption.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      return {};
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const applying = sync.applyTurnConfig(
        "session-1",
        { ...previousConfig, model: "model-b", effort: "high" },
        previousConfig,
      );
      await vi.advanceTimersByTimeAsync(6_000);
      await expect(applying).resolves.toMatchObject({ model: "model-b", effort: "high" });
    } finally {
      log.mockRestore();
      vi.useRealTimers();
    }
  });

  it("reapplies an unchanged requested effort after switching models", async () => {
    const initialOptions = [modelSelectOption(), thoughtLevelOption("thought-old", "high")];
    const afterModelOptions = [
      modelSelectOption("model-b"),
      thoughtLevelOption("thought-new", "low"),
    ];
    const { connection, sync } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockResolvedValueOnce({
      configOptions: afterModelOptions,
    });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "model-b", effort: "high" },
      { ...previousConfig, effort: "high" },
    );

    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
      "thought-new",
    ]);
  });

  it("continues through rejected live updates and returns the requested config", async () => {
    const { connection, sync } = makeConfigSync();
    connection.setSessionMode.mockRejectedValueOnce(new Error("mode rejected"));
    connection.request.mockRejectedValueOnce(new Error("model rejected"));
    connection.setSessionConfigOption.mockRejectedValueOnce(new Error("effort rejected"));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const nextConfig: ThreadConfig = {
      model: "model-b",
      effort: "high",
      mode: "plan",
      approvalPolicy: "default",
    };

    try {
      await expect(sync.applyTurnConfig("session-1", nextConfig, previousConfig)).resolves.toEqual(
        nextConfig,
      );
    } finally {
      log.mockRestore();
    }

    expect(connection.setSessionMode).toHaveBeenCalledOnce();
    expect(connection.request).toHaveBeenCalledOnce();
    expect(connection.setSessionConfigOption).toHaveBeenCalledOnce();
  });

  it("rejects an unadvertised strict selection before changing mode or using legacy model RPC", async () => {
    const { connection } = makeConfigSync();
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true },
    );
    sync.rememberOptions(["default", "plan"], [modelSelectOption()]);
    await expect(
      sync.applyTurnConfig(
        "session-1",
        { ...previousConfig, model: "unknown", mode: "plan" },
        previousConfig,
      ),
    ).rejects.toMatchObject({
      name: "AcpConfigSelectionError",
      confirmedConfig: previousConfig,
    });
    expect(connection.setSessionMode).not.toHaveBeenCalled();
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("rejects a stale permission policy instead of admitting a prompt in the old mode", async () => {
    const { connection } = makeConfigSync();
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      () => undefined,
      undefined,
      { strictConfigSelection: true },
    );
    sync.rememberOptions(["default"], [modelSelectOption()]);
    await expect(
      sync.applyTurnConfig(
        "session-1",
        { ...previousConfig, approvalPolicy: "missing-policy" },
        previousConfig,
      ),
    ).rejects.toBeInstanceOf(AcpConfigSelectionError);
    expect(connection.setSessionMode).not.toHaveBeenCalled();
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("rejects an unsupported reasoning level and leaves the confirmed level visible", async () => {
    const { connection } = makeConfigSync();
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true },
    );
    sync.rememberOptions(["default"], [modelSelectOption(), thoughtLevelOption()]);
    sync.rememberCurrentMode("default");
    await expect(
      sync.applyTurnConfig(
        "session-1",
        { ...previousConfig, effort: "missing-effort" },
        previousConfig,
      ),
    ).rejects.toMatchObject({ confirmedConfig: previousConfig });
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("rejects an unconfirmed strict model response and retains the confirmed config", async () => {
    const { connection } = makeConfigSync();
    connection.setSessionConfigOption.mockResolvedValue({ configOptions: [modelSelectOption()] });
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true },
    );
    sync.rememberOptions(["default"], [modelSelectOption()]);
    sync.rememberCurrentMode("default");
    await expect(
      sync.applyTurnConfig("session-1", { ...previousConfig, model: "model-b" }, previousConfig),
    ).rejects.toBeInstanceOf(AcpConfigSelectionError);
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("reports confirmed partial changes when a later strict selection fails", async () => {
    const { connection } = makeConfigSync();
    connection.setSessionConfigOption.mockRejectedValue(new Error("model rejected"));
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true },
    );
    sync.rememberOptions(["default", "plan"], [modelSelectOption()]);
    await expect(
      sync.applyTurnConfig(
        "session-1",
        { ...previousConfig, model: "model-b", mode: "plan" },
        previousConfig,
      ),
    ).rejects.toMatchObject({
      confirmedConfig: { ...previousConfig, mode: "plan" },
    });
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("rejects an unchanged requested level the refreshed target ladder no longer carries", async () => {
    // The source ladder carried "high"; the model setter acknowledges the
    // target and refreshes its ladder down to "low" only. The unchanged level
    // must still fail the turn typed — the acknowledged native level is what
    // the reported config keeps, never an imagined rollback.
    const initialOptions = [modelSelectOption(), thoughtLevelOption("thought-old", "high")];
    const afterModelOptions = [
      modelSelectOption("model-b"),
      { ...thoughtLevelOption("thought-new", "low"), options: [{ value: "low", name: "Low" }] },
    ];
    const { connection } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockResolvedValueOnce({ configOptions: afterModelOptions });
    const syncStrict = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true },
    );
    syncStrict.rememberOptions(["default"], initialOptions);
    const error = await syncStrict
      .applyTurnConfig(
        "session-1",
        { ...previousConfig, model: "model-b", effort: "high" },
        { ...previousConfig, effort: "high" },
      )
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(AcpConfigSelectionError);
    // Acknowledged native model and its own current level, folded from the
    // refreshed options.
    expect(error).toMatchObject({
      confirmedConfig: { model: "model-b", effort: "low" },
    });
    // The failure precedes any thought-level write and therefore any prompt.
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
    ]);
  });

  it("rejects an unchanged requested level after the target model drops its reasoning selector", async () => {
    // Missing carrier: the setter reply removes the select entirely. Nothing
    // authoritative contradicts the requested level, so the reported config
    // keeps it alongside the acknowledged model — without a prompt.
    const initialOptions = [modelSelectOption(), thoughtLevelOption("thought-old", "high")];
    const { connection } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockResolvedValueOnce({
      configOptions: [modelSelectOption("model-b")],
    });
    const syncStrict = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true },
    );
    syncStrict.rememberOptions(["default"], initialOptions);
    const error = await syncStrict
      .applyTurnConfig(
        "session-1",
        { ...previousConfig, model: "model-b", effort: "high" },
        { ...previousConfig, effort: "high" },
      )
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(AcpConfigSelectionError);
    expect(error).toMatchObject({ confirmedConfig: { model: "model-b", effort: "high" } });
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
    ]);
  });

  it("reapplies a carried level on the refreshed ladder in strict mode", async () => {
    // Bounded above: the revalidation rejects only what the refreshed target
    // inventory genuinely cannot carry.
    const initialOptions = [modelSelectOption(), thoughtLevelOption("thought-old", "high")];
    const { connection } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption
      .mockResolvedValueOnce({
        // The refreshed ladder still carries "high" (the native current value
        // differs), so the unchanged level is reapplied rather than rejected.
        configOptions: [modelSelectOption("model-b"), thoughtLevelOption("thought-new", "low")],
      })
      .mockResolvedValueOnce({
        // The thought-level write's own echo.
        configOptions: [modelSelectOption("model-b"), thoughtLevelOption("thought-new", "high")],
      });
    const syncStrict = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true },
    );
    syncStrict.rememberOptions(["default"], initialOptions);
    const confirmed = await syncStrict.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "model-b", effort: "high" },
      { ...previousConfig, effort: "high" },
    );
    expect(confirmed).toMatchObject({ model: "model-b", effort: "high" });
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
      "thought-new",
    ]);
  });

  it("keeps a declared model-encoded level working without an independent reasoning selector", async () => {
    // A provider whose model identity encodes the effort never advertises a
    // reasoning select. Strict selection does not demand an independent
    // carrier from every agent: the declared proof owns that answer, so the
    // encoded level keeps working after the acknowledgement.
    const resolver = vi.fn<() => { configId: string; value: string }>(() => ({
      configId: "model",
      value: "opaque-high",
    }));
    const { connection } = makeConfigSync({ configOptions: [modelSelectOption("opaque-low")] });
    connection.setSessionConfigOption.mockResolvedValueOnce({
      configOptions: [modelSelectOption("opaque-high")],
    });
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      resolver as never,
      {
        strictConfigSelection: true,
        modelCarriesEffort: (config, options) =>
          config.effort === "high" &&
          Array.isArray(options) &&
          options.some(
            (option) =>
              typeof option === "object" &&
              option !== null &&
              (option as { id?: unknown }).id === "model" &&
              (option as { currentValue?: unknown }).currentValue === "opaque-high",
          ),
      },
    );
    sync.rememberOptions([], [modelSelectOption("opaque-low")]);
    const confirmed = await sync.applyTurnConfig(
      "session-1",
      { model: "family", effort: "high", mode: "agent", approvalPolicy: "default" },
      { model: "family", effort: "high", mode: "agent", approvalPolicy: "default" },
    );
    expect(resolver).toHaveBeenCalled();
    // The returned config keeps the REQUESTED model id — the resolver's wire
    // value stays opaque to the thread config (the push above carries it).
    expect(confirmed).toMatchObject({ model: "family", effort: "high" });
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
    ]);
  });

  it("rejects a requested level the source never carried when the acknowledgement drops the carrier", async () => {
    // The source ladder advertises Low only, so the requested High was never
    // carried there either; target validation must not depend on source
    // membership. The acknowledgement drops the reasoning select entirely —
    // the switch fails typed after only the model write instead of silently
    // succeeding with nothing carrying High.
    const initialOptions = [
      modelSelectOption(),
      { ...thoughtLevelOption("thought-old", "low"), options: [{ value: "low", name: "Low" }] },
    ];
    const { connection } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockResolvedValueOnce({
      configOptions: [modelSelectOption("model-b")],
    });
    const syncStrict = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true },
    );
    syncStrict.rememberOptions(["default"], initialOptions);
    const error = await syncStrict
      .applyTurnConfig(
        "session-1",
        { ...previousConfig, model: "model-b", effort: "high" },
        { ...previousConfig, effort: "low" },
      )
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(AcpConfigSelectionError);
    // The acknowledged native state: the target's own current level, not the
    // requested one and not an imagined rollback.
    expect(error).toMatchObject({ confirmedConfig: { model: "model-b", effort: "low" } });
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
    ]);
  });

  it("never accepts a boolean thinking toggle as the requested graded level", async () => {
    // The target model replaces the graded ladder with a true/false
    // thought-level select. An on/off acknowledgement is not a graded-effort
    // acknowledgement: the switch fails typed before any toggle write, and
    // the reported config folds the acknowledged native toggle honestly.
    const initialOptions = [modelSelectOption(), thoughtLevelOption("thought-old", "high")];
    const toggleTarget = [
      modelSelectOption("model-b"),
      {
        id: "thought_level",
        category: "thought_level",
        type: "select",
        name: "Thinking",
        currentValue: "true",
        options: [
          { value: "true", name: "On" },
          { value: "false", name: "Off" },
        ],
      },
    ];
    const { connection } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockResolvedValueOnce({ configOptions: toggleTarget });
    const syncStrict = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true },
    );
    syncStrict.rememberOptions(["default"], initialOptions);
    const error = await syncStrict
      .applyTurnConfig(
        "session-1",
        { ...previousConfig, model: "model-b", effort: "high", thinking: false },
        { ...previousConfig, effort: "high" },
      )
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(AcpConfigSelectionError);
    expect(error).toMatchObject({
      confirmedConfig: { model: "model-b", effort: "high", thinking: true },
    });
    // No toggle write ever fires — the graded request is refused, not
    // converted into an on/off push.
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
    ]);
  });

  it("accepts a declared model-encoded level across an independent-to-encoded transition", async () => {
    // The source carried High on an independent ladder; the acknowledged
    // target advertises no reasoning select at all because the level is
    // encoded in the model identity. The declared proof is consulted with
    // the ACKNOWLEDGED target's options — no longer the pending source — and
    // accepts the transition that a source-membership guard falsely rejects.
    const initialOptions = [modelSelectOption(), thoughtLevelOption("thought-old", "high")];
    const { connection } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockResolvedValueOnce({
      configOptions: [modelSelectOption("model-b")],
    });
    const seenOptions: unknown[] = [];
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      {
        strictConfigSelection: true,
        modelCarriesEffort: (config, options) => {
          seenOptions.push(options);
          return (
            config.effort === "high" &&
            Array.isArray(options) &&
            options.some(
              (option) =>
                typeof option === "object" &&
                option !== null &&
                (option as { id?: unknown }).id === "model" &&
                (option as { currentValue?: unknown }).currentValue === "model-b",
            )
          );
        },
      },
    );
    sync.rememberOptions(["default"], initialOptions);
    const confirmed = await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "model-b", effort: "high" },
      { ...previousConfig, effort: "high" },
    );
    expect(confirmed).toMatchObject({ model: "model-b", effort: "high" });
    // The proof ran against the refreshed acknowledged inventory, not the
    // pre-switch options.
    expect(seenOptions).toEqual([[modelSelectOption("model-b")]]);
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
    ]);
  });

  it("keeps requiring the graded carrier when the declared proof does not claim the model", async () => {
    // A declared hook that answers false is not blanket acceptance: without
    // the proof the request must still ride an advertised graded select.
    const initialOptions = [modelSelectOption(), thoughtLevelOption("thought-old", "high")];
    const { connection } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockResolvedValueOnce({
      configOptions: [modelSelectOption("model-b")],
    });
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true, modelCarriesEffort: () => false },
    );
    sync.rememberOptions(["default"], initialOptions);
    await expect(
      sync.applyTurnConfig(
        "session-1",
        { ...previousConfig, model: "model-b", effort: "high" },
        { ...previousConfig, effort: "high" },
      ),
    ).rejects.toBeInstanceOf(AcpConfigSelectionError);
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
    ]);
  });

  it("does not demand an effort carrier when no meaningful level is requested", async () => {
    // Composite/seed configs carry an empty effort: a model switch with
    // nothing to carry keeps succeeding without any provider declaration.
    const { connection } = makeConfigSync({
      configOptions: [modelSelectOption()],
    });
    connection.setSessionConfigOption.mockResolvedValueOnce({
      configOptions: [modelSelectOption("model-b")],
    });
    const syncStrict = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true },
    );
    syncStrict.rememberOptions(["default"], [modelSelectOption()]);
    const confirmed = await syncStrict.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "model-b", effort: "" },
      { ...previousConfig, effort: "" },
    );
    expect(confirmed).toMatchObject({ model: "model-b" });
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
    ]);
  });

  it("does not consult the encoded-level proof when the target ladder carries the level", async () => {
    // The independent graded carrier wins on its own; the provider proof is
    // a last resort for model-encoded identities, never a bypass of the
    // ladder check.
    const initialOptions = [modelSelectOption(), thoughtLevelOption("thought-old", "high")];
    const { connection } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption
      .mockResolvedValueOnce({
        configOptions: [modelSelectOption("model-b"), thoughtLevelOption("thought-new", "low")],
      })
      .mockResolvedValueOnce({
        configOptions: [modelSelectOption("model-b"), thoughtLevelOption("thought-new", "high")],
      });
    const proof = vi.fn<() => boolean>(() => true);
    const syncStrict = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      { strictConfigSelection: true, modelCarriesEffort: proof },
    );
    syncStrict.rememberOptions(["default"], initialOptions);
    const confirmed = await syncStrict.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "model-b", effort: "high" },
      { ...previousConfig, effort: "high" },
    );
    expect(confirmed).toMatchObject({ model: "model-b", effort: "high" });
    expect(proof).not.toHaveBeenCalled();
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
      "thought-new",
    ]);
  });

  it("keeps the previous config and avoids protocol updates without a session id", async () => {
    const { connection, sync } = makeConfigSync();

    await expect(
      sync.applyTurnConfig(undefined, { ...previousConfig, model: "model-b" }, previousConfig),
    ).resolves.toEqual(previousConfig);

    expect(connection.setSessionMode).not.toHaveBeenCalled();
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("maps ACP autopilot updates back to agent approval config", () => {
    const { sync } = makeConfigSync();

    expect(
      sync.reduceSessionUpdate(previousConfig, {
        sessionUpdate: "current_mode_update",
        currentModeId: "autopilot",
      } as SessionUpdate),
    ).toEqual({ ...previousConfig, approvalPolicy: "never" });
  });

  it("maps arbitrary ACP mode updates back to approval config", () => {
    const { sync } = makeConfigSync();
    const currentConfig = { ...previousConfig, approvalPolicy: "normal" };

    expect(
      sync.reduceSessionUpdate(currentConfig, {
        sessionUpdate: "current_mode_update",
        currentModeId: "auto-high",
      } as SessionUpdate),
    ).toEqual({ ...currentConfig, approvalPolicy: "auto-high" });
  });

  it("skips the mode push when the agent already reported that mode", async () => {
    // `SessionModeState.currentModeId` from session/new|load|resume is the
    // agent's own statement of its mode. Re-asserting it is not a no-op for
    // every agent (Kimi records a `plan_mode.cancel`), so a resumed session
    // must not have its restored mode pushed back at it.
    const { connection, sync } = makeConfigSync();
    sync.rememberCurrentMode("plan");

    await sync.applyTurnConfig("session-1", { ...previousConfig, mode: "plan" }, undefined);

    expect(connection.setSessionMode).not.toHaveBeenCalled();
  });

  it("still pushes when the agent reports a different mode", async () => {
    const { connection, sync } = makeConfigSync();
    sync.rememberCurrentMode("default");

    await sync.applyTurnConfig("session-1", { ...previousConfig, mode: "plan" }, undefined);

    expect(connection.setSessionMode).toHaveBeenCalledWith({
      sessionId: "session-1",
      modeId: "plan",
    });
  });

  it("compares the reported mode by its normalized id", async () => {
    // Agents may report a mode as a spec URI (…/session-modes#plan).
    const { connection, sync } = makeConfigSync();
    sync.rememberCurrentMode("https://agentclientprotocol.com/protocol/session-modes#plan");

    await sync.applyTurnConfig("session-1", { ...previousConfig, mode: "plan" }, undefined);

    expect(connection.setSessionMode).not.toHaveBeenCalled();
  });

  it("does not re-push a mode it just pushed on the following turn", async () => {
    const { connection, sync } = makeConfigSync();
    const planConfig: ThreadConfig = { ...previousConfig, mode: "plan" };

    await sync.applyTurnConfig("session-1", planConfig, previousConfig);
    await sync.applyTurnConfig("session-1", planConfig, previousConfig);

    expect(connection.setSessionMode).toHaveBeenCalledTimes(1);
  });

  it("folds an agent-reported mode change into the config and remembers it", async () => {
    const { connection, sync } = makeConfigSync();

    expect(sync.reduceModeChange(previousConfig, "plan")).toEqual({
      ...previousConfig,
      mode: "plan",
    });
    // Learning the mode this way must also suppress a redundant push.
    await sync.applyTurnConfig("session-1", { ...previousConfig, mode: "plan" }, previousConfig);
    expect(connection.setSessionMode).not.toHaveBeenCalled();
  });

  it("leaves plan mode without rewriting the approval policy", () => {
    // Mapping the exit through a mode id would turn `auto` into `default`;
    // leaving plan mode says nothing about which approvals the user picked.
    const { sync } = makeConfigSync();

    expect(
      sync.reduceLeavePlanMode({ ...previousConfig, mode: "plan", approvalPolicy: "auto" }),
    ).toEqual({ ...previousConfig, mode: "agent", approvalPolicy: "auto" });
    expect(sync.reduceLeavePlanMode({ ...previousConfig, mode: "agent" })).toBeUndefined();
  });

  it("stops suppressing pushes once the agent leaves plan mode", async () => {
    const { connection, sync } = makeConfigSync();
    sync.rememberCurrentMode("plan");
    sync.reduceLeavePlanMode({ ...previousConfig, mode: "plan" });

    await sync.applyTurnConfig("session-1", { ...previousConfig, mode: "plan" }, undefined);

    expect(connection.setSessionMode).toHaveBeenCalledWith({
      sessionId: "session-1",
      modeId: "plan",
    });
  });

  it("returns undefined from reduceModeChange when the config is already in that mode", () => {
    const { sync } = makeConfigSync();

    expect(sync.reduceModeChange({ ...previousConfig, mode: "plan" }, "plan")).toBeUndefined();
  });

  it('resolves the agent\'s own id for plan mode, falling back to "plan"', () => {
    expect(makeConfigSync().sync.resolvePlanModeId()).toBe("plan");
    expect(
      makeConfigSync({ availableModeIds: ["default", "architect"] }).sync.resolvePlanModeId(),
    ).toBe("architect");
    expect(makeConfigSync({ availableModeIds: ["default"] }).sync.resolvePlanModeId()).toBe("plan");
  });

  it("remembers config option updates and returns effort changes", async () => {
    const { connection, sync } = makeConfigSync();
    const updatedOptions = [thoughtLevelOption("thought-new", "high")];

    const nextConfig = sync.reduceSessionUpdate(previousConfig, {
      sessionUpdate: "config_option_update",
      configOptions: updatedOptions,
    } as SessionUpdate);

    expect(nextConfig).toEqual({ ...previousConfig, effort: "high" });
    await sync.applyTurnConfig("session-1", { ...previousConfig, effort: "low" }, nextConfig);
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "thought-new",
      value: "low",
    });
  });

  it("remembers toggle-only config updates and returns thinking changes", async () => {
    const { connection, sync } = makeConfigSync({
      configOptions: [toggleThoughtLevelOption("thought-old", "default")],
    });
    const currentConfig = { ...previousConfig, thinking: true };
    const nextConfig = sync.reduceSessionUpdate(currentConfig, {
      sessionUpdate: "config_option_update",
      configOptions: [toggleThoughtLevelOption("thought-new", "none")],
    } as SessionUpdate);

    expect(nextConfig).toEqual({ ...currentConfig, thinking: false });

    await sync.applyTurnConfig("session-1", currentConfig, nextConfig);
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "thought-new",
      value: "default",
    });
  });

  it("does not surface unchanged mode updates", () => {
    const { sync } = makeConfigSync();

    expect(
      sync.reduceSessionUpdate(previousConfig, {
        sessionUpdate: "current_mode_update",
        currentModeId: "default",
      } as SessionUpdate),
    ).toBeUndefined();
  });

  it("ignores malformed mode updates without throwing", () => {
    const { sync } = makeConfigSync();
    const malformedUpdates = [
      { sessionUpdate: "current_mode_update" },
      { sessionUpdate: "current_mode_update", currentModeId: 42 },
      { sessionUpdate: "current_mode_update", currentModeId: null },
    ];

    for (const update of malformedUpdates) {
      expect(
        sync.reduceSessionUpdate(previousConfig, update as unknown as SessionUpdate),
      ).toBeUndefined();
    }
  });

  it("ignores malformed config-option updates without forgetting valid options", async () => {
    const { connection, sync } = makeConfigSync();
    const malformedUpdates = [
      { sessionUpdate: "config_option_update" },
      { sessionUpdate: "config_option_update", configOptions: null },
      { sessionUpdate: "config_option_update", configOptions: { invalid: true } },
    ];

    for (const update of malformedUpdates) {
      expect(
        sync.reduceSessionUpdate(previousConfig, update as unknown as SessionUpdate),
      ).toBeUndefined();
    }

    await sync.applyTurnConfig("session-1", { ...previousConfig, effort: "high" }, previousConfig);
    expect(connection.setSessionConfigOption).toHaveBeenCalledExactlyOnceWith({
      sessionId: "session-1",
      configId: "thought-level",
      value: "high",
    });
  });

  // Qoder files its effort selector as { category: "model", id: "reasoning_effort" }
  // and only advertises it for reasoning-capable models, so a model switch can
  // make the selector appear or disappear. These pin both transitions.
  function qoderEffortOption(currentValue = "xhigh") {
    return {
      id: "reasoning_effort",
      name: "Reasoning Effort",
      category: "model",
      type: "select",
      currentValue,
      options: [
        { value: "xhigh", name: "Extra High" },
        { value: "high", name: "High" },
      ],
    };
  }

  it("skips the effort update when the reasoning_effort selector disappears after a model change", async () => {
    const initialOptions = [modelSelectOption(), qoderEffortOption()];
    // model-b is not a reasoning model — its config options drop the selector.
    const afterModelOptions = [modelSelectOption("model-b")];
    const { connection, sync } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockResolvedValueOnce({ configOptions: afterModelOptions });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "model-b", effort: "high" },
      previousConfig,
    );

    // Only the model update is sent; the effort update is skipped rather than
    // firing at a now-nonexistent "reasoning_effort" configId.
    expect(connection.setSessionConfigOption.mock.calls.map(([call]) => call.configId)).toEqual([
      "model",
    ]);
  });

  it("applies effort through the reasoning_effort selector that appears after a model change", async () => {
    // The initial model exposes no effort selector...
    const initialOptions = [modelSelectOption()];
    // ...switching to model-b reveals Qoder's reasoning-effort selector.
    const afterModelOptions = [modelSelectOption("model-b"), qoderEffortOption("xhigh")];
    const { connection, sync } = makeConfigSync({ configOptions: initialOptions });
    connection.setSessionConfigOption.mockResolvedValueOnce({ configOptions: afterModelOptions });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, model: "model-b", effort: "high" },
      { ...previousConfig, model: "model-a" },
    );

    expect(
      connection.setSessionConfigOption.mock.calls.map(([call]) => [call.configId, call.value]),
    ).toEqual([
      ["model", "model-b"],
      ["reasoning_effort", "high"],
    ]);
  });

  it("applies effort, thinking, fast, and context as separate config options", async () => {
    const afterModelOptions = [
      modelSelectOption("model-b"),
      {
        id: "thinking",
        category: "thought_level",
        type: "select",
        currentValue: "false",
        options: [
          { value: "false", name: "Off" },
          { value: "true", name: "On" },
        ],
      },
      {
        id: "effort",
        category: "thought_level",
        type: "select",
        currentValue: "high",
        options: [
          { value: "low", name: "Low" },
          { value: "high", name: "High" },
          { value: "extra-high", name: "Extra High" },
        ],
      },
      {
        id: "fast",
        category: "model_config",
        type: "select",
        currentValue: "true",
        options: [
          { value: "false", name: "Off" },
          { value: "true", name: "Fast" },
        ],
      },
      {
        id: "context",
        category: "model_config",
        type: "select",
        currentValue: "272k",
        options: [
          { value: "272k", name: "272K" },
          { value: "1m", name: "1M" },
        ],
      },
    ];
    const { connection, sync } = makeConfigSync({
      configOptions: [modelSelectOption(), thoughtLevelOption()],
    });
    connection.setSessionConfigOption.mockResolvedValue({ configOptions: afterModelOptions });

    await sync.applyTurnConfig(
      "session-1",
      {
        ...previousConfig,
        model: "model-b",
        effort: "xhigh",
        thinking: true,
        fast: false,
        contextSize: "1m",
      },
      previousConfig,
    );

    expect(
      connection.setSessionConfigOption.mock.calls.map(([call]) => [call.configId, call.value]),
    ).toEqual([
      ["model", "model-b"],
      ["effort", "extra-high"],
      ["thinking", "true"],
      ["fast", "false"],
      ["context", "1m"],
    ]);
  });

  it("applies effort and fast on a later turn without changing the model", async () => {
    const { connection, sync } = makeConfigSync({
      configOptions: [
        modelSelectOption(),
        thoughtLevelOption(),
        {
          id: "fast",
          category: "model_config",
          type: "select",
          currentValue: "true",
          options: [
            { value: "false", name: "Off" },
            { value: "true", name: "Fast" },
          ],
        },
      ],
    });

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, effort: "high", fast: false },
      { ...previousConfig, effort: "low", fast: true },
    );

    expect(
      connection.setSessionConfigOption.mock.calls.map(([call]) => [call.configId, call.value]),
    ).toEqual([
      ["thought-level", "high"],
      ["fast", "false"],
    ]);
  });
});

it("uses a provider resolver for effort-only changes to opaque model variants", async () => {
  const { connection } = makeConfigSync();
  const resolver = vi.fn<() => { configId: string; value: string }>(() => ({
    configId: "model",
    value: "opaque-high-fast",
  }));
  const sync = new AcpSessionConfigSync(
    connection as unknown as ClientSideConnection,
    undefined,
    resolver,
  );
  sync.rememberOptions([], [modelSelectOption("opaque-low")]);
  connection.setSessionConfigOption.mockResolvedValue({
    configOptions: [modelSelectOption("opaque-high-fast")],
  });
  await sync.applyTurnConfig(
    "session",
    { model: "family", effort: "high", fast: true },
    { model: "family", effort: "low" },
  );
  expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
    sessionId: "session",
    configId: "model",
    value: "opaque-high-fast",
  });
  expect(connection.request).not.toHaveBeenCalled();
});

describe("AcpSessionConfigSync — typed option inventory", () => {
  it("describes flat, grouped, boolean, and unsupported options", () => {
    const { sync } = makeConfigSync({
      configOptions: [
        modelSelectOption(),
        {
          id: "reasoning",
          category: "thought_level",
          type: "select",
          currentValue: "high",
          options: [
            {
              group: "standard",
              name: "Standard",
              options: [{ value: "medium", name: "Medium" }],
            },
          ],
        },
        { id: "turbo", type: "boolean", currentValue: true },
        { id: "future", type: "radio", currentValue: "a" },
      ],
    });

    expect(sync.listConfigOptionDescriptors()).toEqual([
      {
        type: "select",
        id: "model",
        category: "model",
        currentValue: "model-a",
        values: [
          { value: "model-a", name: "Model A" },
          { value: "model-b", name: "Model B" },
        ],
        groups: [],
      },
      {
        type: "select",
        id: "reasoning",
        category: "thought_level",
        currentValue: "high",
        values: [{ value: "medium", name: "Medium", group: "standard" }],
        groups: [{ id: "standard", name: "Standard" }],
      },
      { type: "boolean", id: "turbo", currentValue: true },
      { type: "unsupported", id: "future", controlType: "radio" },
    ]);
  });

  it("lists boolean options separately", () => {
    const { sync } = makeConfigSync({
      configOptions: [thoughtLevelOption(), { id: "turbo", type: "boolean", currentValue: false }],
    });

    expect(sync.listBooleanConfigOptions()).toEqual([
      { type: "boolean", id: "turbo", currentValue: false },
    ]);
  });

  it("refreshes the boolean inventory from a config_option_update", () => {
    const { sync } = makeConfigSync();

    expect(sync.listBooleanConfigOptions()).toEqual([]);
    sync.rememberConfigOptionUpdate({
      sessionUpdate: "config_option_update",
      configOptions: [{ id: "turbo", type: "boolean", currentValue: true }],
    } as unknown as SessionUpdate);

    expect(sync.listBooleanConfigOptions()).toEqual([
      { type: "boolean", id: "turbo", currentValue: true },
    ]);
  });
});

describe("AcpSessionConfigSync — provider config-options normalizer", () => {
  function normalizingSync(normalizer: (options: readonly unknown[]) => readonly unknown[]) {
    const { connection } = makeConfigSync();
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      {},
      normalizer,
    );
    sync.rememberOptions(
      ["default", "plan", "yolo", "autoEdit", "autopilot"],
      [thoughtLevelOption()],
    );
    return { connection, sync };
  }

  it("defaults to pass-through and retains options unchanged", () => {
    const { sync } = makeConfigSync();

    expect(sync.listRetainedConfigOptions()).toEqual([thoughtLevelOption()]);
  });

  it("applies the normalizer on the session-open ingestion lane", () => {
    const { sync } = normalizingSync((options) =>
      options.map((option) => ({
        ...(option as Record<string, unknown>),
        name: "normalized",
      })),
    );

    sync.rememberOptions([], [thoughtLevelOption()]);
    expect(sync.listRetainedConfigOptions()).toEqual([
      { ...thoughtLevelOption(), name: "normalized" },
    ]);
  });

  it("applies the normalizer on agent-owned config_option_update notifications", () => {
    const { sync } = normalizingSync((options) =>
      options.map((option) => ({
        ...(option as Record<string, unknown>),
        name: "normalized",
      })),
    );

    const next = sync.rememberConfigOptionUpdate({
      sessionUpdate: "config_option_update",
      configOptions: [thoughtLevelOption("thought-new", "high")],
    } as unknown as SessionUpdate);

    expect(next).toEqual([{ ...thoughtLevelOption("thought-new", "high"), name: "normalized" }]);
    expect(sync.listRetainedConfigOptions()).toEqual([
      { ...thoughtLevelOption("thought-new", "high"), name: "normalized" },
    ]);
  });

  it("applies the normalizer to a setter reply before confirmation", async () => {
    const { connection, sync } = normalizingSync((options) =>
      options.map((option) => {
        const record = option as { currentValue?: string };
        return {
          ...record,
          currentValue: record.currentValue === "RAW_HIGH" ? "high" : record.currentValue,
        };
      }),
    );
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: [thoughtLevelOption("thought-level", "RAW_HIGH")],
    });

    await sync.applyTurnConfig("session-1", { ...previousConfig, effort: "high" }, previousConfig);

    expect(sync.listRetainedConfigOptions()).toEqual([thoughtLevelOption("thought-level", "high")]);
  });

  it("never reduces a raw unnormalized update", () => {
    const { sync } = normalizingSync((options) =>
      options.map((option) => {
        const record = option as { currentValue?: string };
        return {
          ...record,
          currentValue: record.currentValue === "raw-x" ? "high" : record.currentValue,
        };
      }),
    );

    const next = sync.reduceSessionUpdate(previousConfig, {
      sessionUpdate: "config_option_update",
      configOptions: [thoughtLevelOption("thought-new", "raw-x")],
    } as unknown as SessionUpdate);

    // The reduction saw the normalized value, not the raw wire one.
    expect(next).toEqual({ ...previousConfig, effort: "high" });
  });

  it("keeps the previous options when the normalizer throws", () => {
    let calls = 0;
    const { sync } = normalizingSync((options) => {
      calls += 1;
      if (calls > 1) throw new Error("normalizer bug");
      return options;
    });

    sync.rememberOptions([], [thoughtLevelOption("thought-new", "high")]);

    expect(sync.listRetainedConfigOptions()).toEqual([thoughtLevelOption()]);
  });

  it("keeps a reasoning selector separate from model identity despite ambiguous category metadata", () => {
    const { sync } = makeConfigSync();
    const options = [
      {
        id: "reasoning_effort",
        category: "model",
        type: "select",
        currentValue: "high",
        options: [
          { value: "medium", name: "Medium" },
          { value: "high", name: "High" },
        ],
      },
    ];
    const next = sync.reduceSessionUpdate(previousConfig, {
      sessionUpdate: "config_option_update",
      configOptions: options,
    } as unknown as SessionUpdate);
    expect(next).toEqual({ ...previousConfig, effort: "high" });
  });

  it("preserves an advertised empty model value in the confirmed thread config", () => {
    const { sync } = makeConfigSync();
    const options = [
      {
        id: "model",
        category: "model",
        type: "select",
        currentValue: "",
        options: [
          { value: "", name: "Default" },
          { value: "model-a", name: "Model A" },
        ],
      },
    ];
    expect(
      sync.reduceSessionUpdate(previousConfig, {
        sessionUpdate: "config_option_update",
        configOptions: options,
      } as unknown as SessionUpdate),
    ).toMatchObject({ model: "" });
  });

  it("folds model and mode selects from an authoritative option list", async () => {
    const { connection, sync } = makeConfigSync();
    const update = {
      sessionUpdate: "config_option_update",
      configOptions: [
        {
          id: "model",
          category: "model",
          type: "select",
          currentValue: "model-b",
          options: [
            { value: "model-a", name: "Model A" },
            { value: "model-b", name: "Model B" },
          ],
        },
        {
          id: "autonomy",
          category: "mode",
          type: "select",
          currentValue: "yolo",
          options: [
            { value: "default", name: "Default" },
            { value: "yolo", name: "Yolo" },
          ],
        },
      ],
    };

    const next = sync.reduceSessionUpdate(previousConfig, update as unknown as SessionUpdate);

    expect(next).toEqual({
      ...previousConfig,
      model: "model-b",
      mode: "agent",
      approvalPolicy: "never",
    });
    // The agent's own mode report is remembered: the next turn must not push
    // that same mode back at the agent.
    await sync.applyTurnConfig("session-1", next!, previousConfig);
    expect(connection.setSessionMode).not.toHaveBeenCalled();
  });
});

describe("inventory ingestion notifications", () => {
  it("notifies after every successful normalized ingest", () => {
    const { sync } = makeConfigSync();
    const onOptionsIngested = vi.fn<() => void>();
    sync.onOptionsIngested = onOptionsIngested;

    sync.rememberOptions(["default"], [thoughtLevelOption("thought-level", "high")]);
    expect(onOptionsIngested).toHaveBeenCalledTimes(1);

    sync.rememberConfigOptionUpdate({
      sessionUpdate: "config_option_update",
      configOptions: [thoughtLevelOption("thought-level", "low")],
    } as unknown as SessionUpdate);
    expect(onOptionsIngested).toHaveBeenCalledTimes(2);
  });

  it("does not notify when the normalizer rejects the list", () => {
    const connection = {
      setSessionMode: vi.fn<() => Promise<void>>(),
      setSessionConfigOption: vi.fn<() => Promise<ConfigOptionResponse>>(),
      request: vi.fn<() => Promise<unknown>>(),
    };
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      resolveAcpMode,
      resolveModelConfigValue,
      {},
      () => {
        throw new Error("bad normalizer");
      },
    );
    const onOptionsIngested = vi.fn<() => void>();
    sync.onOptionsIngested = onOptionsIngested;

    expect(sync.rememberOptions([], [thoughtLevelOption()])).toBe(false);
    expect(onOptionsIngested).not.toHaveBeenCalled();
  });

  it("clearRetainedOptions resets the retained cache without notifying", () => {
    const { sync } = makeConfigSync();
    const onOptionsIngested = vi.fn<() => void>();
    sync.onOptionsIngested = onOptionsIngested;

    sync.clearRetainedOptions();
    expect(sync.listRetainedConfigOptions()).toEqual([]);
    expect(sync.listConfigOptionDescriptors()).toEqual([]);
    expect(sync.availableModeIds).toEqual([]);
    expect(onOptionsIngested).not.toHaveBeenCalled();
  });
});

describe("AcpSessionConfigSync — declared fast binding", () => {
  const binding = { configId: "pace", disabled: "steady", enabled: "rapid" };

  function paceOption(currentValue = "steady", overrides: Record<string, unknown> = {}) {
    return {
      id: "pace",
      name: "Pace",
      category: "model_config",
      type: "select",
      currentValue,
      options: [
        { value: "steady", name: "Steady" },
        { value: "rapid", name: "Rapid" },
      ],
      ...overrides,
    };
  }

  function makeBoundSync(
    configOptions: unknown[],
    behavior: { fastConfigBinding?: typeof binding; strictConfigSelection?: boolean } = {},
  ) {
    const connection = {
      setSessionMode: vi
        .fn<(args: { sessionId: string; modeId: string }) => Promise<void>>()
        .mockResolvedValue(undefined),
      setSessionConfigOption: vi
        .fn<
          (args: {
            sessionId: string;
            configId: string;
            value: string;
          }) => Promise<ConfigOptionResponse>
        >()
        .mockResolvedValue({ configOptions }),
      request: vi
        .fn<(method: string, params: { sessionId: string; modelId: string }) => Promise<unknown>>()
        .mockResolvedValue(undefined),
    };
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      behavior,
    );
    sync.rememberOptions(["default", "plan", "yolo", "autoEdit", "autopilot"], configOptions);
    return { connection, sync };
  }

  it("pushes the exact native wire value for each toggle state", async () => {
    const { connection, sync } = makeBoundSync([paceOption()], { fastConfigBinding: binding });
    // A compliant agent echoes each write back in its setter reply.
    connection.setSessionConfigOption.mockResolvedValue({ configOptions: [paceOption("rapid")] });

    await sync.applyTurnConfig("session-1", { ...previousConfig, fast: true }, previousConfig);
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "pace",
      value: "rapid",
    });

    connection.setSessionConfigOption.mockClear();
    connection.setSessionConfigOption.mockResolvedValue({ configOptions: [paceOption("steady")] });
    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, fast: false },
      { ...previousConfig, fast: true },
    );
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "pace",
      value: "steady",
    });
  });

  it("discovers the bound select through grouped values and writes the native value", async () => {
    const grouped = paceOption("steady", {
      options: [
        { group: "lane", name: "Lane", options: [{ value: "steady", name: "Steady" }] },
        { value: "rapid", name: "Rapid" },
      ],
    });
    const { connection, sync } = makeBoundSync([grouped], { fastConfigBinding: binding });

    await sync.applyTurnConfig("session-1", { ...previousConfig, fast: true }, previousConfig);

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "pace",
      value: "rapid",
    });
  });

  it.each([
    ["select missing", []],
    [
      "one declared value missing",
      [paceOption("steady", { options: [{ value: "rapid", name: "Rapid" }] })],
    ],
    ["boolean wrong type", [paceOption("steady", { type: "boolean", currentValue: true })]],
    [
      "extra ladder value",
      [
        paceOption("steady", {
          options: [
            { value: "steady", name: "Steady" },
            { value: "rapid", name: "Rapid" },
            { value: "hyperspeed", name: "Hyperspeed" },
          ],
        }),
      ],
    ],
    ["binding values not distinct", [] as unknown[]],
  ])(
    "keeps fast unbound and never writes when the binding is undrivable: %s",
    async (_label, configOptions) => {
      const undrivable =
        _label === "binding values not distinct"
          ? { configId: "pace", disabled: "rapid", enabled: "rapid" }
          : binding;
      const { connection, sync } = makeBoundSync(configOptions, { fastConfigBinding: undrivable });

      await sync.applyTurnConfig("session-1", { ...previousConfig, fast: true }, previousConfig);

      expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    },
  );

  it("reduces the native echo onto the boolean in both directions", () => {
    const { sync } = makeBoundSync([paceOption()], { fastConfigBinding: binding });
    expect(sync.reduceConfigOptions(previousConfig, [paceOption("rapid")])).toMatchObject({
      fast: true,
    });
    expect(sync.reduceConfigOptions(previousConfig, [paceOption("steady")])).toMatchObject({
      fast: false,
    });
  });

  it("never guesses false from an unrecognized echo value", () => {
    const { sync } = makeBoundSync([paceOption("rapid")], { fastConfigBinding: binding });
    const next = sync.reduceConfigOptions(previousConfig, [paceOption("mysterious")]);
    expect(next).toEqual(previousConfig);
    expect(next).not.toHaveProperty("fast");
  });

  it("confirms the toggle from a native setter echo", async () => {
    const { connection, sync } = makeBoundSync([paceOption()], { fastConfigBinding: binding });
    connection.setSessionConfigOption.mockResolvedValue({ configOptions: [paceOption("rapid")] });

    const confirmed = await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, fast: true },
      previousConfig,
    );

    expect(confirmed?.fast).toBe(true);
    expect(sync.listRetainedConfigOptions()[0]).toMatchObject({ currentValue: "rapid" });
  });

  it("rejects and rolls back to the agent-confirmed state when the echo never carries the toggle", async () => {
    // Strict selection requires the model to be advertised, so the inventory
    // carries the model select too and rejection happens at the fast stage.
    const { connection, sync } = makeBoundSync([modelSelectOption(), paceOption("steady")], {
      fastConfigBinding: binding,
      strictConfigSelection: true,
    });
    // The setter "succeeds" but the echo keeps the old value: no confirmation.
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: [modelSelectOption(), paceOption("steady")],
    });

    const rejected = await sync
      .applyTurnConfig("session-1", { ...previousConfig, fast: true }, previousConfig)
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(rejected).toBeInstanceOf(AcpConfigSelectionError);
    // The rollback carries the agent's own echoed state — steady is a genuine
    // report of fast:false, not a guessed one.
    expect((rejected as AcpConfigSelectionError).confirmedConfig).toMatchObject({ fast: false });
  });

  it("keeps the previous fast state in the rollback when the echoed value is unrecognizable", async () => {
    const { connection, sync } = makeBoundSync([modelSelectOption(), paceOption()], {
      fastConfigBinding: binding,
      strictConfigSelection: true,
    });
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: [modelSelectOption(), paceOption("mysterious")],
    });

    const rejected = await sync
      .applyTurnConfig("session-1", { ...previousConfig, fast: true }, previousConfig)
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(rejected).toBeInstanceOf(AcpConfigSelectionError);
    expect((rejected as AcpConfigSelectionError).confirmedConfig).not.toHaveProperty("fast");
  });

  it("leaves the default true/false wire values in force without a binding", async () => {
    const legacy = {
      id: "fast",
      category: "model_config",
      type: "select",
      currentValue: "true",
      options: [
        { value: "false", name: "Off" },
        { value: "true", name: "Fast" },
      ],
    };
    const { connection, sync } = makeBoundSync([legacy]);

    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, fast: false },
      { ...previousConfig, fast: true },
    );

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "fast",
      value: "false",
    });
  });
  it("rejects an explicit enable when the declared selector is unavailable", async () => {
    const { sync, connection } = makeBoundSync([modelSelectOption()], {
      fastConfigBinding: binding,
      strictConfigSelection: true,
    });
    await expect(
      sync.applyTurnConfig("session-1", { ...previousConfig, fast: true }, previousConfig),
    ).rejects.toBeInstanceOf(AcpConfigSelectionError);
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("rejects an enable after a model setter echo removes its bound selector", async () => {
    const model = {
      ...modelSelectOption(),
      currentValue: "model-a",
      options: [{ value: "model-a" }, { value: "model-b" }],
    };
    const { sync, connection } = makeBoundSync([model, paceOption()], {
      fastConfigBinding: binding,
      strictConfigSelection: true,
    });
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: [{ ...model, currentValue: "model-b" }],
    });
    const rejected = await sync
      .applyTurnConfig(
        "session-1",
        { ...previousConfig, model: "model-b", fast: true },
        { ...previousConfig, model: "model-a" },
      )
      .catch((error) => error);
    expect(rejected).toBeInstanceOf(AcpConfigSelectionError);
    expect(rejected.confirmedConfig.model).toBe("model-b");
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(1);
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "model",
      value: "model-b",
    });
  });

  it("writes a legitimate empty disabled value from a declared binding", async () => {
    const emptyBinding = { ...binding, disabled: "" };
    const native = paceOption("rapid", { options: [{ value: "" }, { value: "rapid" }] });
    const { sync, connection } = makeBoundSync([native], { fastConfigBinding: emptyBinding });
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: [{ ...native, currentValue: "" }],
    });
    await sync.applyTurnConfig(
      "session-1",
      { ...previousConfig, fast: false },
      { ...previousConfig, fast: true },
    );
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "pace",
      value: "",
    });
    expect(
      sync.reduceSessionUpdate({ ...previousConfig, fast: true }, {
        sessionUpdate: "config_option_update",
        configOptions: [{ ...native, currentValue: "" }],
      } as never)?.fast,
    ).toBe(false);
  });
});
