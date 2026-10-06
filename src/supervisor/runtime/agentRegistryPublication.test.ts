import { describe, expect, it, vi } from "vitest";
import type { AgentKind } from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";
import type { AgentAdapter } from "../agents/base";
import type { AgentStatusService } from "./agentStatusService";
import type { SupervisorSharedSettingsCache } from "./supervisorSharedSettings";

const fixtures = vi.hoisted(() => ({
  entries: [] as { adapter: AgentAdapter; inputKey: string }[],
}));
vi.mock("../agents/registry", () => ({ buildAgentRegistryEntries: () => fixtures.entries }));
vi.mock("../agents/acpRegistry", async (load) => ({
  ...(await load<typeof import("../agents/acpRegistry")>()),
  readAcpRegistrySettings: () => defaultSharedSettings,
  persistAcpRegistrySettingsMigrations: () => false,
}));
import { AgentRegistryService } from "./agentRegistryService";

function entry(kind: AgentKind, inputKey: string) {
  return { adapter: { kind, label: kind } as AgentAdapter, inputKey };
}
function setup() {
  const adapters = new Map<AgentKind, AgentAdapter>();
  const atInvalidation: AgentKind[][] = [];
  const invalidateAgentStatuses = vi.fn<() => void>(() => {
    atInvalidation.push([...adapters.keys()]);
  });
  const service = new AgentRegistryService({
    adapters,
    settingsPath: "/owned/settings.json",
    baseDir: "/owned",
    acpIconsDir: "/owned/icons",
    sharedSettingsCache: {
      invalidate: vi.fn<() => void>(),
    } as unknown as SupervisorSharedSettingsCache,
    getAgentStatusService: () => ({ invalidateAgentStatuses }) as unknown as AgentStatusService,
    getActiveWslProjectDistros: () => [],
    closeThreadsForAgentKind: vi.fn<(agentKind: AgentKind) => Promise<void>>(async () => {}),
  });
  return { service, adapters, invalidateAgentStatuses, atInvalidation };
}

describe("registry status publication ownership", () => {
  it("preserves warm-cache ownership on initial setup and unchanged polls", () => {
    fixtures.entries = [entry("acp-generic:first", "one")];
    const { service, adapters, invalidateAgentStatuses } = setup();
    service.refreshAgentRegistryAdapters();
    const initial = adapters.get("acp-generic:first");
    fixtures.entries = [entry("acp-generic:first", "one")];
    service.refreshAgentRegistryAdapters();
    expect(adapters.get("acp-generic:first")).toBe(initial);
    expect(invalidateAgentStatuses).not.toHaveBeenCalled();
  });
  it("invalidates once after replacement, addition and removal are fully applied", () => {
    fixtures.entries = [entry("acp-generic:first", "one"), entry("acp-generic:removed", "old")];
    const { service, adapters, invalidateAgentStatuses, atInvalidation } = setup();
    service.refreshAgentRegistryAdapters();
    const initial = adapters.get("acp-generic:first");
    fixtures.entries = [entry("acp-generic:first", "two"), entry("acp-generic:added", "new")];
    service.refreshAgentRegistryAdapters();
    expect(adapters.get("acp-generic:first")).not.toBe(initial);
    expect(invalidateAgentStatuses).toHaveBeenCalledTimes(1);
    expect(atInvalidation).toEqual([["acp-generic:first", "acp-generic:added"]]);
    service.refreshAgentRegistryAdapters();
    expect(invalidateAgentStatuses).toHaveBeenCalledTimes(1);
  });
  it("invalidates removal of the final registered adapter", () => {
    fixtures.entries = [entry("acp-generic:first", "one")];
    const { service, adapters, invalidateAgentStatuses } = setup();
    service.refreshAgentRegistryAdapters();
    fixtures.entries = [];
    service.refreshAgentRegistryAdapters();
    expect(adapters.size).toBe(0);
    expect(invalidateAgentStatuses).toHaveBeenCalledTimes(1);
  });
});
