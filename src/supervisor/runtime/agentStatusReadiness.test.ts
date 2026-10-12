import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter } from "@/supervisor/agents/base";

// In-memory filesystem: the real status service cannot touch profiles/keys.
const memory = vi.hoisted(() => ({
  path: "/owned-in-memory/status-cache.json",
  cache: undefined as string | undefined,
  writes: [] as string[],
  unlinks: 0,
  failUnlink: false,
  failWrite: false,
  cli: vi.fn<() => never>(() => {
    throw new Error("No subprocess/probe is allowed");
  }),
}));

vi.mock("node:fs", async (importActual) => {
  const actual = await importActual<typeof import("node:fs")>();
  const requireOwned = (path: unknown) => {
    if (path !== memory.path) throw new Error("Unexpected filesystem access");
  };
  return {
    ...actual,
    readFileSync: vi.fn<(path: unknown) => string>((path: unknown) => {
      requireOwned(path);
      if (memory.cache === undefined)
        throw Object.assign(new Error("Cache absent"), { code: "ENOENT" });
      return memory.cache;
    }),
    writeFileSync: vi.fn<(path: unknown, data: unknown) => void>((path: unknown, data: unknown) => {
      requireOwned(path);
      if (memory.failWrite) throw new Error("Owned cache write failed");
      if (typeof data !== "string") throw new Error("Expected UTF-8 cache text");
      memory.cache = data;
      memory.writes.push(data);
    }),
    unlinkSync: vi.fn<(path: unknown) => void>((path: unknown) => {
      requireOwned(path);
      memory.unlinks++;
      if (memory.failUnlink) throw new Error("Owned cache unlink failed");
      memory.cache = undefined;
    }),
  };
});
vi.mock("node:child_process", () => ({ execFile: memory.cli }));
vi.mock("@/supervisor/agents/base", () => ({
  primeExecutablePathCache: vi.fn<() => Promise<void>>(async () => undefined),
  invalidateExecutablePathCache: vi.fn<() => void>(),
  getWindowsSystemCommand: vi.fn<(name: string) => string>((name: string) => name),
}));
vi.mock("@/supervisor/agents/claude/fastModeCache", () => ({
  clearFastModeCache: vi.fn<() => Promise<void>>(async () => undefined),
}));
vi.mock("@/supervisor/runtime/supervisorSharedSettings", async () => {
  const { normalizeSharedSettings } = await import("@/shared/settings");
  return {
    readSupervisorSharedSettings: vi.fn<() => ReturnType<typeof normalizeSharedSettings>>(() =>
      normalizeSharedSettings({}),
    ),
  };
});

import { AgentStatusService, STATUS_CACHE_VERSION } from "@/supervisor/runtime/agentStatusService";

const FAST = "acp-generic:ready-fixture";
const SLOW = "acp-generic:deferred-fixture";
const DISTRO = "OwnedUbuntu";
const nativeEnv = process.platform === "win32" ? "windows" : "posix";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const capabilities: AgentStatus["capabilities"] = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
};

function status(kind: string, model: string): AgentStatus {
  return {
    kind,
    label: kind,
    installed: true,
    authState: "authenticated",
    capabilities: { ...capabilities, models: [{ id: model, label: model }] },
  };
}

function adapter(kind: string, detectInstall: AgentAdapter["detectInstall"]): AgentAdapter {
  return {
    kind,
    label: kind,
    capabilities: { ...capabilities, slashCommands: [] },
    detectInstall,
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
  } as unknown as AgentAdapter;
}

function setup(adapters: AgentAdapter[], onEvent?: (event: SupervisorEvent) => void) {
  const events: SupervisorEvent[] = [];
  const firstNativeReady = deferred<void>();
  const registry = new Map(adapters.map((entry) => [entry.kind, entry]));
  const service = new AgentStatusService({
    adapters: registry,
    settingsPath: "/unused-mocked/settings.json",
    statusCachePath: memory.path,
    emit(event) {
      events.push(event);
      onEvent?.(event);
      if (
        event.type === "agent-detected" &&
        event.status.kind === FAST &&
        event.status.envKind === nativeEnv
      ) {
        firstNativeReady.resolve();
      }
    },
  });
  return { service, events, firstNativeReady, registry };
}

function activeDetection(service: AgentStatusService): Promise<unknown> {
  const pending: unknown = Reflect.get(service, "pendingDetection");
  if (!(pending instanceof Promise)) throw new Error("Expected an active owned detection");
  return pending;
}

function modelIds(response: { windows: AgentStatus[] }, kind = FAST) {
  return response.windows
    .find((entry) => entry.kind === kind)
    ?.capabilities.models.map((model) => model.id);
}

beforeEach(() => {
  memory.cache = undefined;
  memory.writes.length = 0;
  memory.unlinks = 0;
  memory.failUnlink = false;
  memory.failWrite = false;
  memory.cli.mockClear();
});

function seedBaseline() {
  memory.cache = JSON.stringify({
    version: STATUS_CACHE_VERSION,
    windows: [
      { ...status(FAST, "baseline-fast"), envKind: nativeEnv },
      { ...status(SLOW, "baseline-slow"), envKind: nativeEnv },
    ],
    wsl: [{ ...status(SLOW, "unrelated-wsl"), envKind: "wsl", envDistro: "OtherDistro" }],
  });
}

describe("AgentStatusService accepted readiness publication", () => {
  afterEach(() => {
    if (memory.cli.mock.calls.length !== 0)
      throw new Error("Unexpected subprocess/probe invocation");
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
