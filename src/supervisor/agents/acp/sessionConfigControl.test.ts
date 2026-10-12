import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import type { ThreadConfig } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  AcpConfigControlError,
  AcpLiveConfigControl,
  CONFIG_OPTIONS_SNAPSHOT_MAX_BYTES,
  type AcpUnlistedSelectValueGuard,
} from "./sessionConfigControl";
import { AcpSessionConfigSync } from "./sessionConfigSync";

type SetConfigOptionArgs = {
  sessionId: string;
  configId: string;
  value: string | boolean;
  type?: "boolean";
};

type SetConfigOptionReply = { configOptions: unknown[] } | Record<string, never> | undefined;

function selectOption(id: string, currentValue: string, values: string[]) {
  return {
    id,
    name: `Option ${id}`,
    category: "model_config",
    type: "select",
    currentValue,
    options: values.map((value) => ({ value, name: `Value ${value}` })),
  };
}

function groupedSelectOption(id: string, currentValue: string) {
  return {
    id,
    name: `Option ${id}`,
    category: "model_config",
    type: "select",
    currentValue,
    options: [
      {
        group: "standard",
        name: "Standard",
        options: [
          { value: "a", name: "A" },
          { value: "", name: "Empty" },
        ],
      },
      { group: "extended", name: "Extended", options: [{ value: "b", name: "B" }] },
    ],
  };
}

function booleanOption(id: string, currentValue: boolean) {
  return { id, name: `Option ${id}`, category: "model_config", type: "boolean", currentValue };
}

function makeControl(
  overrides: {
    configOptions?: unknown[];
    booleanNegotiated?: boolean;
    foregroundPromptOpen?: boolean;
    allowDuringPrompt?: boolean;
    configWriteTimeoutMs?: number;
    normalizeConfigOptions?: (options: readonly unknown[]) => readonly unknown[];
    echo?: SetConfigOptionReply | ((args: SetConfigOptionArgs) => SetConfigOptionReply);
    allowUnlistedSelectValue?: AcpUnlistedSelectValueGuard;
  } = {},
) {
  const initialOptions = overrides.configOptions ?? [
    selectOption("picker", "a", ["a", "b", ""]),
    groupedSelectOption("grouped", "a"),
    booleanOption("toggle", false),
  ];
  const connection = {
    setSessionConfigOption: vi
      .fn<(args: SetConfigOptionArgs) => Promise<SetConfigOptionReply>>()
      .mockImplementation(async (args: SetConfigOptionArgs) => {
        if (typeof overrides.echo === "function") return overrides.echo(args);
        if (overrides.echo !== undefined) return overrides.echo;
        // A compliant agent echoes the full option list with the write applied.
        return {
          configOptions: initialOptions.map((option) => {
            const record = option as Record<string, unknown>;
            return record.id === args.configId ? { ...record, currentValue: args.value } : option;
          }),
        };
      }),
  };
  const configSync = new AcpSessionConfigSync(
    connection as unknown as ClientSideConnection,
    undefined,
    undefined,
    {},
    overrides.normalizeConfigOptions,
  );
  configSync.rememberOptions([], initialOptions);
  const owner = { sessionId: "session-1", generation: 1, disposed: false, transportClosed: false };
  const state = {
    currentConfig: { model: "model-a", mode: "agent", approvalPolicy: "default" } as ThreadConfig,
    reconciled: [] as Array<ThreadConfig | undefined>,
  };
  const control = new AcpLiveConfigControl({
    connection: connection as unknown as ClientSideConnection,
    configSync,
    configWrites: configSync.configWrites,
    getOwner: () => ({ ...owner }),
    isBooleanCapabilityNegotiated: () => overrides.booleanNegotiated === true,
    isForegroundPromptOpen: () => overrides.foregroundPromptOpen === true,
    allowDuringPrompt: () => overrides.allowDuringPrompt === true,
    ...(overrides.allowUnlistedSelectValue
      ? { allowUnlistedSelectValue: overrides.allowUnlistedSelectValue }
      : {}),
    getCurrentConfig: () => state.currentConfig,
    onConfigReconciled: (next) => {
      state.reconciled.push(next);
      if (next) state.currentConfig = next;
    },
    ...(overrides.configWriteTimeoutMs !== undefined
      ? { configWriteTimeoutMs: overrides.configWriteTimeoutMs }
      : {}),
  });
  return { connection, configSync, control, owner, state };
}

describe("AcpLiveConfigControl — detached snapshot", () => {
  it("returns a detached snapshot: mutating it never reaches session state", () => {
    const { configSync, control } = makeControl();

    const snapshot = control.getConfigOptions();
    const first = snapshot[0] as { currentValue?: string };
    first.currentValue = "mutated";
    (first as unknown as { options: unknown[] }).options.push({ value: "injected" });

    expect(configSync.listRetainedConfigOptions()).toEqual([
      selectOption("picker", "a", ["a", "b", ""]),
      groupedSelectOption("grouped", "a"),
      booleanOption("toggle", false),
    ]);
  });

  it("returns a detached snapshot: later session changes never reach a returned snapshot", () => {
    const { configSync, control } = makeControl();

    const snapshot = control.getConfigOptions();
    configSync.rememberOptions([], [selectOption("picker", "b", ["a", "b"])]);

    expect((snapshot[0] as { currentValue?: string }).currentValue).toBe("a");
  });

  it("fails with a bounded error when the snapshot exceeds the byte or depth bound", () => {
    const huge = selectOption("picker", "a", ["a"]);
    (huge as unknown as { padding: string }).padding = "x".repeat(
      CONFIG_OPTIONS_SNAPSHOT_MAX_BYTES + 1,
    );
    const { control: byteControl } = makeControl({ configOptions: [huge] });
    expect(() => byteControl.getConfigOptions()).toThrowError(AcpConfigControlError);

    let deep: Record<string, unknown> = { value: "leaf" };
    for (let index = 0; index < 70; index += 1) deep = { nested: deep };
    const nestedOption = selectOption("picker", "a", ["a"]);
    (nestedOption as unknown as Record<string, unknown>)._meta = deep;
    const { control: depthControl } = makeControl({ configOptions: [nestedOption] });
    expect(() => depthControl.getConfigOptions()).toThrowError(AcpConfigControlError);
  });
});

describe("AcpLiveConfigControl — validated writes", () => {
  it("sets a flat select value and reconciles through the confirmed echo", async () => {
    const { connection, configSync, control, state } = makeControl();

    await control.setConfigOption("picker", "b");

    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(1);
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "picker",
      value: "b",
    });
    expect(
      (configSync.listRetainedConfigOptions()[0] as { currentValue?: string }).currentValue,
    ).toBe("b");
    expect(state.reconciled).toHaveLength(1);
  });

  it("sets a value inside a grouped select", async () => {
    const { connection, control } = makeControl();

    await control.setConfigOption("grouped", "b");

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "grouped",
      value: "b",
    });
  });

  it("accepts a legitimate empty-string select value", async () => {
    const { connection, configSync, control } = makeControl();
    // An agent that selected the empty value: the echo keeps the empty
    // currentValue, so confirmation must honor it like any other id.
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: [selectOption("picker", "", ["a", "b", ""])],
    });

    await control.setConfigOption("picker", "");

    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "picker",
      value: "",
    });
    expect(
      (configSync.listRetainedConfigOptions()[0] as { currentValue?: string }).currentValue,
    ).toBe("");
  });

  it("sends booleans with the boolean type discriminator only when negotiated", async () => {
    const negotiated = makeControl({ booleanNegotiated: true });
    await negotiated.control.setConfigOption("toggle", true);
    expect(negotiated.connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "toggle",
      value: true,
      type: "boolean",
    });

    const notNegotiated = makeControl({ booleanNegotiated: false });
    await expect(notNegotiated.control.setConfigOption("toggle", true)).rejects.toMatchObject({
      name: "AcpConfigControlError",
      reason: "invalid_value",
    });
    expect(notNegotiated.connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it.each([
    { name: "unknown option", configId: "missing", value: "a", reason: "unknown_option" },
    {
      name: "unsupported control type",
      configId: "weird",
      value: "a",
      reason: "unsupported_option",
    },
    { name: "unadvertised select value", configId: "picker", value: "z", reason: "invalid_value" },
    {
      name: "string for a boolean option",
      configId: "toggle",
      value: "true",
      reason: "invalid_value",
    },
    {
      name: "boolean for a select option",
      configId: "picker",
      value: true,
      reason: "invalid_value",
    },
    { name: "non-string non-boolean value", configId: "picker", value: 7, reason: "invalid_value" },
  ])("rejects $name before any wire send", async ({ configId, value, reason }) => {
    const configOptions = [
      ...makeControl().configSync.listRetainedConfigOptions(),
      { id: "weird", type: "radio", currentValue: "a" },
    ];
    const { connection, control } = makeControl({ configOptions });

    await expect(
      control.setConfigOption(configId, value as string | boolean),
    ).rejects.toMatchObject({ reason });
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("treats an option removed by a config_option_update as unknown", async () => {
    const { connection, configSync, control } = makeControl();
    configSync.rememberOptions(
      [],
      configSync
        .listRetainedConfigOptions()
        .filter((option) => (option as { id?: string }).id !== "picker"),
    );

    await expect(control.setConfigOption("picker", "b")).rejects.toMatchObject({
      reason: "unknown_option",
    });
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("fails unconfirmed and does not reconcile when the echo reports a different value", async () => {
    const { connection, control, state } = makeControl();
    // The agent clamped the selection: the echo carries the old value.
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: [selectOption("picker", "a", ["a", "b", ""])],
    });

    await expect(control.setConfigOption("picker", "b")).rejects.toMatchObject({
      reason: "unconfirmed",
    });
    expect(state.reconciled).toHaveLength(0);
  });

  it("confirms through the agent's config_option_update when the reply carries no list", async () => {
    const { connection, configSync, control } = makeControl();
    connection.setSessionConfigOption.mockResolvedValue({});

    const settled = control.setConfigOption("picker", "b");
    // Give the write time to land, then let the agent's notification carry
    // the confirmation.
    await new Promise((resolve) => setTimeout(resolve, 5));
    configSync.rememberOptions([], [selectOption("picker", "b", ["a", "b", ""])]);

    await expect(settled).resolves.toBeUndefined();
  });

  it.each(["reopen", "dispose", "transport", "abort"] as const)(
    "does not reconcile a notification confirmation after %s while waiting for a missing echo",
    async (change) => {
      const { configSync, control, owner, state } = makeControl({ echo: {} });
      const controller = new AbortController();
      const write = control.setConfigOption("picker", "b", { signal: controller.signal });
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (change === "reopen") owner.generation += 1;
      if (change === "dispose") owner.disposed = true;
      if (change === "transport") owner.transportClosed = true;
      if (change === "abort") controller.abort();
      configSync.rememberOptions([], [selectOption("picker", "b", ["a", "b"])]);
      await expect(write).rejects.toMatchObject({ reason: "unavailable" });
      expect(state.reconciled).toEqual([]);
    },
  );

  it("cancels the notification fallback promptly without an update", async () => {
    const { control, connection, state } = makeControl({ echo: {}, configWriteTimeoutMs: 10_000 });
    const controller = new AbortController();
    const write = control.setConfigOption("picker", "b", { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(1);
    controller.abort();
    await expect(write).rejects.toMatchObject({ reason: "unavailable" });
    expect(state.reconciled).toEqual([]);
  });

  it("cannot confirm a rejected normalized reply using previously retained options", async () => {
    let calls = 0;
    const { control, state, configSync } = makeControl({
      configOptions: [selectOption("picker", "b", ["a", "b"])],
      echo: { configOptions: [selectOption("picker", "a", ["a", "b"])] },
      normalizeConfigOptions: (options) => {
        calls += 1;
        if (calls > 1) throw new Error("Fixture normalization rejection");
        return options;
      },
    });
    await expect(control.setConfigOption("picker", "b")).rejects.toMatchObject({
      reason: "unconfirmed",
    });
    expect(state.reconciled).toEqual([]);
    expect(configSync.listRetainedConfigOptions()).toEqual([
      selectOption("picker", "b", ["a", "b"]),
    ]);
  });

  it("rejects an oversized echoed snapshot without retaining it", async () => {
    const initial = selectOption("picker", "a", ["a", "b"]);
    const { control, configSync } = makeControl({
      configOptions: [initial],
      echo: {
        configOptions: [
          {
            ...initial,
            currentValue: "b",
            _meta: { blob: "x".repeat(CONFIG_OPTIONS_SNAPSHOT_MAX_BYTES) },
          },
        ],
      },
    });
    await expect(control.setConfigOption("picker", "b")).rejects.toMatchObject({
      reason: "bounded",
    });
    expect(configSync.listRetainedConfigOptions()).toEqual([initial]);
  });

  it("requires the echoed control type to match the requested value type", async () => {
    const { control, state } = makeControl({
      configOptions: [selectOption("picker", "false", ["false", "true"])],
      echo: { configOptions: [booleanOption("picker", true)] },
    });
    await expect(control.setConfigOption("picker", "true")).rejects.toMatchObject({
      reason: "unconfirmed",
    });
    expect(state.reconciled).toEqual([]);
  });

  it("fails unconfirmed when neither the reply nor an update confirms the value", async () => {
    const { connection, control } = makeControl({
      echo: {},
      configWriteTimeoutMs: 25,
    });

    await expect(control.setConfigOption("picker", "b")).rejects.toMatchObject({
      reason: "unconfirmed",
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(1);
  });
});

describe("AcpLiveConfigControl — fencing", () => {
  it("rejects a pre-aborted signal before any wire send", async () => {
    const { connection, control } = makeControl();
    const controller = new AbortController();
    controller.abort();

    await expect(
      control.setConfigOption("picker", "b", { signal: controller.signal }),
    ).rejects.toMatchObject({ reason: "unavailable" });
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("returns promptly on abort while holding the writer until the unabortable write settles", async () => {
    let releaseEcho: ((reply: SetConfigOptionReply) => void) | undefined;
    const { connection, configSync, control } = makeControl();
    connection.setSessionConfigOption.mockImplementationOnce(
      () =>
        new Promise<SetConfigOptionReply>((resolve) => {
          releaseEcho = resolve;
        }),
    );
    const controller = new AbortController();
    const settled = control.setConfigOption("picker", "b", { signal: controller.signal });
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());
    controller.abort();

    await expect(settled).rejects.toMatchObject({ reason: "unavailable" });
    // The first outcome is unknown: a second mutation must be refused.
    await expect(control.setConfigOption("picker", "b")).rejects.toMatchObject({
      reason: "conflict",
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(1);

    releaseEcho?.({ configOptions: [selectOption("picker", "b", ["a", "b", ""])] });
    await vi.waitFor(() => expect(configSync.configWrites.isBusy()).toBe(false));
    // The writer is free again once the flight settles.
    await expect(control.setConfigOption("picker", "a")).resolves.toBeUndefined();
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(2);
  });

  it("times out promptly while holding the writer until the write settles", async () => {
    let releaseEcho: ((reply: SetConfigOptionReply) => void) | undefined;
    const { connection, configSync, control } = makeControl({ configWriteTimeoutMs: 20 });
    connection.setSessionConfigOption.mockImplementationOnce(
      () =>
        new Promise<SetConfigOptionReply>((resolve) => {
          releaseEcho = resolve;
        }),
    );

    await expect(control.setConfigOption("picker", "b")).rejects.toMatchObject({
      reason: "unconfirmed",
    });
    await expect(control.setConfigOption("picker", "b")).rejects.toMatchObject({
      reason: "conflict",
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(1);

    releaseEcho?.({ configOptions: [selectOption("picker", "b", ["a", "b", ""])] });
    await vi.waitFor(() => expect(configSync.configWrites.isBusy()).toBe(false));
    await expect(control.setConfigOption("picker", "a")).resolves.toBeUndefined();
  });

  it("discards the echo when the session was disposed during the write", async () => {
    let releaseEcho: ((reply: SetConfigOptionReply) => void) | undefined;
    const { connection, control, owner, state } = makeControl();
    connection.setSessionConfigOption.mockImplementationOnce(
      () =>
        new Promise<SetConfigOptionReply>((resolve) => {
          releaseEcho = resolve;
        }),
    );
    const settled = control.setConfigOption("picker", "b");
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());
    owner.disposed = true;
    releaseEcho?.({ configOptions: [selectOption("picker", "b", ["a", "b", ""])] });

    await expect(settled).rejects.toMatchObject({ reason: "unavailable" });
    expect(state.reconciled).toHaveLength(0);
    expect(control.getConfigOptions()[0]).toMatchObject({ currentValue: "a" });
  });

  it("discards the echo when the transport closed during the write", async () => {
    let releaseEcho: ((reply: SetConfigOptionReply) => void) | undefined;
    const { connection, control, owner, state } = makeControl();
    connection.setSessionConfigOption.mockImplementationOnce(
      () =>
        new Promise<SetConfigOptionReply>((resolve) => {
          releaseEcho = resolve;
        }),
    );
    const settled = control.setConfigOption("picker", "b");
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());
    owner.transportClosed = true;
    releaseEcho?.({ configOptions: [selectOption("picker", "b", ["a", "b", ""])] });

    await expect(settled).rejects.toMatchObject({ reason: "unavailable" });
    expect(state.reconciled).toHaveLength(0);
  });

  it("fences a stale write out of a same-native-id reopen generation", async () => {
    let releaseFirst: ((reply: SetConfigOptionReply) => void) | undefined;
    const { connection, control, owner, state } = makeControl();
    connection.setSessionConfigOption.mockImplementationOnce(
      () =>
        new Promise<SetConfigOptionReply>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const stale = control.setConfigOption("picker", "b");
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());

    // Re-open onto the SAME native session id: only the generation changes.
    owner.generation += 1;
    connection.setSessionConfigOption.mockClear();
    releaseFirst?.({ configOptions: [selectOption("picker", "b", ["a", "b", ""])] });

    await expect(stale).rejects.toMatchObject({ reason: "unavailable" });
    expect(state.reconciled).toHaveLength(0);
    expect(control.getConfigOptions()[0]).toMatchObject({ currentValue: "a" });

    // A write from the new incarnation proceeds normally.
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: [selectOption("picker", "b", ["a", "b", ""])],
    });
    await expect(control.setConfigOption("picker", "b")).resolves.toBeUndefined();
    expect(state.reconciled).toHaveLength(1);
  });

  it("refuses a second concurrent write and a write queued behind applyTurnConfig", async () => {
    let releaseEcho: ((reply: SetConfigOptionReply) => void) | undefined;
    const { connection, configSync, control } = makeControl();
    connection.setSessionConfigOption.mockImplementationOnce(
      () =>
        new Promise<SetConfigOptionReply>((resolve) => {
          releaseEcho = resolve;
        }),
    );
    const first = control.setConfigOption("picker", "b");
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());

    await expect(control.setConfigOption("picker", "a")).rejects.toMatchObject({
      reason: "conflict",
    });
    releaseEcho?.({ configOptions: [selectOption("picker", "b", ["a", "b", ""])] });
    await first;

    // While the prompt's own config push holds the writer, a menu write conflicts.
    const turnPush = configSync.configWrites.runExclusive(
      () => new Promise((resolve) => setTimeout(resolve, 15)),
    );
    await expect(control.setConfigOption("picker", "a")).rejects.toMatchObject({
      reason: "conflict",
    });
    await turnPush;
    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: [selectOption("picker", "a", ["a", "b", ""])],
    });
    await expect(control.setConfigOption("picker", "a")).resolves.toBeUndefined();
  });

  it("rejects prompt-time writes by default and honors the qualified opt-in", async () => {
    const guarded = makeControl({ foregroundPromptOpen: true });
    await expect(guarded.control.setConfigOption("picker", "b")).rejects.toMatchObject({
      reason: "conflict",
    });
    expect(guarded.connection.setSessionConfigOption).not.toHaveBeenCalled();

    const qualified = makeControl({ foregroundPromptOpen: true, allowDuringPrompt: true });
    await expect(qualified.control.setConfigOption("picker", "b")).resolves.toBeUndefined();
    expect(qualified.connection.setSessionConfigOption).toHaveBeenCalledTimes(1);
  });
});

describe("AcpLiveConfigControl — normalizer lanes", () => {
  it("validates and confirms against the normalized view, never the raw echo", async () => {
    // The provider normalizer rewrites the raw wire value into the
    // Poracode-facing id; the raw list must never reach the cache.
    const rawOption = selectOption("picker", "RAW_A", ["RAW_A", "RAW_B"]);
    const connection = {
      setSessionConfigOption: vi
        .fn<(args: SetConfigOptionArgs) => Promise<SetConfigOptionReply>>()
        .mockImplementation(async (args: SetConfigOptionArgs) => ({
          configOptions: [
            { ...rawOption, currentValue: args.value === "norm-b" ? "RAW_B" : "RAW_A" },
          ],
        })),
    };
    const configSync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      undefined,
      {},
      (options) =>
        options.map((option) => {
          const raw = (option as { currentValue?: string }).currentValue;
          return selectOption("picker", raw === "RAW_B" ? "norm-b" : "norm-a", [
            "norm-a",
            "norm-b",
          ]);
        }),
    );
    configSync.rememberOptions([], [structuredClone(rawOption)]);
    const state = {
      currentConfig: { model: "model-a", mode: "agent", approvalPolicy: "default" } as ThreadConfig,
      reconciled: [] as Array<ThreadConfig | undefined>,
    };
    const control = new AcpLiveConfigControl({
      connection: connection as unknown as ClientSideConnection,
      configSync,
      configWrites: configSync.configWrites,
      getOwner: () => ({
        sessionId: "session-1",
        generation: 1,
        disposed: false,
        transportClosed: false,
      }),
      isBooleanCapabilityNegotiated: () => false,
      isForegroundPromptOpen: () => false,
      allowDuringPrompt: () => false,
      getCurrentConfig: () => state.currentConfig,
      onConfigReconciled: (next) => {
        state.reconciled.push(next);
        if (next) state.currentConfig = next;
      },
    });

    // The RAW wire value is not advertised in the normalized view.
    await expect(control.setConfigOption("picker", "RAW_B")).rejects.toMatchObject({
      reason: "invalid_value",
    });
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();

    // The normalized value goes out, and the raw echo confirms through the
    // normalizer instead of leaking into the cache.
    await control.setConfigOption("picker", "norm-b");
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "picker",
      value: "norm-b",
    });
    expect(configSync.listRetainedConfigOptions()).toEqual([
      selectOption("picker", "norm-b", ["norm-a", "norm-b"]),
    ]);
    expect(state.reconciled).toHaveLength(1);
  });
});

describe("AcpLiveConfigControl — unlisted select value guard", () => {
  it("stays strict without a declaration", async () => {
    const { connection, control, state } = makeControl();
    await expect(control.setConfigOption("picker", "composite a+b")).rejects.toMatchObject({
      reason: "invalid_value",
    });
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    expect(state.reconciled).toEqual([]);
  });

  it("rejects a declared guard's declined verdict before any send", async () => {
    const guard = vi.fn<AcpUnlistedSelectValueGuard>(() => false);
    const { connection, control } = makeControl({ allowUnlistedSelectValue: guard });
    await expect(control.setConfigOption("picker", "composite a+b")).rejects.toMatchObject({
      reason: "invalid_value",
    });
    expect(guard).toHaveBeenCalledOnce();
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("sends exactly the declared composite value and confirms it through the echo", async () => {
    const guard = vi.fn<AcpUnlistedSelectValueGuard>(() => true);
    const { connection, control, state } = makeControl({ allowUnlistedSelectValue: guard });
    await expect(control.setConfigOption("picker", "composite a+b")).resolves.toBeUndefined();
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "picker",
      value: "composite a+b",
    });
    expect(control.getConfigOptions()[0]).toMatchObject({ currentValue: "composite a+b" });
    expect(state.reconciled).toHaveLength(1);
  });

  it("sends a declared empty-string value when the option does not advertise one", async () => {
    const guard = vi.fn<AcpUnlistedSelectValueGuard>(() => true);
    const { connection, control } = makeControl({
      configOptions: [selectOption("picker", "a", ["a", "b"])],
      allowUnlistedSelectValue: guard,
    });
    await expect(control.setConfigOption("picker", "")).resolves.toBeUndefined();
    expect(guard).toHaveBeenCalledWith("picker", "", expect.objectContaining({ id: "picker" }));
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "picker",
      value: "",
    });
  });

  it("never consults the guard for an advertised value, an unknown option, or a non-select type", async () => {
    const guard = vi.fn<AcpUnlistedSelectValueGuard>(() => true);
    const { connection, control } = makeControl({ allowUnlistedSelectValue: guard });

    // Advertised membership: the default strict path admits it untouched.
    await expect(control.setConfigOption("picker", "b")).resolves.toBeUndefined();
    expect(guard).not.toHaveBeenCalled();

    // Unknown option: refused before any type or membership check.
    await expect(control.setConfigOption("missing", "b")).rejects.toMatchObject({
      reason: "unknown_option",
    });
    expect(guard).not.toHaveBeenCalled();

    // String for a boolean control stays a typed invalid value.
    await expect(control.setConfigOption("toggle", "true")).rejects.toMatchObject({
      reason: "invalid_value",
    });
    // Boolean for a select control stays a typed invalid value.
    await expect(control.setConfigOption("picker", true)).rejects.toMatchObject({
      reason: "invalid_value",
    });
    expect(guard).not.toHaveBeenCalled();
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(1);
  });

  it("fails visibly when the guard throws, before any send", async () => {
    const guard = vi.fn<AcpUnlistedSelectValueGuard>(() => {
      throw new Error("guard crashed");
    });
    const { connection, control } = makeControl({ allowUnlistedSelectValue: guard });
    await expect(control.setConfigOption("picker", "composite a+b")).rejects.toMatchObject({
      reason: "invalid_value",
      message: expect.stringContaining("guard crashed"),
    });
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("hands the guard a detached option snapshot", async () => {
    const guard = vi.fn<AcpUnlistedSelectValueGuard>((_configId, _value, option) => {
      option.currentValue = "forged";
      (option.options as unknown[]).push({ value: "forged", name: "Forged" });
      return true;
    });
    const { control, configSync } = makeControl({ allowUnlistedSelectValue: guard });
    await expect(control.setConfigOption("picker", "composite a+b")).resolves.toBeUndefined();
    // Mutating the snapshot never reaches retained state, and no option row
    // or alias is manufactured: the advertised list stays exactly as
    // advertised ("a", "b", and the legitimate empty id).
    expect(configSync.listRetainedConfigOptions()[0]).toMatchObject({
      currentValue: "composite a+b",
    });
    const retainedValues = (
      configSync.listRetainedConfigOptions()[0] as { options: Array<{ value?: string }> }
    ).options.map((entry) => entry.value);
    expect(retainedValues).toEqual(["a", "b", ""]);
    expect(retainedValues).not.toContain("forged");
    expect(control.getConfigOptions()[0]).toMatchObject({ currentValue: "composite a+b" });
  });

  it("holds the echo confirmation and write lock for guard-approved writes", async () => {
    let releaseEcho: ((reply: SetConfigOptionReply) => void) | undefined;
    const guard = vi.fn<AcpUnlistedSelectValueGuard>(() => true);
    const { connection, control, state } = makeControl({
      allowUnlistedSelectValue: guard,
      echo: {
        configOptions: [selectOption("picker", "a", ["a", "b"])],
      },
    });
    connection.setSessionConfigOption.mockImplementationOnce(
      () =>
        new Promise<SetConfigOptionReply>((resolve) => {
          releaseEcho = resolve;
        }),
    );

    // The agent clamps the guard-approved write: the echo carries the old value.
    const settled = control.setConfigOption("picker", "composite a+b");
    await vi.waitFor(() => expect(connection.setSessionConfigOption).toHaveBeenCalledOnce());

    // A second mutation over the unknown first outcome is refused.
    await expect(control.setConfigOption("picker", "b")).rejects.toMatchObject({
      reason: "conflict",
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(1);

    releaseEcho?.({ configOptions: [selectOption("picker", "a", ["a", "b"])] });
    await expect(settled).rejects.toMatchObject({ reason: "unconfirmed" });
    expect(state.reconciled).toEqual([]);
  });
});
