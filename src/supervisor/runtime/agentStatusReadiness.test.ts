import { STATUS_CACHE_VERSION } from "@/shared/agentStatusCache";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { normalizeSharedSettings } from "@/shared/settings";
import { localMachineKey } from "@/shared/machines";
import {
  memory,
  FAST,
  SLOW,
  DISTRO,
  nativeEnv,
  deferred,
  status,
  adapter,
  setup,
  activeDetection,
  modelIds,
  seedBaseline,
} from "./fixtures/agentStatusServiceFixture";
// Register the owned filesystem/probe mocks before loading the service.
import { readSupervisorSharedSettings } from "@/supervisor/runtime/supervisorSharedSettings";

describe("AgentStatusService accepted readiness publication", () => {
  it("reconciles removed registry kinds without dropping unrelated observations or accepting their late probes", async () => {
    seedBaseline();
    const held = deferred<AgentStatus>();
    const fast = vi.fn<AgentAdapter["detectInstall"]>(() => held.promise);
    const slow = vi.fn<AgentAdapter["detectInstall"]>(async () => status(SLOW, "unrelated"));
    const { service, registry, events } = setup([adapter(FAST, fast), adapter(SLOW, slow)]);
    const scoped = service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }] },
    });
    await vi.waitFor(() => expect(fast).toHaveBeenCalledOnce());
    await service.getAgentStatuses({ wslDistros: [] });
    const full = activeDetection(service);
    registry.delete(FAST);
    service.reconcileAgentRegistry([FAST]);
    expect(service.getCachedCapabilities(FAST)).toBeUndefined();
    expect(service.getCachedCapabilities(SLOW)?.models[0]?.id).toBe("baseline-slow");
    expect(events).toEqual([]);
    service.cancelAgentDiscovery();
    held.resolve(status(FAST, "obsolete"));
    expect(modelIds(await scoped)).toBeUndefined();
    await full.catch(() => undefined);
    expect(events).toContainEqual({
      type: "windows-agent-statuses",
      statuses: [expect.objectContaining({ kind: SLOW })],
    });
    expect(events).toContainEqual({
      type: "wsl-agent-statuses",
      statuses: [expect.objectContaining({ kind: SLOW, envDistro: "OtherDistro" })],
    });
    expect(
      events.some((event) => event.type === "agent-status-updated" && event.status.kind === FAST),
    ).toBe(false);
    expect(slow).not.toHaveBeenCalled();
  });

  it("prunes orphaned saved registry statuses on the first reconciliation without probing", () => {
    seedBaseline();
    const { service, events } = setup([adapter(SLOW, vi.fn<AgentAdapter["detectInstall"]>())]);
    service.reconcileAgentRegistry([]);
    expect(service.getCachedCapabilities(FAST)).toBeUndefined();
    expect(service.getCachedCapabilities(SLOW)?.models[0]?.id).toBe("baseline-slow");
    expect(events).toHaveLength(2);
    expect(memory.writes).toEqual([]);
  });

  it("defers remaining registry bulk events when a client starts discovery from the first event", async () => {
    seedBaseline();
    const held = deferred<AgentStatus>();
    let started = false;
    const current = setup([adapter(SLOW, async () => held.promise)], (event) => {
      if (event.type !== "windows-agent-statuses" || started) return;
      started = true;
      void current.service.getAgentStatuses({ wslDistros: [] });
    });
    current.service.reconcileAgentRegistry([]);
    expect(current.events.map((event) => event.type)).toEqual(["windows-agent-statuses"]);
    const full = activeDetection(current.service);
    held.resolve(status(SLOW, "fresh"));
    await full;
    expect(current.events.some((event) => event.type === "wsl-agent-statuses")).toBe(true);
    expect(current.service.getCachedCapabilities(SLOW)?.models[0]?.id).toBe("fresh");
  });
  afterEach(() => {
    if (memory.cli.mock.calls.length !== 0)
      throw new Error("Unexpected subprocess/probe invocation");
  });
  it("keeps a cold scoped native refresh within its requested provider and leaves startup discovery eligible", async () => {
    const selected = vi.fn<AgentAdapter["detectInstall"]>(async () => status(FAST, "selected"));
    const unrelated = vi.fn<AgentAdapter["detectInstall"]>(async () => status(SLOW, "unrelated"));
    const { service, events } = setup([adapter(FAST, selected), adapter(SLOW, unrelated)]);
    const result = await service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }] },
    });
    expect(selected).toHaveBeenCalledOnce();
    expect(unrelated).not.toHaveBeenCalled();
    expect(modelIds(result)).toEqual(["selected"]);
    expect(result.fromCache).toBe(false);
    expect(memory.writes).toEqual([]);
    expect(memory.cache).toBeUndefined();
    expect(events).toEqual([
      {
        type: "agent-status-updated",
        status: expect.objectContaining({ kind: FAST, envKind: nativeEnv }),
      },
    ]);
    const beforeFull = await service.getAgentStatuses({ wslDistros: [] });
    expect(modelIds(beforeFull)).toEqual(["selected"]);
    expect(beforeFull.fromCache).toBe(false);
    await activeDetection(service);
    expect(selected).toHaveBeenCalledTimes(2);
    expect(unrelated).toHaveBeenCalledOnce();
    expect(memory.writes).toHaveLength(1);
    expect(
      events.some(
        (event) => event.type === "windows-agent-statuses" && event.statuses.length === 2,
      ),
    ).toBe(true);
    expect((await service.getAgentStatuses({ wslDistros: [] })).fromCache).toBe(true);
  });

  it("does not widen a cold scoped WSL refresh to native or other providers", async () => {
    const selected = vi.fn<AgentAdapter["detectInstall"]>(async (context) => {
      expect(context).toMatchObject({ envKind: "wsl", distro: DISTRO });
      return { ...status(FAST, "wsl-selected"), envKind: "wsl", envDistro: DISTRO };
    });
    const unrelated = vi.fn<AgentAdapter["detectInstall"]>(async () => status(SLOW, "unrelated"));
    const { service, events } = setup([adapter(FAST, selected), adapter(SLOW, unrelated)]);
    const result = await service.refreshAgentStatuses({
      wslDistros: [DISTRO, "OtherDistro"],
      scope: { agentKinds: [FAST], envs: [{ kind: "wsl", distro: DISTRO }] },
    });
    expect(result.windows).toEqual([]);
    expect(result.wsl.map((entry) => [entry.kind, entry.envDistro])).toEqual([[FAST, DISTRO]]);
    expect(selected).toHaveBeenCalledOnce();
    expect(unrelated).not.toHaveBeenCalled();
    expect(memory.writes).toEqual([]);
    expect(events).toHaveLength(1);
  });

  it("does not discover unrelated providers for an absent scoped adapter on a cold profile", async () => {
    const detect = vi.fn<AgentAdapter["detectInstall"]>(async () => status(FAST, "unrelated"));
    const { service, events } = setup([adapter(FAST, detect)]);
    expect(
      await service.refreshAgentStatuses({
        wslDistros: [],
        scope: { agentKinds: ["absent"], envs: [{ kind: "native" }] },
      }),
    ).toEqual({ windows: [], wsl: [], fromCache: false });
    expect(detect).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(memory.writes).toEqual([]);
  });

  it("keeps a cold scoped refresh owned when startup discovery is cancelled", async () => {
    const held = deferred<AgentStatus>();
    const detect = vi.fn<AgentAdapter["detectInstall"]>(() => held.promise);
    const { service, events } = setup([adapter(FAST, detect)]);
    const pending = service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }] },
    });
    await vi.waitFor(() => expect(detect).toHaveBeenCalledOnce());
    service.cancelAgentDiscovery();
    expect(events).toEqual([]);
    held.resolve(status(FAST, "owned"));
    expect(modelIds(await pending)).toEqual(["owned"]);
    expect(service.getCachedCapabilities(FAST)?.models[0]?.id).toBe("owned");
    expect(memory.writes).toEqual([]);
  });

  it("persists a complete cold discovery after a newer scoped target joins", async () => {
    const old = deferred<AgentStatus>();
    const selected = vi
      .fn<AgentAdapter["detectInstall"]>()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce(status(FAST, "fresh-selected"));
    const unrelated = vi.fn<AgentAdapter["detectInstall"]>(async () =>
      status(SLOW, "full-unrelated"),
    );
    const { service } = setup([adapter(FAST, selected), adapter(SLOW, unrelated)]);
    await service.getAgentStatuses({ wslDistros: [] });
    const full = activeDetection(service);
    await vi.waitFor(() => expect(selected).toHaveBeenCalledOnce());
    const scoped = service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }] },
    });
    old.resolve(status(FAST, "obsolete"));
    await full;
    const result = await scoped;
    expect(modelIds(result)).toEqual(["fresh-selected"]);
    expect(modelIds(result, SLOW)).toEqual(["full-unrelated"]);
    expect(memory.writes).toHaveLength(1);
    expect(selected).toHaveBeenCalledTimes(2);
    expect(unrelated).toHaveBeenCalledOnce();
    expect((await service.getAgentStatuses({ wslDistros: [] })).fromCache).toBe(true);
  });

  it("joins a cold full inventory wholly superseded before its probes start", async () => {
    const detect = vi.fn<AgentAdapter["detectInstall"]>(async () => status(FAST, "scoped-current"));
    const { service } = setup([adapter(FAST, detect)]);
    const read = service.getAgentStatuses({ wslDistros: [] });
    const full = activeDetection(service);
    const scoped = service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }] },
    });
    await read;
    await full;
    expect(modelIds(await scoped)).toEqual(["scoped-current"]);
    expect(detect).toHaveBeenCalledOnce();
    expect(memory.writes).toHaveLength(1);
  });

  it("never treats a cancelled cold full inventory as permission to persist a scoped subset", async () => {
    const selected = vi.fn<AgentAdapter["detectInstall"]>(async () => status(FAST, "selected"));
    const unrelated = vi.fn<AgentAdapter["detectInstall"]>(async () => status(SLOW, "unrelated"));
    const { service } = setup([adapter(FAST, selected), adapter(SLOW, unrelated)]);
    const read = service.getAgentStatuses({ wslDistros: [] });
    const full = activeDetection(service);
    const scoped = service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }] },
    });
    service.cancelAgentDiscovery();
    await read;
    await full.catch(() => undefined);
    expect(modelIds(await scoped)).toEqual(["selected"]);
    expect(selected).toHaveBeenCalledOnce();
    expect(unrelated).not.toHaveBeenCalled();
    expect(memory.writes).toEqual([]);
  });
  it("preserves legacy native/WSL cache rows, caller filtering and adapter defaults", () => {
    memory.cache = JSON.stringify({
      version: STATUS_CACHE_VERSION,
      windows: [status(FAST, "legacy-native")],
      wsl: [{ ...status(FAST, "legacy-wsl"), envDistro: DISTRO, version: "4.0" }],
    });
    const { service } = setup([adapter(FAST, vi.fn<AgentAdapter["detectInstall"]>())]);
    const cacheReader = service as unknown as {
      readCachedStatuses(distros: readonly string[]): {
        windows: AgentStatus[];
        wsl: AgentStatus[];
      };
    };
    expect(cacheReader.readCachedStatuses([]).wsl).toEqual([]);
    expect(cacheReader.readCachedStatuses([DISTRO]).wsl).toHaveLength(1);
    expect(service.getCachedVersion(FAST, DISTRO)).toBe("4.0");
    const cached = service.getCachedCapabilities(FAST)!;
    expect(cached.slashCommands).toEqual([]);
    cached.models[0]!.id = "caller-mutated";
    expect(service.getCachedCapabilities(FAST)?.models[0]?.id).toBe("legacy-native");
    expect(memory.writes).toHaveLength(0);
  });

  it("probes only the selected native adapter on a cold profile without publishing a false full cache", async () => {
    const selected = vi.fn<AgentAdapter["detectInstall"]>(async () => status(FAST, "selected"));
    const unrelated = vi.fn<AgentAdapter["detectInstall"]>(async () => {
      throw new Error("Unrelated provider must not be probed");
    });
    const { service, events } = setup([adapter(FAST, selected), adapter(SLOW, unrelated)]);
    const result = await service.probeSelectedAgent({ version: 1, agentKind: FAST });
    expect(result).toMatchObject({
      version: 1,
      environment: "native",
      agentKind: FAST,
      status: { kind: FAST, envKind: nativeEnv, capabilities: { models: [{ id: "selected" }] } },
    });
    expect(selected).toHaveBeenCalledOnce();
    expect(unrelated).not.toHaveBeenCalled();
    expect(memory.writes).toEqual([]);
    expect(memory.cache).toBeUndefined();
    expect(events).toEqual([]);
    expect(service.getCachedCapabilities(FAST)).toBeUndefined();
  });

  it("uses effective native enablement for a selected read instead of global display defaults", async () => {
    const detect = vi.fn<AgentAdapter["detectInstall"]>(async () =>
      status(FAST, "native-selected"),
    );
    const { service } = setup([adapter(FAST, detect)]);
    const settings = normalizeSharedSettings({});
    settings.disabledAgents = [FAST];
    settings.machineScopeModes.disabledAgents = "per-machine";
    settings.machineSettings[localMachineKey({ kind: "native" })] = { disabledAgents: [] };
    vi.mocked(readSupervisorSharedSettings).mockReturnValueOnce(settings);
    const result = await service.probeSelectedAgent({ version: 1, agentKind: FAST });
    expect(result.status?.capabilities.models[0]?.id).toBe("native-selected");
    expect(detect).toHaveBeenCalledOnce();
    settings.disabledAgents = [];
    settings.machineSettings[localMachineKey({ kind: "native" })] = { disabledAgents: [FAST] };
    vi.mocked(readSupervisorSharedSettings).mockReturnValueOnce(settings);
    await service.probeSelectedAgent({ version: 1, agentKind: FAST });
    expect(detect).toHaveBeenCalledOnce();
    expect(memory.writes).toEqual([]);
  });

  it("keeps existing cache bytes and readiness unchanged after a selected probe", async () => {
    seedBaseline();
    const before = memory.cache;
    const { service } = setup([adapter(FAST, async () => status(FAST, "fresh-selected"))]);
    const result = await service.probeSelectedAgent({ version: 1, agentKind: FAST });
    expect(result.status?.capabilities.models[0]?.id).toBe("fresh-selected");
    expect(memory.cache).toBe(before);
    expect(memory.writes).toEqual([]);
    expect(service.getCachedCapabilities(FAST)?.models[0]?.id).toBe("baseline-fast");
    expect(await service.probeSelectedAgent({ version: 1, agentKind: "unknown" })).toMatchObject({
      status: null,
    });
    await expect(
      service.probeSelectedAgent({ version: 2, agentKind: FAST } as never),
    ).rejects.toThrow("Invalid input");
  });

  it("exposes completed native readiness before another adapter settles and owns returned snapshots", async () => {
    const slow = deferred<AgentStatus>();
    const raw = { ...status(FAST, "ready"), version: "1.2.3" };
    const { service, firstNativeReady } = setup([
      adapter(
        FAST,
        vi.fn<AgentAdapter["detectInstall"]>(async () => raw),
      ),
      adapter(
        SLOW,
        vi.fn<AgentAdapter["detectInstall"]>(() => slow.promise),
      ),
    ]);
    await service.getAgentStatuses({ wslDistros: [] });
    const pending = activeDetection(service);
    try {
      await firstNativeReady.promise;
      const view = await service.getAgentStatuses({ wslDistros: [] });
      expect(view.fromCache).toBe(false);
      expect(modelIds(view)).toEqual(["ready"]);
      expect(service.getCachedCapabilities(FAST)?.models.map((m) => m.id)).toEqual(["ready"]);
      expect(service.getCachedVersion(FAST)).toBe("1.2.3");
      raw.capabilities.models[0]!.id = "provider-mutated";
      view.windows[0]!.capabilities.models[0]!.id = "caller-mutated";
      expect(service.getCachedCapabilities(FAST)?.models.map((m) => m.id)).toEqual(["ready"]);
      expect(memory.writes).toHaveLength(0);
    } finally {
      slow.resolve(status(SLOW, "slow"));
      await pending;
    }
    expect(memory.writes).toHaveLength(1);
  });

  it("serves native capabilities while WSL waits without persisting a partial sweep", async () => {
    const wsl = deferred<AgentStatus>();
    const { service, firstNativeReady } = setup([
      adapter(
        FAST,
        vi.fn<AgentAdapter["detectInstall"]>((ctx) =>
          ctx?.envKind === "wsl"
            ? wsl.promise
            : Promise.resolve({ ...status(FAST, "native"), version: "2.0" }),
        ),
      ),
    ]);
    await service.getAgentStatuses({ wslDistros: [DISTRO] });
    const pending = activeDetection(service);
    try {
      await firstNativeReady.promise;
      expect(modelIds(await service.getAgentStatuses({ wslDistros: [DISTRO] }))).toEqual([
        "native",
      ]);
      expect(service.getCachedCapabilities(FAST)?.models.map((m) => m.id)).toEqual(["native"]);
      expect(service.getCachedVersion(FAST)).toBe("2.0");
      expect(service.getCachedVersion(FAST, DISTRO)).toBeUndefined();
      expect(memory.writes).toHaveLength(0);
    } finally {
      wsl.resolve({ ...status(FAST, "wsl"), version: "3.0" });
      await pending;
    }
    expect(service.getCachedVersion(FAST, DISTRO)).toBe("3.0");
    expect(memory.writes).toHaveLength(1);
  });

  it("full refresh retires old events, cache writes and return values before queued probes start", async () => {
    const oldFast = deferred<AgentStatus>(),
      oldSlow = deferred<AgentStatus>();
    const freshFast = deferred<AgentStatus>(),
      freshSlow = deferred<AgentStatus>();
    let fastCalls = 0,
      slowCalls = 0;
    const fast = vi.fn<AgentAdapter["detectInstall"]>(() =>
      ++fastCalls === 1 ? oldFast.promise : freshFast.promise,
    );
    const slow = vi.fn<AgentAdapter["detectInstall"]>(() =>
      ++slowCalls === 1 ? oldSlow.promise : freshSlow.promise,
    );
    const { service, events } = setup([adapter(FAST, fast), adapter(SLOW, slow)]);
    const first = service.refreshAgentStatuses({ wslDistros: [] });
    await vi.waitFor(() => expect(fast).toHaveBeenCalledTimes(1));
    const second = service.refreshAgentStatuses({ wslDistros: [] });
    try {
      oldFast.resolve(status(FAST, "obsolete"));
      oldSlow.resolve(status(SLOW, "obsolete"));
      const firstReturn = await first;
      await vi.waitFor(() => expect(fast).toHaveBeenCalledTimes(2));
      expect(modelIds(firstReturn)).toBeUndefined();
      expect(service.getCachedCapabilities(FAST)).toBeUndefined();
      expect(memory.writes).toHaveLength(0);
      expect(
        events.some(
          (event) =>
            event.type === "agent-detected" &&
            event.status.capabilities.models.some((m) => m.id === "obsolete"),
        ),
      ).toBe(false);
      freshFast.resolve(status(FAST, "fresh"));
      await vi.waitFor(() =>
        expect(service.getCachedCapabilities(FAST)?.models.map((m) => m.id)).toEqual(["fresh"]),
      );
      expect(memory.writes).toHaveLength(0);
    } finally {
      oldFast.resolve(status(FAST, "obsolete"));
      oldSlow.resolve(status(SLOW, "obsolete"));
      freshFast.resolve(status(FAST, "fresh"));
      freshSlow.resolve(status(SLOW, "fresh-slow"));
      await first;
      await second;
    }
    expect(modelIds(await service.getAgentStatuses({ wslDistros: [] }))).toEqual(["fresh"]);
    expect(memory.writes).toHaveLength(1);
  });

  it("invalidation ignores an uncleared cache and permits a fresh startup sweep", async () => {
    seedBaseline();
    const gate = deferred<AgentStatus>();
    const detect = vi.fn<AgentAdapter["detectInstall"]>(() => gate.promise);
    const { service, firstNativeReady } = setup([adapter(FAST, detect)]);
    expect(service.getCachedCapabilities(FAST)?.models.map((m) => m.id)).toEqual(["baseline-fast"]);
    memory.failUnlink = true;
    service.invalidateAgentStatuses();
    expect(service.getCachedCapabilities(FAST)).toBeUndefined();
    expect(await service.getAgentStatuses({ wslDistros: [] })).toEqual({
      windows: [],
      wsl: [],
      fromCache: false,
    });
    const pending = activeDetection(service);
    try {
      gate.resolve(status(FAST, "after-invalidation"));
      await firstNativeReady.promise;
      expect(service.getCachedCapabilities(FAST)?.models.map((m) => m.id)).toEqual([
        "after-invalidation",
      ]);
    } finally {
      gate.resolve(status(FAST, "after-invalidation"));
      await pending;
    }
    expect(detect).toHaveBeenCalledTimes(1);
    expect(memory.writes).toHaveLength(1);
  });

  it("distinguishes an accepted unavailable verdict from a provider with no verdict during cold detection", async () => {
    const slow = deferred<AgentStatus>();
    const unavailable = {
      ...status(FAST, "none"),
      installed: false,
      authState: "unknown" as const,
    };
    const { service, firstNativeReady } = setup([
      adapter(
        FAST,
        vi.fn<AgentAdapter["detectInstall"]>(async () => unavailable),
      ),
      adapter(
        SLOW,
        vi.fn<AgentAdapter["detectInstall"]>(() => slow.promise),
      ),
    ]);
    await service.getAgentStatuses({ wslDistros: [] });
    const pending = activeDetection(service);
    try {
      await firstNativeReady.promise;
      expect(service.getCachedCapabilities(FAST)).toBeNull();
      expect(service.getCachedCapabilities(SLOW)).toBeUndefined();
      expect(service.getCachedCapabilities("acp-generic:no-verdict")).toBeUndefined();
      expect(service.getCachedVersion(FAST)).toBeUndefined();
    } finally {
      slow.resolve(status(SLOW, "slow"));
      await pending;
    }
  });

  it("a newer scoped target defeats an older full result while preserving unrelated ready rows", async () => {
    seedBaseline();
    const old = deferred<void>(),
      scoped = deferred<AgentStatus>();
    let nativeFast = 0;
    const fast = vi.fn<AgentAdapter["detectInstall"]>((ctx) => {
      if (ctx?.envKind !== "wsl" && ++nativeFast === 2) return scoped.promise;
      return old.promise.then(() => status(FAST, "old-full-fast"));
    });
    const slow = vi.fn<AgentAdapter["detectInstall"]>(() =>
      old.promise.then(() => status(SLOW, "full-slow")),
    );
    const { service, events } = setup([adapter(FAST, fast), adapter(SLOW, slow)]);
    await service.getAgentStatuses({ wslDistros: ["OtherDistro"] });
    const background = activeDetection(service);
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(2));
    const refresh = service.refreshAgentStatuses({
      wslDistros: ["OtherDistro"],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }] },
    });
    try {
      old.resolve();
      await vi.waitFor(() => expect(nativeFast).toBe(2));
      const current = await service.getAgentStatuses({ wslDistros: ["OtherDistro"] });
      expect(current.fromCache).toBe(true);
      expect(modelIds(current)).toEqual(["baseline-fast"]);
      expect(modelIds(current, SLOW)).toEqual(["full-slow"]);
      expect(current.wsl.some((s) => s.envDistro === "OtherDistro")).toBe(true);
      expect(current.windows.find((s) => s.kind === FAST)?.capabilities.slashCommands).toEqual([]);
      expect(
        events.some(
          (event) =>
            event.type === "agent-detected" &&
            event.status.kind === FAST &&
            event.status.envKind === nativeEnv,
        ),
      ).toBe(false);
      expect(memory.writes).toHaveLength(0);
    } finally {
      old.resolve();
      scoped.resolve(status(FAST, "scoped-fast"));
      await background;
      await refresh;
    }
    const final = await service.getAgentStatuses({ wslDistros: ["OtherDistro"] });
    expect(modelIds(final)).toEqual(["scoped-fast"]);
    expect(modelIds(final, SLOW)).toEqual(["full-slow"]);
    expect(final.wsl.some((s) => s.envDistro === "OtherDistro")).toBe(true);
    expect(memory.writes).toHaveLength(1);
  });

  it("disjoint scoped refreshes merge without losing the newer row or unrelated WSL baseline", async () => {
    seedBaseline();
    const a = deferred<AgentStatus>(),
      b = deferred<AgentStatus>();
    const fast = vi.fn<AgentAdapter["detectInstall"]>(() => a.promise),
      slow = vi.fn<AgentAdapter["detectInstall"]>(() => b.promise);
    const { service } = setup([adapter(FAST, fast), adapter(SLOW, slow)]);
    const first = service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }] },
    });
    const second = service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: [SLOW], envs: [{ kind: "native" }] },
    });
    try {
      a.resolve(status(FAST, "scoped-a"));
      await first;
      expect(service.getCachedCapabilities(FAST)?.models.map((m) => m.id)).toEqual(["scoped-a"]);
      expect(memory.writes).toHaveLength(0);
    } finally {
      a.resolve(status(FAST, "scoped-a"));
      b.resolve(status(SLOW, "scoped-b"));
      await first;
      await second;
    }
    const cache = JSON.parse(memory.cache!) as { windows: AgentStatus[]; wsl: AgentStatus[] };
    expect(modelIds(cache)).toEqual(["scoped-a"]);
    expect(modelIds(cache, SLOW)).toEqual(["scoped-b"]);
    expect(cache.wsl.map((s) => s.envDistro)).toEqual(["OtherDistro"]);
    expect(memory.writes).toHaveLength(1);
  });

  it("full refresh supersedes a pending scoped result and does not return it", async () => {
    seedBaseline();
    const old = deferred<AgentStatus>(),
      fresh = deferred<AgentStatus>();
    let calls = 0;
    const fast = vi.fn<AgentAdapter["detectInstall"]>(() =>
      ++calls === 1 ? old.promise : fresh.promise,
    );
    const { service, events } = setup([adapter(FAST, fast)]);
    const scoped = service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }] },
    });
    await vi.waitFor(() => expect(fast).toHaveBeenCalledTimes(1));
    const full = service.refreshAgentStatuses({ wslDistros: [] });
    try {
      old.resolve(status(FAST, "obsolete-scoped"));
      const result = await scoped;
      expect(modelIds(result)).toBeUndefined();
      expect(events.some((event) => event.type === "agent-status-updated")).toBe(false);
      expect(memory.writes).toHaveLength(0);
    } finally {
      old.resolve(status(FAST, "obsolete-scoped"));
      fresh.resolve(status(FAST, "fresh"));
      await scoped;
      await full;
    }
    expect(service.getCachedCapabilities(FAST)?.models.map((m) => m.id)).toEqual(["fresh"]);
    expect(memory.writes).toHaveLength(1);
  });

  it("new WSL discovery preserves accepted native readiness but retires late earlier results", async () => {
    const oldSlow = deferred<AgentStatus>(),
      newSlow = deferred<AgentStatus>();
    let fastNative = 0,
      slowNative = 0;
    const fast = vi.fn<AgentAdapter["detectInstall"]>(async (ctx) =>
      status(
        FAST,
        ctx?.envKind === "wsl" ? "wsl-ready" : ++fastNative === 1 ? "native-one" : "native-two",
      ),
    );
    const slow = vi.fn<AgentAdapter["detectInstall"]>((ctx) =>
      ctx?.envKind === "wsl" || ++slowNative > 1 ? newSlow.promise : oldSlow.promise,
    );
    const { service, firstNativeReady, events } = setup([adapter(FAST, fast), adapter(SLOW, slow)]);
    await service.getAgentStatuses({ wslDistros: [] });
    const first = activeDetection(service);
    await firstNativeReady.promise;
    await service.getAgentStatuses({ wslDistros: [DISTRO] });
    const second = activeDetection(service);
    try {
      expect(service.getCachedCapabilities(FAST)?.models.map((m) => m.id)).toEqual(["native-one"]);
      oldSlow.resolve(status(SLOW, "obsolete-slow"));
      await vi.waitFor(() =>
        expect(service.getCachedCapabilities(FAST)?.models.map((m) => m.id)).toEqual([
          "native-two",
        ]),
      );
      expect(
        (await service.getAgentStatuses({ wslDistros: [DISTRO] })).wsl.some((s) => s.kind === FAST),
      ).toBe(true);
      expect(
        events.some(
          (event) =>
            event.type === "agent-detected" &&
            event.status.capabilities.models.some((m) => m.id === "obsolete-slow"),
        ),
      ).toBe(false);
      expect(memory.writes).toHaveLength(0);
    } finally {
      oldSlow.resolve(status(SLOW, "obsolete-slow"));
      newSlow.resolve(status(SLOW, "current-slow"));
      await first;
      await second;
    }
    expect(memory.writes).toHaveLength(1);
  });

  it("rejects malformed and foreign completed results rather than retaining their cached target", async () => {
    seedBaseline();
    const slow = deferred<AgentStatus>();
    const malformed = { ...status(FAST, "invalid"), installed: "yes" } as unknown as AgentStatus;
    const fast = vi
      .fn<AgentAdapter["detectInstall"]>()
      .mockResolvedValueOnce(malformed)
      .mockResolvedValueOnce(status(SLOW, "foreign"));
    const { service, events } = setup([
      adapter(FAST, fast),
      adapter(
        SLOW,
        vi.fn<AgentAdapter["detectInstall"]>(() => slow.promise),
      ),
    ]);
    await service.getAgentStatuses({ wslDistros: [] });
    const first = activeDetection(service);
    try {
      await vi.waitFor(() => expect(service.getCachedCapabilities(FAST)).toBeUndefined());
      expect(modelIds(await service.getAgentStatuses({ wslDistros: [] }))).toBeUndefined();
      expect(
        events.some((event) => event.type === "agent-detected" && event.status.kind === FAST),
      ).toBe(false);
    } finally {
      slow.resolve(status(SLOW, "ready-slow"));
      await first;
    }
    await service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }] },
    });
    expect(service.getCachedCapabilities(FAST)).toBeUndefined();
    expect(service.getCachedCapabilities(SLOW)?.models[0]?.id).toBe("ready-slow");
    expect(events.some((event) => event.type === "agent-status-updated")).toBe(false);
  });

  it("an event callback cannot mutate a retained ready snapshot", async () => {
    const slow = deferred<AgentStatus>();
    const { service, firstNativeReady } = setup(
      [
        adapter(
          FAST,
          vi.fn<AgentAdapter["detectInstall"]>(async () => status(FAST, "ready")),
        ),
        adapter(
          SLOW,
          vi.fn<AgentAdapter["detectInstall"]>(() => slow.promise),
        ),
      ],
      (event) => {
        if (event.type === "agent-detected" && event.status.kind === FAST) {
          event.status.capabilities.models[0]!.id = "event-mutated";
        }
      },
    );
    await service.getAgentStatuses({ wslDistros: [] });
    const pending = activeDetection(service);
    try {
      await firstNativeReady.promise;
      expect(service.getCachedCapabilities(FAST)?.models[0]?.id).toBe("ready");
    } finally {
      slow.resolve(status(SLOW, "slow"));
      await pending;
    }
    expect(service.getCachedCapabilities(FAST)?.models[0]?.id).toBe("ready");
  });

  it("reentrant registry invalidation queues a fresh generation before old terminal events or persistence", async () => {
    const fresh = deferred<AgentStatus>();
    const freshDetect = vi.fn<AgentAdapter["detectInstall"]>(() => fresh.promise);
    const current = setup(
      [
        adapter(
          FAST,
          vi.fn<AgentAdapter["detectInstall"]>(async () => status(FAST, "old")),
        ),
      ],
      (event) => {
        if (event.type === "agent-detected" && event.status.capabilities.models[0]?.id === "old") {
          current.service.invalidateAgentStatuses();
          current.registry.set(FAST, adapter(FAST, freshDetect));
          void current.service.getAgentStatuses({ wslDistros: [] });
        }
      },
    );
    await current.service.getAgentStatuses({ wslDistros: [] });
    const old = activeDetection(current.service);
    await vi.waitFor(() => expect(freshDetect).toHaveBeenCalledTimes(1));
    const next = activeDetection(current.service);
    try {
      await old;
      expect(current.service.getCachedCapabilities(FAST)).toBeUndefined();
      expect(memory.writes).toHaveLength(0);
      expect(
        current.events.filter((event) => event.type === "windows-agent-statuses"),
      ).toHaveLength(0);
    } finally {
      fresh.resolve(status(FAST, "new"));
      await next;
    }
    expect(current.service.getCachedCapabilities(FAST)?.models[0]?.id).toBe("new");
    expect(memory.writes).toHaveLength(1);
  });

  it("the latest scoped request owns the same target before its queued probe begins", async () => {
    seedBaseline();
    const old = deferred<AgentStatus>(),
      fresh = deferred<AgentStatus>();
    const detect = vi
      .fn<AgentAdapter["detectInstall"]>()
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => fresh.promise);
    const { service, events } = setup([adapter(FAST, detect)]);
    const scope = { agentKinds: [FAST], envs: [{ kind: "native" as const }] };
    const first = service.refreshAgentStatuses({ wslDistros: [], scope });
    await vi.waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
    const second = service.refreshAgentStatuses({ wslDistros: [], scope });
    try {
      old.resolve(status(FAST, "obsolete"));
      expect(modelIds(await first)).toEqual(["baseline-fast"]);
      expect(events.some((event) => event.type === "agent-status-updated")).toBe(false);
      expect(memory.writes).toHaveLength(0);
    } finally {
      old.resolve(status(FAST, "obsolete"));
      fresh.resolve(status(FAST, "fresh"));
      await first;
      await second;
    }
    expect(service.getCachedCapabilities(FAST)?.models[0]?.id).toBe("fresh");
    expect(memory.writes).toHaveLength(1);
  });

  it("failed persistence never re-enables an uncleared stale cache", async () => {
    seedBaseline();
    memory.failUnlink = true;
    memory.failWrite = true;
    const { service } = setup([
      adapter(
        FAST,
        vi.fn<AgentAdapter["detectInstall"]>(async () => status(FAST, "current")),
      ),
    ]);
    const response = await service.refreshAgentStatuses({ wslDistros: [] });
    expect(modelIds(response)).toEqual(["current"]);
    const current = await service.getAgentStatuses({ wslDistros: [] });
    expect(current.fromCache).toBe(false);
    expect(modelIds(current)).toEqual(["current"]);
    expect(modelIds(current, SLOW)).toBeUndefined();
    expect(memory.writes).toHaveLength(0);
  });

  it("a stalled scoped WSL probe aborts at the existing deadline and releases a queued native refresh", async () => {
    seedBaseline();
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let signal: AbortSignal | undefined;
    const detect = vi.fn<AgentAdapter["detectInstall"]>((ctx) => {
      if (ctx?.envKind === "wsl") {
        signal = ctx.signal;
        return new Promise(() => undefined);
      }
      return Promise.resolve(status(FAST, "native-after-timeout"));
    });
    const { service, events } = setup([adapter(FAST, detect)]);
    try {
      const scoped = service.refreshAgentStatuses({
        wslDistros: [DISTRO],
        scope: { agentKinds: [FAST], envs: [{ kind: "wsl", distro: DISTRO }] },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(detect).toHaveBeenCalledTimes(1);
      const full = service.refreshAgentStatuses({ wslDistros: [] });
      let fullFinished = false;
      void full.then(() => {
        fullFinished = true;
      });
      await vi.advanceTimersByTimeAsync(59_999);
      expect(detect).toHaveBeenCalledTimes(1);
      expect(memory.writes).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(fullFinished).toBe(true);
      await scoped;
      await full;
      expect(signal?.aborted).toBe(true);
      expect(detect).toHaveBeenCalledTimes(2);
      expect(service.getCachedCapabilities(FAST)?.models[0]?.id).toBe("native-after-timeout");
      expect(events.filter((event) => event.type === "agent-status-updated")).toHaveLength(0);
      expect(JSON.parse(memory.cache!).wsl).toEqual([]);
      expect(memory.writes).toHaveLength(1);
    } finally {
      error.mockRestore();
      vi.useRealTimers();
    }
  });
});
