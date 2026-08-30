import type { ClientSideConnection, SessionUpdate } from "@agentclientprotocol/sdk";
import type { ThreadConfig } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import { AcpSessionConfigSync } from "./sessionConfigSync";

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

describe("AcpSessionConfigSync", () => {
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
});
