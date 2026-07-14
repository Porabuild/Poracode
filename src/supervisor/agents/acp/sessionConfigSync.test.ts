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
});
