import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import type { AcpSessionConfigSync } from "./sessionConfigSync";
import { makeConfigSyncSession } from "./sessionTestFixture";

afterEach(() => vi.restoreAllMocks());

describe("live session config-option inventory push", () => {
  function modelSelect(currentValue = "model-a") {
    return {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue,
      options: [
        { value: "model-a", name: "Model A" },
        { value: "model-b", name: "Model B" },
      ],
    };
  }

  function thoughtLevel(values: readonly (readonly [string, string])[], currentValue: string) {
    return {
      id: "thought_level",
      category: "thought_level",
      type: "select",
      name: "Thought Level",
      currentValue,
      options: values.map(([value, name]) => ({ value, name })),
    };
  }

  const LADDER_3 = [
    ["low", "Low"],
    ["high", "High"],
    ["max", "Max"],
  ] as const;
  const LADDER_5 = [
    ["low", "Low"],
    ["medium", "Medium"],
    ["high", "High"],
    ["xhigh", "XHigh"],
    ["max", "Max"],
  ] as const;

  function inventoryUpdates(listener: {
    onUpdate: { mock: { calls: Array<[unknown]> } };
  }): Array<Record<string, unknown>> {
    return listener.onUpdate.mock.calls
      .map(([update]) => update)
      .filter(
        (update): update is Record<string, unknown> =>
          !!update && typeof update === "object" && "sessionConfigOptions" in update,
      );
  }

  function openConfig(): ThreadConfig {
    return { model: "model-a", effort: "low", mode: "agent", approvalPolicy: "default" };
  }

  it("publishes the negotiated inventory on open — retirement first, then roles and honest shapes", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.newSession.mockResolvedValueOnce({
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [
        modelSelect(),
        thoughtLevel(LADDER_3, "low"),
        { id: "weird", name: "Weird", category: "model", type: "hyperspace" },
      ],
    });

    await session.openThread(openConfig());

    const updates = inventoryUpdates(listener);
    expect(updates).toHaveLength(2);
    // Before the agent speaks the previous inventory is retired explicitly —
    // never an authoritative-looking empty list.
    expect(updates[0]!.sessionConfigOptions).toBeNull();
    const inventory = updates[1]!.sessionConfigOptions as Array<Record<string, unknown>>;
    expect(inventory).toHaveLength(3);
    expect(inventory[0]).toMatchObject({
      type: "select",
      id: "model",
      role: "model",
      currentValue: "model-a",
    });
    expect(inventory[1]).toMatchObject({
      type: "select",
      id: "thought_level",
      role: "effort",
      currentValue: "low",
      values: LADDER_3.map(([value, name]) => ({ value, name })),
    });
    expect(inventory[2]).toMatchObject({ type: "unsupported", id: "weird" });
    expect(inventory[2]).not.toHaveProperty("role");
  });

  it.each(["loadSession", "resumeSession"] as const)(
    "publishes the authoritative %s result while trailing historical notifications stay suppressed",
    async (method) => {
      vi.spyOn(Date, "now").mockReturnValue(10_000);
      const { connection, listener, session } = makeConfigSyncSession();
      if (method === "resumeSession")
        (session as unknown as Record<string, unknown>)["agentSessionCapabilities"] = {
          resume: {},
        };
      connection[method].mockImplementationOnce(async () => {
        session.handleSessionUpdate({
          update: {
            sessionUpdate: "config_option_update",
            configOptions: [modelSelect("model-b"), thoughtLevel(LADDER_3, "high")],
          },
        });
        return {
          modes: { availableModes: [] },
          configOptions: [modelSelect(), thoughtLevel(LADDER_5, "low")],
        };
      });
      await session.openThread(openConfig(), {
        providerSessionId: "existing-session",
        discoveredAt: "2026-10-08T00:00:00Z",
      });
      const updates = inventoryUpdates(listener);
      expect(updates).toHaveLength(2);
      expect(updates[0]!.sessionConfigOptions).toBeNull();
      expect(updates[1]!.sessionConfigOptions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "model", currentValue: "model-a" }),
          expect.objectContaining({
            role: "effort",
            currentValue: "low",
            values: LADDER_5.map(([value, name]) => ({ value, name })),
          }),
        ]),
      );
    },
  );
  it("replaces a 3-value ladder with the target model's 5-value ladder on a model switch", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.newSession.mockResolvedValueOnce({
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [modelSelect("model-a"), thoughtLevel(LADDER_3, "low")],
    });
    await session.openThread(openConfig());
    const pushesBefore = inventoryUpdates(listener).length;

    connection.setSessionConfigOption.mockResolvedValue({
      configOptions: [modelSelect("model-b"), thoughtLevel(LADDER_5, "low")],
    });
    const sync = (session as unknown as { sessionConfigSync: AcpSessionConfigSync })
      .sessionConfigSync;
    const confirmed = await sync.applyTurnConfig(
      "session-1",
      { ...openConfig(), model: "model-b" },
      openConfig(),
    );

    expect(confirmed?.model).toBe("model-b");
    const updates = inventoryUpdates(listener);
    expect(updates).toHaveLength(pushesBefore + 1);
    const inventory = updates[updates.length - 1]!.sessionConfigOptions as Array<
      Record<string, unknown>
    >;
    expect(inventory).toHaveLength(2);
    expect(inventory[0]).toMatchObject({ id: "model", role: "model", currentValue: "model-b" });
    expect(inventory[1]).toMatchObject({
      id: "thought_level",
      role: "effort",
      currentValue: "low",
      values: LADDER_5.map(([value, name]) => ({ value, name })),
    });
  });

  it("pushes a new ladder even when every ThreadConfig scalar is unchanged", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.newSession.mockResolvedValueOnce({
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [modelSelect("model-a"), thoughtLevel(LADDER_5, "low")],
    });
    await session.openThread(openConfig());
    const pushesBefore = inventoryUpdates(listener).length;

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [
          modelSelect("model-a"),
          thoughtLevel([...LADDER_5, ["boost", "Boost"] as const], "low"),
        ],
      },
    });

    const updates = inventoryUpdates(listener);
    expect(updates).toHaveLength(pushesBefore + 1);
    const inventory = updates[updates.length - 1]!.sessionConfigOptions as Array<
      Record<string, unknown>
    >;
    expect(inventory[1]!.values as Array<unknown>).toHaveLength(6);
  });

  it("dedupes a replayed identical inventory into one push", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.newSession.mockResolvedValueOnce({
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [modelSelect("model-a"), thoughtLevel(LADDER_5, "low")],
    });
    await session.openThread(openConfig());
    const pushesBefore = inventoryUpdates(listener).length;
    const ladder3Echo = {
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [modelSelect("model-a"), thoughtLevel(LADDER_3, "low")],
      },
    };

    // The echo lands once…
    session.handleSessionUpdate(ladder3Echo);
    expect(inventoryUpdates(listener)).toHaveLength(pushesBefore + 1);

    // …and an identical replay of it dedupes to nothing.
    session.handleSessionUpdate(ladder3Echo);
    expect(inventoryUpdates(listener)).toHaveLength(pushesBefore + 1);

    // A plain text chunk carries no inventory and must not disturb the one
    // already published.
    session.handleSessionUpdate({
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
    });
    expect(inventoryUpdates(listener)).toHaveLength(pushesBefore + 1);
  });

  it("publishes a detached copy — mutating a received inventory cannot poison session state", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.newSession.mockResolvedValueOnce({
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [modelSelect("model-a"), thoughtLevel(LADDER_5, "low")],
    });
    await session.openThread(openConfig());
    const pushesBefore = inventoryUpdates(listener).length;
    const received = inventoryUpdates(listener)[pushesBefore - 1]!.sessionConfigOptions as Array<
      Record<string, unknown>
    >;
    received.push({ type: "unsupported", id: "injected" });
    (received[1]!.values as Array<unknown>).push({ value: "injected", name: "Injected" });

    session.handleSessionUpdate({
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [modelSelect("model-a"), thoughtLevel(LADDER_5, "low")],
      },
    });

    // The stored inventory never aliased the mutated copy: the identical
    // native replay still dedupes to no push, and the retained view is clean.
    expect(inventoryUpdates(listener)).toHaveLength(pushesBefore);
    const sync = (session as unknown as { sessionConfigSync: AcpSessionConfigSync })
      .sessionConfigSync;
    expect(sync.listConfigOptionDescriptors()).toHaveLength(2);
  });

  it("keeps the previous inventory when a projection exceeds the detached push bound", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    const bigValues = Array.from({ length: 700 }, (_, index) => ({
      value: `v${index}`,
      name: "x".repeat(1000),
    }));
    connection.newSession.mockResolvedValueOnce({
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [
        { id: "huge", category: "model", type: "select", currentValue: "v0", options: bigValues },
      ],
    });

    await session.openThread({ model: "model-a" });

    const updates = inventoryUpdates(listener);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.sessionConfigOptions).toBeNull();
    expect(
      (session as unknown as Record<string, unknown>)["pushedSessionConfigOptions"],
    ).toBeNull();

    // The bound skip is not sticky: a later small inventory publishes.
    session.handleSessionUpdate({
      update: { sessionUpdate: "config_option_update", configOptions: [modelSelect()] },
    });
    expect(inventoryUpdates(listener)).toHaveLength(2);
  });

  it("retires the previous incarnation's inventory with an explicit null on re-open", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.newSession.mockResolvedValue({
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [modelSelect(), thoughtLevel(LADDER_3, "low")],
    });
    await session.openThread(openConfig());
    expect(inventoryUpdates(listener)).toHaveLength(2);

    await session.openThread(openConfig());

    const updates = inventoryUpdates(listener);
    expect(updates).toHaveLength(4);
    expect(updates[2]!.sessionConfigOptions).toBeNull();
    expect(Array.isArray(updates[3]!.sessionConfigOptions)).toBe(true);
  });

  it("replays the retained inventory to a listener installed after ingestion", async () => {
    const { connection, session } = makeConfigSyncSession();
    connection.newSession.mockResolvedValueOnce({
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [modelSelect("model-a"), thoughtLevel(LADDER_3, "low")],
    });
    await session.openThread(openConfig());

    const lateUpdates: Array<Record<string, unknown>> = [];
    session.setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: (update: unknown) => {
        lateUpdates.push(update as Record<string, unknown>);
      },
    });

    const replayed = lateUpdates.filter((update) => "sessionConfigOptions" in update);
    expect(replayed).toHaveLength(1);
    expect(replayed[0]!.sessionConfigOptions).toEqual([
      {
        type: "select",
        id: "model",
        name: "Model",
        category: "model",
        role: "model",
        currentValue: "model-a",
        values: [
          { value: "model-a", name: "Model A" },
          { value: "model-b", name: "Model B" },
        ],
        groups: [],
      },
      {
        type: "select",
        id: "thought_level",
        name: "Thought Level",
        category: "thought_level",
        role: "effort",
        currentValue: "low",
        values: LADDER_3.map(([value, name]) => ({ value, name })),
        groups: [],
      },
    ]);
  });

  it("never claims an inventory for a handle whose agent never spoke", () => {
    const { listener, session } = makeConfigSyncSession();
    const lateListener = { onUpdate: vi.fn<(update: unknown) => void>() };

    session.setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: lateListener.onUpdate,
    });

    // Other state may replay, but no `sessionConfigOptions` key may appear:
    // absence — not `[]` — is the honest pre-open state.
    expect(lateListener.onUpdate).toHaveBeenCalledTimes(1);
    const update = lateListener.onUpdate.mock.calls[0]![0] as Record<string, unknown>;
    expect(update).not.toHaveProperty("sessionConfigOptions");
    expect(listener.onUpdate).not.toHaveBeenCalled();
  });

  describe("declared fast binding", () => {
    const binding = { configId: "pace", disabled: "steady", enabled: "rapid" };

    function paceSelect(currentValue: string) {
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
      };
    }

    function fastDescriptor(update: Record<string, unknown>): Record<string, unknown> {
      const inventory = update.sessionConfigOptions as Array<Record<string, unknown>>;
      return inventory.find((option) => option.id === "pace")!;
    }

    it("pushes the bound fast role with native values on first open and after a setter echo", async () => {
      const { connection, listener, session } = makeConfigSyncSession({
        behavior: { fastConfigBinding: binding },
      });
      connection.newSession.mockResolvedValueOnce({
        sessionId: "session-1",
        modes: { availableModes: [] },
        configOptions: [modelSelect(), paceSelect("steady")],
      });

      await session.openThread(openConfig());

      // First open: the exact native select carries the composer's fast role,
      // with its values and current value untouched.
      expect(fastDescriptor(inventoryUpdates(listener)[1]!)).toEqual({
        type: "select",
        id: "pace",
        name: "Pace",
        category: "model_config",
        role: "fast",
        currentValue: "steady",
        values: [
          { value: "steady", name: "Steady" },
          { value: "rapid", name: "Rapid" },
        ],
        groups: [],
      });

      const pushesBefore = inventoryUpdates(listener).length;
      connection.setSessionConfigOption.mockResolvedValue({
        configOptions: [modelSelect(), paceSelect("rapid")],
      });
      const sync = (session as unknown as { sessionConfigSync: AcpSessionConfigSync })
        .sessionConfigSync;
      const confirmed = await sync.applyTurnConfig(
        "session-1",
        { ...openConfig(), fast: true },
        openConfig(),
      );

      // The setter echo republishes with the role intact and no value rewrite.
      expect(confirmed?.fast).toBe(true);
      expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
        sessionId: "session-1",
        configId: "pace",
        value: "rapid",
      });
      const updates = inventoryUpdates(listener);
      expect(updates).toHaveLength(pushesBefore + 1);
      expect(fastDescriptor(updates[updates.length - 1]!)).toMatchObject({
        role: "fast",
        currentValue: "rapid",
        values: [
          { value: "steady", name: "Steady" },
          { value: "rapid", name: "Rapid" },
        ],
      });
    });

    it.each(["loadSession", "resumeSession"] as const)(
      "keeps the bound fast role through a %s reopen",
      async (method) => {
        vi.spyOn(Date, "now").mockReturnValue(10_000);
        const { connection, listener, session } = makeConfigSyncSession({
          behavior: { fastConfigBinding: binding },
        });
        if (method === "resumeSession")
          (session as unknown as Record<string, unknown>)["agentSessionCapabilities"] = {
            resume: {},
          };
        connection[method].mockResolvedValueOnce({
          modes: { availableModes: [] },
          configOptions: [modelSelect(), paceSelect("rapid")],
        });

        await session.openThread(openConfig(), {
          providerSessionId: "existing-session",
          discoveredAt: "2026-10-08T00:00:00Z",
        });

        const updates = inventoryUpdates(listener);
        expect(updates).toHaveLength(2);
        expect(updates[0]!.sessionConfigOptions).toBeNull();
        expect(fastDescriptor(updates[1]!)).toMatchObject({
          role: "fast",
          currentValue: "rapid",
        });
      },
    );
  });
});
