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
  persistAcpRegistrySettingsMigrations: async () => false,
}));
import { AgentRegistryService } from "./agentRegistryService";
import { fileSettingsWriter } from "./supervisorSettingsWriter.testFixtures";

function entry(kind: AgentKind, inputKey: string) {
  return { adapter: { kind, label: kind } as AgentAdapter, inputKey };
}
function setup() {
  const adapters = new Map<AgentKind, AgentAdapter>();
  const atReconciliation: AgentKind[][] = [];
  const reconcileAgentRegistry = vi.fn<(changedKinds: readonly string[]) => void>(() => {
    atReconciliation.push([...adapters.keys()]);
  });
  const service = new AgentRegistryService({
    adapters,
    settingsPath: "/owned/settings.json",
    settingsWriter: fileSettingsWriter("/owned/settings.json"),
    baseDir: "/owned",
    acpIconsDir: "/owned/icons",
    sharedSettingsCache: {
      invalidate: vi.fn<() => void>(),
    } as unknown as SupervisorSharedSettingsCache,
    getAgentStatusService: () => ({ reconcileAgentRegistry }) as unknown as AgentStatusService,
    getActiveWslProjectDistros: () => [],
    closeThreadsForAgentKind: vi.fn<(agentKind: AgentKind) => Promise<void>>(async () => {}),
  });
  return { service, adapters, reconcileAgentRegistry, atReconciliation };
}

describe("registry status publication ownership", () => {
  it("preserves warm-cache ownership on initial setup and unchanged polls", () => {
    fixtures.entries = [entry("acp-generic:first", "one")];
    const { service, adapters, reconcileAgentRegistry } = setup();
    service.refreshAgentRegistryAdapters();
    expect(reconcileAgentRegistry).not.toHaveBeenCalled();
    const initial = adapters.get("acp-generic:first");
    fixtures.entries = [entry("acp-generic:first", "one")];
    service.refreshAgentRegistryAdapters();
    expect(adapters.get("acp-generic:first")).toBe(initial);
    expect(reconcileAgentRegistry).toHaveBeenCalledExactlyOnceWith([]);
  });
  it("reconciles replacement, addition and removal after they are fully applied", () => {
    fixtures.entries = [entry("acp-generic:first", "one"), entry("acp-generic:removed", "old")];
    const { service, adapters, reconcileAgentRegistry, atReconciliation } = setup();
    service.refreshAgentRegistryAdapters();
    const initial = adapters.get("acp-generic:first");
    fixtures.entries = [entry("acp-generic:first", "two"), entry("acp-generic:added", "new")];
    service.refreshAgentRegistryAdapters();
    expect(adapters.get("acp-generic:first")).not.toBe(initial);
    expect(reconcileAgentRegistry).toHaveBeenCalledExactlyOnceWith([
      "acp-generic:removed",
      "acp-generic:first",
      "acp-generic:added",
    ]);
    expect(atReconciliation).toEqual([["acp-generic:first", "acp-generic:added"]]);
    service.refreshAgentRegistryAdapters();
    expect(reconcileAgentRegistry).toHaveBeenNthCalledWith(2, []);
    expect(atReconciliation).toHaveLength(2);
  });
  it("reconciles removal of the final registered adapter", () => {
    fixtures.entries = [entry("acp-generic:first", "one")];
    const { service, adapters, reconcileAgentRegistry } = setup();
    service.refreshAgentRegistryAdapters();
    fixtures.entries = [];
    service.refreshAgentRegistryAdapters();
    expect(adapters.size).toBe(0);
    expect(reconcileAgentRegistry).toHaveBeenCalledExactlyOnceWith(["acp-generic:first"]);
  });
});
