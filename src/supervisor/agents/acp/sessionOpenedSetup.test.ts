import type { ThreadConfig } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import type { AcpStructuredSessionOptions } from "./session";
import {
  AcpOpenedSessionSetupStaleError,
  OPENED_SESSION_OPEN_RESPONSE_MAX_BYTES,
  runAcpOpenedSessionSetup,
  type AcpConfigureOpenedSession,
  type AcpConfigureOpenedSessionContext,
} from "./sessionOpenedSetup";
import { makeConfigSyncSession } from "./sessionTestFixture";

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

describe("runAcpOpenedSessionSetup — fail-closed hook runner", () => {
  function makeSetup() {
    const owner = {
      sessionId: "session-1",
      generation: 1,
      disposed: false,
      transportClosed: false,
    };
    const readConfigOptions = vi.fn<() => readonly unknown[]>(() => [
      selectOption("picker", "a", ["a", "b"]),
    ]);
    const writeConfigOption = vi.fn<
      (
        configId: string,
        value: string | boolean,
        callOptions?: { signal?: AbortSignal },
      ) => Promise<void>
    >(async () => {});
    const run = (hook: AcpConfigureOpenedSession, openResponse: unknown = { opaque: true }) =>
      runAcpOpenedSessionSetup({
        kind: "new",
        sessionId: "session-1",
        openResponse,
        hook,
        getOwner: () => ({ ...owner }),
        readConfigOptions,
        writeConfigOption,
      });
    return { owner, readConfigOptions, writeConfigOption, run };
  }

  it("skips without a hook and never touches the reader or writer", async () => {
    const { readConfigOptions, writeConfigOption } = makeSetup();
    await expect(
      runAcpOpenedSessionSetup({
        kind: "new",
        sessionId: "session-1",
        openResponse: {},
        hook: undefined,
        getOwner: () => undefined,
        readConfigOptions,
        writeConfigOption,
      }),
    ).resolves.toBe("skipped");
    expect(readConfigOptions).not.toHaveBeenCalled();
    expect(writeConfigOption).not.toHaveBeenCalled();
  });

  it("delivers the kind, exact session id, and a detached open-response snapshot", async () => {
    const { run } = makeSetup();
    const raw = { opaqueLaunchMeta: { sticky: true } };
    let received: AcpConfigureOpenedSessionContext | undefined;
    await expect(
      run((context) => {
        received = context;
      }, raw),
    ).resolves.toBe("ran");
    expect(received?.kind).toBe("new");
    expect(received?.sessionId).toBe("session-1");
    expect(received?.openResponse).toEqual(raw);
    // Detached: mutating the snapshot cannot reach the raw response.
    (received!.openResponse as { opaqueLaunchMeta: unknown }).opaqueLaunchMeta = "mutated";
    expect(raw.opaqueLaunchMeta).toEqual({ sticky: true });
  });

  it("rejects when the open response cannot be detached", async () => {
    const { run } = makeSetup();
    const hook = vi.fn<NonNullable<AcpConfigureOpenedSession>>();
    // A function value makes the structured clone throw.
    await expect(run(hook, { uncloneable: () => "value" })).rejects.toThrow(
      /could not detach the open response/,
    );
    expect(hook).not.toHaveBeenCalled();
  });

  it("rejects when the open-response snapshot exceeds JSON bounds", async () => {
    const { run } = makeSetup();
    const hook = vi.fn<NonNullable<AcpConfigureOpenedSession>>();
    await expect(
      run(hook, { blob: "x".repeat(OPENED_SESSION_OPEN_RESPONSE_MAX_BYTES) }),
    ).rejects.toThrow(/exceeds JSON bounds/);
    expect(hook).not.toHaveBeenCalled();
  });

  it.each([
    ["the owner is gone", undefined],
    ["the session is disposed", { disposed: true }],
    ["the transport is closed", { transportClosed: true }],
  ])("rejects before the hook when %s", async (_, patch) => {
    const base = {
      sessionId: "session-1",
      generation: 1,
      disposed: false,
      transportClosed: false,
    };
    const readConfigOptions = vi.fn<() => readonly unknown[]>(() => []);
    const writeConfigOption = vi.fn<
      (
        configId: string,
        value: string | boolean,
        callOptions?: { signal?: AbortSignal },
      ) => Promise<void>
    >(async () => {});
    const hook = vi.fn<NonNullable<AcpConfigureOpenedSession>>();
    await expect(
      runAcpOpenedSessionSetup({
        kind: "new",
        sessionId: "session-1",
        openResponse: {},
        hook,
        getOwner: () => (patch === undefined ? undefined : { ...base, ...patch }),
        readConfigOptions,
        writeConfigOption,
      }),
    ).rejects.toBeInstanceOf(AcpOpenedSessionSetupStaleError);
    expect(hook).not.toHaveBeenCalled();
    expect(readConfigOptions).not.toHaveBeenCalled();
    expect(writeConfigOption).not.toHaveBeenCalled();
  });

  it("rejects a hook completion whose incarnation ended while the hook ran", async () => {
    const { owner, run } = makeSetup();
    await expect(
      run(() => {
        owner.generation += 1;
      }),
    ).rejects.toBeInstanceOf(AcpOpenedSessionSetupStaleError);
  });

  it.each([
    ["a reopen", { generation: 2 }],
    ["a dispose", { disposed: true }],
    ["a transport close", { transportClosed: true }],
  ])("fences callbacks once the incarnation ends mid-hook after %s", async (_, patch) => {
    const { owner, run, writeConfigOption } = makeSetup();
    let saved: AcpConfigureOpenedSessionContext | undefined;
    await expect(
      run((context) => {
        // Retained while the phase is still open, then the incarnation ends.
        saved = context;
        Object.assign(owner, patch);
      }),
    ).rejects.toBeInstanceOf(AcpOpenedSessionSetupStaleError);
    expect(() => saved!.readCurrentConfigOptions()).toThrow(AcpOpenedSessionSetupStaleError);
    await expect(saved!.setConfigOption("picker", "b")).rejects.toBeInstanceOf(
      AcpOpenedSessionSetupStaleError,
    );
    expect(writeConfigOption).not.toHaveBeenCalled();
  });

  it("closes the context once the hook ends, even while the same incarnation is still alive", async () => {
    const { run, writeConfigOption } = makeSetup();
    let saved: AcpConfigureOpenedSessionContext | undefined;
    await expect(
      run((context) => {
        saved = context;
      }),
    ).resolves.toBe("ran");
    // The owner never changed — the hook's active phase is what ended.
    expect(() => saved!.readCurrentConfigOptions()).toThrow(AcpOpenedSessionSetupStaleError);
    await expect(saved!.setConfigOption("picker", "b")).rejects.toBeInstanceOf(
      AcpOpenedSessionSetupStaleError,
    );
    expect(writeConfigOption).not.toHaveBeenCalled();
  });

  it("closes the context when the hook throws and rejects the run with that error", async () => {
    const { run, writeConfigOption } = makeSetup();
    let saved: AcpConfigureOpenedSessionContext | undefined;
    await expect(
      run((context) => {
        saved = context;
        throw new Error("hook exploded");
      }),
    ).rejects.toThrow("hook exploded");
    expect(() => saved!.readCurrentConfigOptions()).toThrow(AcpOpenedSessionSetupStaleError);
    await expect(saved!.setConfigOption("picker", "b")).rejects.toBeInstanceOf(
      AcpOpenedSessionSetupStaleError,
    );
    expect(writeConfigOption).not.toHaveBeenCalled();
  });

  it("rejects when a write's incarnation ends between the send and its completion", async () => {
    const { owner, run, writeConfigOption } = makeSetup();
    writeConfigOption.mockImplementationOnce(async () => {
      owner.generation += 1;
    });
    await expect(
      run(async (context) => {
        await context.setConfigOption("picker", "b");
      }),
    ).rejects.toBeInstanceOf(AcpOpenedSessionSetupStaleError);
    // The write itself landed; only its outcome is discarded.
    expect(writeConfigOption).toHaveBeenCalledWith("picker", "b", undefined);
  });

  it("rejects with the writer's own failure", async () => {
    const { run, writeConfigOption } = makeSetup();
    writeConfigOption.mockRejectedValueOnce(new Error("write rejected"));
    await expect(
      run(async (context) => {
        await context.setConfigOption("picker", "b");
      }),
    ).rejects.toThrow("write rejected");
  });
});

describe("configureOpenedSession — integration through openThread", () => {
  function makeOpenSession(
    overrides: {
      hook?: AcpConfigureOpenedSession;
      allowUnlistedSelectValue?: AcpStructuredSessionOptions["allowUnlistedSelectValue"];
      agentSessionCapabilities?: Record<string, unknown> | undefined;
      newSessionResult?: Record<string, unknown>;
      loadSessionResult?: Record<string, unknown>;
      resumeSessionResult?: Record<string, unknown>;
    } = {},
  ) {
    const { connection, listener, session } = makeConfigSyncSession();
    const internal = session as unknown as Record<string, unknown>;
    // A compliant echo: the retained option list with the write applied. This
    // is what lets a hook-driven write confirm without a follow-up
    // config_option_update notification. The advertised list is wide enough
    // for every value written in this file, so a rejected write can only be a
    // fence, never the strict membership check.
    connection.setSessionConfigOption.mockImplementation(
      async (args: { configId: string; value: string }) => ({
        configOptions: [
          selectOption(args.configId, String(args.value), ["a", "b", "stale", "new"]),
        ],
      }),
    );
    if (overrides.hook) internal["configureOpenedSession"] = overrides.hook;
    if (overrides.allowUnlistedSelectValue)
      internal["allowUnlistedSelectValue"] = overrides.allowUnlistedSelectValue;
    if (overrides.agentSessionCapabilities !== undefined)
      internal["agentSessionCapabilities"] = overrides.agentSessionCapabilities;
    if (overrides.newSessionResult)
      connection.newSession.mockResolvedValue(overrides.newSessionResult as { sessionId: string });
    if (overrides.loadSessionResult)
      connection.loadSession.mockResolvedValue(
        overrides.loadSessionResult as { modes?: { availableModes: Array<{ id: string }> } },
      );
    if (overrides.resumeSessionResult)
      connection.resumeSession.mockResolvedValue(
        overrides.resumeSessionResult as { modes?: { availableModes: Array<{ id: string }> } },
      );
    const sessionRef = (providerSessionId: string) => ({
      providerSessionId,
      discoveredAt: new Date().toISOString(),
    });
    const getConfigRef = () =>
      (
        session as unknown as {
          getSessionRef(): { providerSessionId: string } | undefined;
        }
      ).getSessionRef();
    const runtimeEventTypes = () =>
      (
        listener.onRuntimeEvent as unknown as {
          mock: { calls: Array<[event: { type?: string }]> };
        }
      ).mock.calls.map(([event]) => event?.type);
    const writtenValues = () =>
      (
        connection.setSessionConfigOption as unknown as {
          mock: { calls: Array<[args: { configId: string; value: string }]> };
        }
      ).mock.calls.map(([args]) => ({ configId: args.configId, value: args.value }));
    const launchOptions = () => internal["launchOptions"] as { resumeThreadId?: string };
    return {
      connection,
      listener,
      session,
      internal,
      sessionRef,
      getConfigRef,
      runtimeEventTypes,
      writtenValues,
      launchOptions,
    };
  }

  it("runs before the launch config push and sees the retained native options on session/new", async () => {
    const order: string[] = [];
    const raw = {
      sessionId: "session-1",
      modes: { availableModes: [{ id: "agent" }, { id: "plan" }], currentModeId: "agent" },
      configOptions: [selectOption("picker", "a", ["a", "b"])],
      opaqueLaunchMeta: { sticky: true },
    };
    let received: AcpConfigureOpenedSessionContext | undefined;
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => Promise<void>>(
      async (context) => {
        received = context;
        // The open response's options are already retained when the hook runs.
        const options = context.readCurrentConfigOptions();
        expect(options).toHaveLength(1);
        expect((options[0] as { id?: string }).id).toBe("picker");
        order.push("hook");
        await context.setConfigOption("picker", "b");
        order.push("hook-write-done");
      },
    );
    const { connection, session } = makeOpenSession({ hook, newSessionResult: raw });
    connection.setSessionMode.mockImplementation(async () => {
      order.push("launch-config-push");
    });

    await session.openThread({ mode: "plan" } as ThreadConfig);

    expect(hook).toHaveBeenCalledOnce();
    expect(received?.kind).toBe("new");
    expect(received?.sessionId).toBe("session-1");
    expect(received?.openResponse).toEqual(raw);
    expect(received?.openResponse).not.toBe(raw);
    expect(order.indexOf("hook-write-done")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("hook-write-done")).toBeLessThan(order.indexOf("launch-config-push"));
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "picker",
      value: "b",
    });
    expect(connection.prompt).not.toHaveBeenCalled();
  });

  it("delivers fresh metadata on session/load", async () => {
    const rawLoad = {
      modes: { availableModes: [] },
      configOptions: [selectOption("picker", "a", ["a", "b"])],
      opaqueLoadMeta: "loaded",
    };
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => void>((context) => {
      expect(context.kind).toBe("load");
      expect(context.sessionId).toBe("session-legacy");
      expect((context.openResponse as { opaqueLoadMeta?: string }).opaqueLoadMeta).toBe("loaded");
    });
    const { connection, session, sessionRef } = makeOpenSession({
      hook,
      loadSessionResult: rawLoad,
    });

    await expect(
      session.openThread({ mode: "plan" } as ThreadConfig, sessionRef("session-legacy")),
    ).resolves.toBe("session-legacy");

    expect(connection.loadSession).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledOnce();
  });

  it("delivers fresh metadata on session/resume", async () => {
    const rawResume = {
      modes: { availableModes: [] },
      configOptions: [selectOption("picker", "a", ["a", "b"])],
      opaqueResumeMeta: "resumed",
    };
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => void>((context) => {
      expect(context.kind).toBe("resume");
      expect(context.sessionId).toBe("session-kept");
      expect((context.openResponse as { opaqueResumeMeta?: string }).opaqueResumeMeta).toBe(
        "resumed",
      );
    });
    const { connection, session, sessionRef } = makeOpenSession({
      hook,
      agentSessionCapabilities: { resume: {} },
      resumeSessionResult: rawResume,
    });

    await expect(
      session.openThread({ mode: "plan" } as ThreadConfig, sessionRef("session-kept")),
    ).resolves.toBe("session-kept");

    expect(connection.resumeSession).toHaveBeenCalledOnce();
    expect(connection.loadSession).not.toHaveBeenCalled();
    expect(hook).toHaveBeenCalledOnce();
  });

  it("rejects the open without prompt or launch setters when the hook throws, keeping the ref", async () => {
    const raw = {
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [selectOption("picker", "a", ["a", "b"])],
    };
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => Promise<void>>(async () => {
      throw new Error("hook exploded");
    });
    const { connection, session, getConfigRef, runtimeEventTypes } = makeOpenSession({
      hook,
      newSessionResult: raw,
    });

    await expect(session.openThread({ mode: "plan" } as ThreadConfig)).rejects.toThrow(
      "hook exploded",
    );

    // Fail closed: the open rejects — no fallback config path, no prompt.
    expect(hook).toHaveBeenCalledOnce();
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    expect(connection.setSessionMode).not.toHaveBeenCalled();
    expect(connection.prompt).not.toHaveBeenCalled();
    expect(
      runtimeEventTypes().some((type) => type === "turn.started" || type === "item.started"),
    ).toBe(false);
    // The allocated native session ref stays available for the supervisor's
    // unpublished-start custody.
    expect(getConfigRef()?.providerSessionId).toBe("session-1");
  });

  it("rejects the open when the hook's open response cannot be detached, keeping the ref", async () => {
    const raw = {
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [selectOption("picker", "a", ["a", "b"])],
      // A function value makes the structured clone throw.
      uncloneable: () => "value",
    };
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => void>();
    const { connection, session, getConfigRef } = makeOpenSession({
      hook,
      newSessionResult: raw,
    });

    await expect(session.openThread({ mode: "plan" } as ThreadConfig)).rejects.toThrow(
      /could not detach the open response/,
    );

    expect(hook).not.toHaveBeenCalled();
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    expect(connection.setSessionMode).not.toHaveBeenCalled();
    // Ref custody still holds for the allocated native session.
    expect(getConfigRef()?.providerSessionId).toBe("session-1");
  });

  it("fences callbacks retained past the hook when the same native id is reopened", async () => {
    const contexts: AcpConfigureOpenedSessionContext[] = [];
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => Promise<void>>(
      async (context) => {
        contexts.push(context);
        // The second (surviving) incarnation writes while its hook is active.
        if (contexts.length === 2) await context.setConfigOption("picker", "b");
      },
    );
    const raw = {
      modes: { availableModes: [] },
      configOptions: [selectOption("picker", "a", ["a", "b"])],
    };
    const { connection, session, sessionRef } = makeOpenSession({
      hook,
      agentSessionCapabilities: { resume: {} },
      resumeSessionResult: raw,
    });
    const ref = sessionRef("session-1");

    await session.openThread({ mode: "plan" } as ThreadConfig, ref);
    // Reopen reusing the exact same native session id.
    await session.openThread({ mode: "plan" } as ThreadConfig, ref);

    expect(hook).toHaveBeenCalledTimes(2);
    // The surviving incarnation's write landed while its hook ran.
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(1);
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "picker",
      value: "b",
    });
    // After the hooks ended, both contexts are dead: the first incarnation's
    // because the owner changed, the second's because its phase closed.
    for (const stale of contexts) {
      expect(() => stale.readCurrentConfigOptions()).toThrow(AcpOpenedSessionSetupStaleError);
      await expect(stale.setConfigOption("picker", "a")).rejects.toBeInstanceOf(
        AcpOpenedSessionSetupStaleError,
      );
    }
    expect(connection.setSessionConfigOption).toHaveBeenCalledTimes(1);
  });

  it("leaves the successor's config exact when the previous hook's deferred write lands late", async () => {
    const contexts: AcpConfigureOpenedSessionContext[] = [];
    const gates: Array<() => void> = [];
    const continuations: Promise<void>[] = [];
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => Promise<void>>(
      async (context) => {
        const index = contexts.length;
        contexts.push(context);
        if (index === 0) {
          // The first open defers a stale write that outlives its hook.
          let release!: () => void;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          gates.push(release);
          continuations.push(
            (async () => {
              await gate;
              await context.setConfigOption("picker", "stale");
            })(),
          );
        } else {
          // The successor's own hook writes its value inline.
          await context.setConfigOption("picker", "new");
        }
      },
    );
    // "stale" and "new" are advertised values, so a rejected write can only be
    // the fence's doing — not the strict membership check.
    const raw = {
      modes: { availableModes: [] },
      configOptions: [selectOption("picker", "a", ["a", "stale", "new"])],
    };
    const { session, sessionRef, writtenValues } = makeOpenSession({
      hook,
      agentSessionCapabilities: { resume: {} },
      resumeSessionResult: raw,
    });
    const ref = sessionRef("session-1");

    await session.openThread({ mode: "plan" } as ThreadConfig, ref);
    await session.openThread({ mode: "plan" } as ThreadConfig, ref);

    // Only the successor's write is on the wire so far.
    expect(writtenValues()).toEqual([{ configId: "picker", value: "new" }]);

    gates[0]!();
    await expect(continuations[0]).rejects.toBeInstanceOf(AcpOpenedSessionSetupStaleError);

    // The late stale write never reached the wire; the successor's value
    // stands exact.
    expect(writtenValues()).toEqual([{ configId: "picker", value: "new" }]);
  });

  it("fences callbacks retained past the hook after disposal", async () => {
    let saved: AcpConfigureOpenedSessionContext | undefined;
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => void>((context) => {
      saved = context;
    });
    const raw = {
      modes: { availableModes: [] },
      configOptions: [selectOption("picker", "a", ["a", "b"])],
    };
    const { connection, session, sessionRef } = makeOpenSession({
      hook,
      agentSessionCapabilities: { resume: {} },
      resumeSessionResult: raw,
    });

    await session.openThread({ mode: "plan" } as ThreadConfig, sessionRef("session-1"));
    await session.dispose();

    expect(() => saved!.readCurrentConfigOptions()).toThrow(AcpOpenedSessionSetupStaleError);
    await expect(saved!.setConfigOption("picker", "b")).rejects.toBeInstanceOf(
      AcpOpenedSessionSetupStaleError,
    );
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("fences a hook continuation that resumes after the same native id is reopened", async () => {
    let releaseContinuation!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseContinuation = resolve;
    });
    let continuation: Promise<void> | undefined;
    let calls = 0;
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => void>((context) => {
      calls += 1;
      // Only the first open schedules a deferred write; it outlives its hook.
      if (calls === 1) {
        continuation = (async () => {
          await gate;
          await context.setConfigOption("picker", "b");
        })();
      }
    });
    const raw = {
      modes: { availableModes: [] },
      configOptions: [selectOption("picker", "a", ["a", "b"])],
    };
    const { connection, session, sessionRef } = makeOpenSession({
      hook,
      agentSessionCapabilities: { resume: {} },
      resumeSessionResult: raw,
    });
    const ref = sessionRef("session-1");

    await session.openThread({ mode: "plan" } as ThreadConfig, ref);
    await session.openThread({ mode: "plan" } as ThreadConfig, ref);
    releaseContinuation();

    await expect(continuation).rejects.toBeInstanceOf(AcpOpenedSessionSetupStaleError);
    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("cannot adopt a superseded session/new result that resolves after a second open started", async () => {
    const contexts: AcpConfigureOpenedSessionContext[] = [];
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => void>((context) => {
      contexts.push(context);
    });
    const { connection, session, internal, getConfigRef, launchOptions } = makeOpenSession({
      hook,
    });
    const deferreds: Array<(value: unknown) => void> = [];
    connection.newSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferreds.push(resolve as (value: unknown) => void);
        }),
    );

    const superseded = session.openThread({ mode: "plan" } as ThreadConfig);
    const survivor = session.openThread({ mode: "plan" } as ThreadConfig);
    expect(deferreds).toHaveLength(2);

    // The old RPC resolves after the second open already bumped the
    // generation: it must reject and adopt nothing.
    deferreds[0]!({ sessionId: "session-old", modes: { availableModes: [] }, configOptions: [] });
    await expect(superseded).rejects.toBeInstanceOf(AcpOpenedSessionSetupStaleError);
    expect(internal["sessionId"]).toBe("session-1"); // fixture default, untouched
    expect(internal["usageScopeId"]).toBeUndefined();
    expect(getConfigRef()?.providerSessionId).toBe("session-1");
    expect(launchOptions().resumeThreadId).toBeUndefined();
    expect(hook).not.toHaveBeenCalled();

    // The survivor adopts its own result normally.
    deferreds[1]!({ sessionId: "session-new", modes: { availableModes: [] }, configOptions: [] });
    await expect(survivor).resolves.toBe("session-new");
    expect(getConfigRef()?.providerSessionId).toBe("session-new");
    expect(internal["usageScopeId"]).toBe("session-new");
    expect(launchOptions().resumeThreadId).toBe("session-new");
    expect(hook).toHaveBeenCalledOnce();
    expect(contexts[0]).toMatchObject({ kind: "new", sessionId: "session-new" });
  });

  it("keeps the successor's replay window when a superseded resume RPC resolves late", async () => {
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => void>();
    const { connection, session, internal, sessionRef } = makeOpenSession({
      hook,
      agentSessionCapabilities: { resume: {} },
    });
    const deferreds: Array<(value: unknown) => void> = [];
    connection.resumeSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferreds.push(resolve as (value: unknown) => void);
        }),
    );
    const ref = sessionRef("session-1");

    const superseded = session.openThread({ mode: "plan" } as ThreadConfig, ref);
    const survivor = session.openThread({ mode: "plan" } as ThreadConfig, ref);
    expect(deferreds).toHaveLength(2);
    expect(internal["isReplayingHistory"]).toBe(true);
    expect(internal["replayHistoryUntil"]).toBe(Infinity);

    deferreds[0]!({ modes: { availableModes: [] }, configOptions: [] });
    await expect(superseded).rejects.toBeInstanceOf(AcpOpenedSessionSetupStaleError);
    // The superseded open's finally left the successor's replay window alone.
    expect(internal["isReplayingHistory"]).toBe(true);
    expect(internal["replayHistoryUntil"]).toBe(Infinity);

    deferreds[1]!({ modes: { availableModes: [] }, configOptions: [] });
    await expect(survivor).resolves.toBe("session-1");
    // The survivor's own finally closed its replay window normally.
    expect(internal["isReplayingHistory"]).toBe(false);
    expect(internal["replayHistoryUntil"]).toBeLessThan(Infinity);
    expect(hook).toHaveBeenCalledOnce();
  });

  it("rejects an open whose RPC resolves after the session was disposed", async () => {
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => void>();
    const { connection, session, internal, getConfigRef } = makeOpenSession({ hook });
    const deferreds: Array<(value: unknown) => void> = [];
    connection.newSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferreds.push(resolve as (value: unknown) => void);
        }),
    );

    const open = session.openThread({ mode: "plan" } as ThreadConfig);
    const disposal = session.dispose();
    deferreds[0]!({ sessionId: "session-late", modes: { availableModes: [] }, configOptions: [] });

    await expect(open).rejects.toBeInstanceOf(AcpOpenedSessionSetupStaleError);
    expect(hook).not.toHaveBeenCalled();
    expect(internal["sessionId"]).toBe("session-1"); // fixture default, untouched
    expect(getConfigRef()?.providerSessionId).toBe("session-1");
    await disposal;
  });

  it("rejects an open whose RPC resolves after the transport closed", async () => {
    const hook = vi.fn<(context: AcpConfigureOpenedSessionContext) => void>();
    const { connection, session, internal } = makeOpenSession({ hook });
    const deferreds: Array<(value: unknown) => void> = [];
    connection.newSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferreds.push(resolve as (value: unknown) => void);
        }),
    );

    const open = session.openThread({ mode: "plan" } as ThreadConfig);
    // Mirrors the `connection.closed` handler: transport close does not bump
    // the generation, so the open fence must check it explicitly.
    internal["transportClosed"] = true;
    deferreds[0]!({ sessionId: "session-late", modes: { availableModes: [] }, configOptions: [] });

    await expect(open).rejects.toBeInstanceOf(AcpOpenedSessionSetupStaleError);
    expect(hook).not.toHaveBeenCalled();
    expect(internal["sessionId"]).toBe("session-1"); // fixture default, untouched
    expect(internal["usageScopeId"]).toBeUndefined();
  });

  it("keeps the open flow unchanged when the session declares no hook", async () => {
    const raw = {
      sessionId: "session-1",
      modes: { availableModes: [] },
      configOptions: [selectOption("picker", "a", ["a", "b"])],
    };
    const { connection, listener, session } = makeOpenSession({ newSessionResult: raw });

    await expect(session.openThread({ mode: "plan" } as ThreadConfig)).resolves.toBe("session-1");

    expect(connection.setSessionConfigOption).not.toHaveBeenCalled();
    expect(connection.prompt).not.toHaveBeenCalled();
    // The open inventory still publishes through the normal listener path.
    const updates = (
      listener.onUpdate as unknown as { mock: { calls: Array<[update: Record<string, unknown>]> } }
    ).mock.calls.map(([update]) => update);
    expect(
      updates.some((update) =>
        JSON.stringify(update.sessionConfigOptions ?? []).includes("picker"),
      ),
    ).toBe(true);
  });
});

describe("AcpStructuredSessionOptions — opened-session seam typing", () => {
  it("accepts both seam declarations on the session options", () => {
    // Compile-time proof that the seam lives on the factory options argument
    // (not on the shared launch input).
    const options: AcpStructuredSessionOptions = {
      configureOpenedSession: (context) => {
        void context.kind;
      },
      allowUnlistedSelectValue: (configId, value, option) =>
        option.type === "select" && configId.length > 0 && value.length >= 0,
    };
    expect(typeof options.configureOpenedSession).toBe("function");
    expect(typeof options.allowUnlistedSelectValue).toBe("function");
  });
});
