import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import {
  memory,
  FAST,
  SLOW,
  DISTRO,
  deferred,
  status,
  adapter,
  setup,
  activeDetection,
  modelIds,
  seedBaseline,
} from "./fixtures/agentStatusServiceFixture";

describe("full discovery cancellation", () => {
  afterEach(() => {
    if (memory.cli.mock.calls.length !== 0)
      throw new Error("Unexpected subprocess/probe invocation");
  });
  it("aborts native and WSL probes, retains accepted agents and rejects late publication", async () => {
    const pending = deferred<AgentStatus>();
    const signals: AbortSignal[] = [];
    const started = deferred<void>();
    const slow = adapter(SLOW, async (ctx) => {
      if (ctx?.signal) signals.push(ctx.signal);
      if (signals.length === 2) started.resolve();
      return pending.promise;
    });
    const { service, events, firstNativeReady } = setup([
      adapter(FAST, async () => status(FAST, "ready")),
      slow,
    ]);
    const refresh = service.refreshAgentStatuses({ wslDistros: [DISTRO] });
    // Observe rejection immediately: cancel is deliberately allowed before probes finish.
    const rejected = refresh.catch((error) => error);
    await started.promise;
    await firstNativeReady.promise;
    const response = service.cancelAgentDiscovery();
    expect(modelIds(response)).toEqual(["ready"]);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(await rejected).toMatchObject({ message: "Agent discovery cancelled" });
    const before = events.length;
    pending.resolve(status(SLOW, "late"));
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toHaveLength(before);
    expect(memory.writes).toHaveLength(0);
    expect(service.getCachedCapabilities(SLOW)).toBeUndefined();
  });
  it("cancelled queued scans do not probe and leave a scoped refresh usable", async () => {
    seedBaseline();
    const pending = deferred<AgentStatus>();
    const started = deferred<void>();
    const probe = vi.fn<AgentAdapter["detectInstall"]>(async () => {
      started.resolve();
      return pending.promise;
    });
    const { service } = setup([adapter(FAST, probe)]);
    const scoped = service.refreshAgentStatuses({ wslDistros: [], scope: { agentKinds: [FAST] } });
    await started.promise;
    const full = service.refreshAgentStatuses({ wslDistros: [] });
    const rejected = full.catch((error) => error);
    service.cancelAgentDiscovery();
    pending.resolve(status(FAST, "scoped"));
    expect(modelIds(await scoped)).toEqual(["scoped"]);
    expect(await rejected).toMatchObject({ message: "Agent discovery cancelled" });
    expect(probe).toHaveBeenCalledOnce();
    probe.mockResolvedValue(status(FAST, "next"));
    const next = await service.refreshAgentStatuses({ wslDistros: [] });
    expect(modelIds(next)).toEqual(["next"]);
  });
});

describe("scoped fallback cancellation ownership", () => {
  it("keeps a cold scoped install/login refresh running when full discovery is cancelled", async () => {
    const pending = deferred<AgentStatus>();
    const started = deferred<void>();
    const signals: (AbortSignal | undefined)[] = [];
    const probe = vi.fn<AgentAdapter["detectInstall"]>(async (ctx) => {
      signals.push(ctx?.signal);
      if (signals.length === 1) {
        started.resolve();
        return pending.promise;
      }
      return status(FAST, "installed");
    });
    const { service } = setup([adapter(FAST, probe)]);
    const full = service.refreshAgentStatuses({ wslDistros: [] });
    const cancelled = full.catch((error) => error);
    await started.promise;
    const scoped = service.refreshAgentStatuses({ wslDistros: [], scope: { agentKinds: [FAST] } });
    service.cancelAgentDiscovery();
    expect(await cancelled).toMatchObject({ message: "Agent discovery cancelled" });
    expect(modelIds(await scoped)).toEqual(["installed"]);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals).toHaveLength(2);
    expect(signals[1]?.aborted ?? false).toBe(false);
    pending.resolve(status(FAST, "obsolete"));
  });
});

describe("cancelled startup retry", () => {
  afterEach(() => vi.restoreAllMocks());
  it("allows a later request for the same WSL environment to start detection again", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const blocked = deferred<AgentStatus>();
    const started = deferred<void>();
    let calls = 0;
    const probe = vi.fn<AgentAdapter["detectInstall"]>(async () => {
      if (++calls <= 2) {
        if (calls === 2) started.resolve();
        return blocked.promise;
      }
      return status(FAST, "retried");
    });
    const { service } = setup([adapter(FAST, probe)]);
    await service.getAgentStatuses({ wslDistros: [DISTRO] });
    const first = activeDetection(service).catch((error) => error);
    await started.promise;
    service.cancelAgentDiscovery();
    // Retry before the cancelled job's background rejection handler runs.
    const retry = service.getAgentStatuses({ wslDistros: [DISTRO] });
    await first;
    await retry;
    await activeDetection(service);
    expect(probe).toHaveBeenCalledTimes(4);
    expect(errors).not.toHaveBeenCalled();
    expect(modelIds(await service.getAgentStatuses({ wslDistros: [DISTRO] }))).toEqual(["retried"]);
    blocked.resolve(status(FAST, "late"));
  });
});

describe("cancellation restoration ordering", () => {
  it.each(["explicit invalidation", "registry removal"] as const)(
    "does not restore scoped custody retired by %s",
    async (retirement) => {
      seedBaseline();
      const blocked = deferred<AgentStatus>();
      const started = deferred<void>();
      const probe = vi.fn<AgentAdapter["detectInstall"]>(async () => {
        started.resolve();
        return blocked.promise;
      });
      const { service, registry, events } = setup([adapter(FAST, probe)]);
      const scoped = service.refreshAgentStatuses({
        wslDistros: [],
        scope: { agentKinds: [FAST] },
      });
      await started.promise;
      if (retirement === "explicit invalidation") service.invalidateAgentStatuses();
      else {
        registry.delete(FAST);
        service.reconcileAgentRegistry([FAST]);
      }
      const full = service.refreshAgentStatuses({ wslDistros: [] }).catch((error) => error);
      service.cancelAgentDiscovery();
      blocked.resolve(status(FAST, "obsolete"));
      expect(modelIds(await scoped)).toBeUndefined();
      expect(await full).toMatchObject({ message: "Agent discovery cancelled" });
      expect(probe).toHaveBeenCalledOnce();
      expect(events.filter((event) => event.type === "agent-status-updated")).toEqual([]);
      expect(service.getCachedCapabilities(FAST)).toBeUndefined();
    },
  );

  it("restores the newest overlapping scoped request", async () => {
    seedBaseline();
    const blocked = deferred<AgentStatus>();
    const started = deferred<void>();
    const probe = vi
      .fn<AgentAdapter["detectInstall"]>()
      .mockImplementationOnce(async () => {
        started.resolve();
        return blocked.promise;
      })
      .mockResolvedValue(status(FAST, "newest"));
    const { service } = setup([adapter(FAST, probe)]);
    const older = service.refreshAgentStatuses({ wslDistros: [], scope: { agentKinds: [FAST] } });
    await started.promise;
    const newer = service.refreshAgentStatuses({ wslDistros: [], scope: { agentKinds: [FAST] } });
    const full = service.refreshAgentStatuses({ wslDistros: [] }).catch((error) => error);
    service.cancelAgentDiscovery();
    blocked.resolve(status(FAST, "older"));
    await older;
    expect(modelIds(await newer)).toEqual(["newest"]);
    expect(await full).toMatchObject({ message: "Agent discovery cancelled" });
    expect(modelIds(await service.getAgentStatuses({ wslDistros: [] }))).toEqual(["newest"]);
  });
  it("restores cold scoped-first fallback publication after cancelling a later full refresh", async () => {
    const blocked = deferred<AgentStatus>();
    const started = deferred<void>();
    const probe = vi.fn<AgentAdapter["detectInstall"]>(async () => {
      started.resolve();
      return blocked.promise;
    });
    const { service } = setup([adapter(FAST, probe)]);
    const scoped = service.refreshAgentStatuses({ wslDistros: [], scope: { agentKinds: [FAST] } });
    await started.promise;
    const full = service.refreshAgentStatuses({ wslDistros: [] }).catch((error) => error);
    service.cancelAgentDiscovery();
    blocked.resolve(status(FAST, "installed"));
    expect(modelIds(await scoped)).toEqual(["installed"]);
    expect(await full).toMatchObject({ message: "Agent discovery cancelled" });
    expect(probe).toHaveBeenCalledOnce();
  });
  it("restores a freed native target while retaining ownership of an earlier WSL target", async () => {
    seedBaseline();
    const blocked = deferred<AgentStatus>();
    const started = deferred<void>();
    let calls = 0;
    const probe = vi.fn<AgentAdapter["detectInstall"]>(async () => {
      if (++calls === 2) started.resolve();
      return blocked.promise;
    });
    const { service } = setup([adapter(FAST, probe)]);
    const scoped = service.refreshAgentStatuses({
      wslDistros: [DISTRO],
      scope: { agentKinds: [FAST], envs: [{ kind: "native" }, { kind: "wsl", distro: DISTRO }] },
    });
    await started.promise;
    await service.getAgentStatuses({ wslDistros: ["NewDistro"] });
    const background = activeDetection(service).catch((error) => error);
    service.cancelAgentDiscovery();
    blocked.resolve(status(FAST, "retained"));
    const response = await scoped;
    expect(modelIds(response)).toEqual(["retained"]);
    expect(response.wsl.some((entry) => entry.kind === FAST && entry.envDistro === DISTRO)).toBe(
      true,
    );
    expect(await background).toMatchObject({ message: "Agent discovery cancelled" });
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
