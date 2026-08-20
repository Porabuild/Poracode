import { beforeEach, describe, expect, it } from "vitest";
import type { AgentStatus, ProjectLocation } from "@/shared/contracts";
import {
  isDetectingAgentsForLocation,
  isDiscoveryActiveForLocation,
  useAgentStatusesStore,
} from "./agentStatusesStore";

function makeStatus(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: "gpt-5.5", label: "5.5" }],
      efforts: ["low", "medium"],
      modelEfforts: {},
      modes: ["agent", "plan"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      settingDefs: [],
    },
    ...overrides,
  };
}

function reset() {
  useAgentStatusesStore.setState({
    agentStatuses: [],
    wslAgentStatuses: [],
    windowsLoaded: false,
    wslLoaded: false,
    inFirstLaunchDiscovery: false,
    discoveryScope: undefined,
    discoveredAgents: [],
  });
}

beforeEach(reset);

describe("persisted agent status cache", () => {
  it("invalidates v10 statuses whose terminal auth methods lack baseSpawnEnv-derived env", async () => {
    const options = useAgentStatusesStore.persist.getOptions();
    expect(options.version).toBe(11);
    // Mirrors supervisor STATUS_CACHE_VERSION=14: a persisted antigravity
    // status from before the derivation would build the `agy` login command
    // without `AGY_CLI_DISABLE_AUTO_UPDATE`.
    const staleLogin = makeStatus({
      kind: "antigravity",
      label: "Antigravity",
      authState: "missing",
      authMethods: [{ id: "antigravity-login", name: "Antigravity login", type: "terminal" }],
      capabilities: { ...makeStatus().capabilities },
    });
    const migrated = await options.migrate!(
      {
        agentStatuses: [staleLogin],
        wslAgentStatuses: [],
        windowsLoaded: true,
        wslLoaded: true,
      },
      10,
    );
    expect(migrated).toMatchObject({
      agentStatuses: [],
      wslAgentStatuses: [],
      windowsLoaded: false,
      wslLoaded: false,
    });
  });

  it("invalidates v8 statuses cached before successful ACP sessions established auth", async () => {
    const options = useAgentStatusesStore.persist.getOptions();
    expect(options.version).toBe(11);
    const staleAcp = makeStatus({
      kind: "acp-generic:example",
      label: "Example ACP",
      authState: "missing",
      authMethods: [{ id: "login", name: "Login" }],
      capabilities: { ...makeStatus().capabilities },
    });
    const migrated = await options.migrate!(
      {
        agentStatuses: [staleAcp],
        wslAgentStatuses: [],
        windowsLoaded: true,
        wslLoaded: true,
      },
      8,
    );
    expect(migrated).toMatchObject({
      agentStatuses: [],
      wslAgentStatuses: [],
      windowsLoaded: false,
      wslLoaded: false,
    });
  });

  it("invalidates v6 statuses produced without the Grok login-shell environment", async () => {
    const options = useAgentStatusesStore.persist.getOptions();
    expect(options.version).toBe(11);
    expect(options.migrate).toBeTypeOf("function");

    const grok = makeStatus({
      kind: "grok",
      label: "Grok Build",
      capabilities: { ...makeStatus().capabilities, models: [] },
    });
    const migrated = await options.migrate!(
      {
        agentStatuses: [grok],
        wslAgentStatuses: [],
        windowsLoaded: true,
        wslLoaded: true,
      },
      6,
    );

    expect(migrated).toMatchObject({
      agentStatuses: [],
      wslAgentStatuses: [],
      windowsLoaded: false,
      wslLoaded: false,
    });
  });
});

describe("setAgentStatuses", () => {
  it("preserves the existing array reference when statuses are identity-equal", () => {
    const initial = [makeStatus({ kind: "claude", label: "Claude" })];
    useAgentStatusesStore.setState({ agentStatuses: initial, windowsLoaded: true });
    useAgentStatusesStore
      .getState()
      .setAgentStatuses([makeStatus({ kind: "claude", label: "Claude" })]);
    expect(useAgentStatusesStore.getState().agentStatuses).toBe(initial);
  });

  it("replaces the array when capabilities change (e.g. new slash commands)", () => {
    const cached = makeStatus();
    const fresh = makeStatus({
      capabilities: {
        ...cached.capabilities,
        slashCommands: [{ id: "status", label: "status", description: "Show config" }],
      },
    });
    useAgentStatusesStore.getState().hydrateFromCache({ windows: [cached], wsl: [] });
    useAgentStatusesStore.getState().setAgentStatuses([fresh]);
    expect(useAgentStatusesStore.getState().agentStatuses[0]?.capabilities.slashCommands).toEqual(
      fresh.capabilities.slashCommands,
    );
  });

  it("replaces the array when only Codex context-window capabilities change", () => {
    const cached = makeStatus({
      kind: "codex",
      capabilities: {
        ...makeStatus().capabilities,
        contextSizes: [
          { id: "272k", label: "272k" },
          { id: "400k", label: "400k" },
          { id: "1m", label: "1M" },
        ],
        defaultContextSize: "400k",
      },
    });
    const fresh = makeStatus({
      kind: "codex",
      capabilities: {
        ...cached.capabilities,
        contextSizes: [
          { id: "400k", label: "400k" },
          { id: "512k", label: "512k" },
        ],
        defaultContextSize: "400k",
        modelContextSizes: { "gpt-5.6-sol": ["400k", "512k"] },
      },
    });
    useAgentStatusesStore.getState().hydrateFromCache({ windows: [cached], wsl: [] });
    useAgentStatusesStore.getState().setAgentStatuses([fresh]);
    expect(useAgentStatusesStore.getState().agentStatuses[0]?.capabilities.contextSizes).toEqual(
      fresh.capabilities.contextSizes,
    );
  });

  it("replaces the array when ACP session readiness changes", () => {
    const cached = makeStatus({ authState: "unknown" });
    const fresh = makeStatus({ authState: "unknown", acpSessionEstablished: true });
    useAgentStatusesStore.setState({ agentStatuses: [cached], windowsLoaded: true });

    useAgentStatusesStore.getState().setAgentStatuses([fresh]);

    expect(useAgentStatusesStore.getState().agentStatuses).toEqual([fresh]);
  });

  it("replaces the array when only a presentation capability catalog changes", () => {
    const cached = makeStatus({
      capabilities: {
        ...makeStatus().capabilities,
        presentationCapabilities: {
          gui: {
            models: [{ id: "old-gui-model", label: "Old GUI model" }],
          },
        },
      },
    });
    const fresh = makeStatus({
      capabilities: {
        ...cached.capabilities,
        presentationCapabilities: {
          gui: {
            models: [{ id: "new-gui-model", label: "New GUI model" }],
          },
        },
      },
    });

    useAgentStatusesStore.getState().hydrateFromCache({ windows: [cached], wsl: [] });
    useAgentStatusesStore.getState().setAgentStatuses([fresh]);

    expect(
      useAgentStatusesStore.getState().agentStatuses[0]?.capabilities.presentationCapabilities?.gui
        ?.models,
    ).toEqual([{ id: "new-gui-model", label: "New GUI model" }]);
  });

  it("replaces the array when only a pinned runtime variant changes", () => {
    const base = makeStatus();
    const cached = makeStatus({
      runtimeVariants: {
        sdk: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: false,
          capabilities: {
            ...base.capabilities,
            models: [{ id: "old-sdk-model", label: "Old SDK model" }],
          },
        },
      },
      sessionRuntimeRouting: { prefixes: { "sdk:": "sdk" } },
    });
    const fresh = makeStatus({
      ...cached,
      runtimeVariants: {
        sdk: {
          ...cached.runtimeVariants!.sdk!,
          capabilities: {
            ...cached.runtimeVariants!.sdk!.capabilities,
            models: [{ id: "new-sdk-model", label: "New SDK model" }],
          },
        },
      },
    });

    useAgentStatusesStore.getState().hydrateFromCache({ windows: [cached], wsl: [] });
    useAgentStatusesStore.getState().setAgentStatuses([fresh]);

    expect(
      useAgentStatusesStore.getState().agentStatuses[0]?.runtimeVariants?.sdk?.capabilities.models,
    ).toEqual([{ id: "new-sdk-model", label: "New SDK model" }]);
  });

  it("replaces the array when only session runtime routing changes", () => {
    const cached = makeStatus({
      sessionRuntimeRouting: { prefixes: { "sdk:": "sdk" }, fallbackRuntime: "acp" },
    });
    const fresh = makeStatus({
      ...cached,
      sessionRuntimeRouting: { prefixes: { "sdk:": "sdk", "acp:": "acp" } },
    });

    useAgentStatusesStore.getState().hydrateFromCache({ windows: [cached], wsl: [] });
    useAgentStatusesStore.getState().setAgentStatuses([fresh]);

    expect(useAgentStatusesStore.getState().agentStatuses[0]?.sessionRuntimeRouting).toEqual({
      prefixes: { "sdk:": "sdk", "acp:": "acp" },
    });
  });

  it("replaces the array when only supportsOneShot flips (post-upgrade flag backfill)", () => {
    // A status persisted before the flag existed lacks supportsOneShot; the
    // freshly-detected one sets it. The store must adopt the fresh status so the
    // one-shot AI selectors stop hiding a one-shot-capable provider.
    const cached = makeStatus();
    expect(cached.capabilities.supportsOneShot).toBeUndefined();
    const fresh = makeStatus({
      capabilities: { ...cached.capabilities, supportsOneShot: true },
    });
    useAgentStatusesStore.getState().hydrateFromCache({ windows: [cached], wsl: [] });
    useAgentStatusesStore.getState().setAgentStatuses([fresh]);
    expect(useAgentStatusesStore.getState().agentStatuses[0]?.capabilities.supportsOneShot).toBe(
      true,
    );
  });

  it("flips windowsLoaded to true on first apply, ending first-launch discovery", () => {
    useAgentStatusesStore.setState({ inFirstLaunchDiscovery: true });
    useAgentStatusesStore.getState().setAgentStatuses([]);
    const state = useAgentStatusesStore.getState();
    expect(state.windowsLoaded).toBe(true);
    expect(state.inFirstLaunchDiscovery).toBe(false);
    expect(state.discoveryScope).toBeUndefined();
  });
});

describe("setWslAgentStatuses", () => {
  it("routes statuses into wslAgentStatuses (not agentStatuses)", () => {
    useAgentStatusesStore
      .getState()
      .setWslAgentStatuses([makeStatus({ envKind: "wsl", envDistro: "Ubuntu" })]);
    const state = useAgentStatusesStore.getState();
    expect(state.wslAgentStatuses).toHaveLength(1);
    expect(state.agentStatuses).toHaveLength(0);
    expect(state.wslLoaded).toBe(true);
  });

  it("ends WSL discovery when WSL statuses arrive", () => {
    useAgentStatusesStore.setState({
      inFirstLaunchDiscovery: true,
      discoveryScope: { kind: "wsl", distro: "Ubuntu" },
      wslLoaded: false,
    });
    useAgentStatusesStore
      .getState()
      .setWslAgentStatuses([makeStatus({ envKind: "wsl", envDistro: "Ubuntu" })]);
    const state = useAgentStatusesStore.getState();
    expect(state.wslLoaded).toBe(true);
    expect(state.inFirstLaunchDiscovery).toBe(false);
    expect(state.discoveryScope).toBeUndefined();
  });

  it("preserves reference when re-applying identical statuses", () => {
    const initial = [makeStatus({ envKind: "wsl", envDistro: "Ubuntu" })];
    useAgentStatusesStore.setState({ wslAgentStatuses: initial, wslLoaded: true });
    useAgentStatusesStore
      .getState()
      .setWslAgentStatuses([makeStatus({ envKind: "wsl", envDistro: "Ubuntu" })]);
    expect(useAgentStatusesStore.getState().wslAgentStatuses).toBe(initial);
  });
});

describe("hydrateFromCache", () => {
  it("populates both lists, marks both scopes loaded, and ends discovery", () => {
    useAgentStatusesStore.setState({ inFirstLaunchDiscovery: true });
    useAgentStatusesStore.getState().hydrateFromCache({
      windows: [makeStatus({ kind: "claude" })],
      wsl: [makeStatus({ kind: "gemini", envKind: "wsl", envDistro: "Ubuntu" })],
    });
    const state = useAgentStatusesStore.getState();
    expect(state.agentStatuses).toHaveLength(1);
    expect(state.wslAgentStatuses).toHaveLength(1);
    expect(state.windowsLoaded).toBe(true);
    expect(state.wslLoaded).toBe(true);
    expect(state.inFirstLaunchDiscovery).toBe(false);
    expect(state.discoveryScope).toBeUndefined();
  });
});

describe("beginFirstLaunchDiscovery", () => {
  it("turns on discovery and clears discovered list when not yet loaded", () => {
    useAgentStatusesStore.setState({
      discoveredAgents: [makeStatus({ kind: "stale" as never })],
    });
    useAgentStatusesStore.getState().beginFirstLaunchDiscovery();
    const state = useAgentStatusesStore.getState();
    expect(state.inFirstLaunchDiscovery).toBe(true);
    expect(state.discoveryScope).toEqual({ kind: "native" });
    expect(state.discoveredAgents).toEqual([]);
  });

  it("is a no-op once windowsLoaded=true", () => {
    useAgentStatusesStore.setState({ windowsLoaded: true });
    useAgentStatusesStore.getState().beginFirstLaunchDiscovery();
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(false);
  });

  it("can start WSL discovery after native statuses loaded", () => {
    useAgentStatusesStore.setState({ windowsLoaded: true, wslLoaded: true });
    useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "wsl", distro: "Ubuntu" });
    const state = useAgentStatusesStore.getState();
    expect(state.inFirstLaunchDiscovery).toBe(true);
    expect(state.discoveryScope).toEqual({ kind: "wsl", distro: "Ubuntu" });
    expect(state.wslLoaded).toBe(false);
  });

  it("can start combined discovery after statuses are already loaded", () => {
    useAgentStatusesStore.setState({ windowsLoaded: true, wslLoaded: true });
    useAgentStatusesStore
      .getState()
      .beginFirstLaunchDiscovery({ kind: "all", wslDistros: ["Ubuntu"] });
    const state = useAgentStatusesStore.getState();
    expect(state.inFirstLaunchDiscovery).toBe(true);
    expect(state.discoveryScope).toEqual({ kind: "all", wslDistros: ["Ubuntu"] });
  });
});

describe("pushDiscoveredAgent", () => {
  it("appends a windows agent and dedupes by kind", () => {
    useAgentStatusesStore.getState().pushDiscoveredAgent(makeStatus({ kind: "claude" }));
    useAgentStatusesStore.getState().pushDiscoveredAgent(makeStatus({ kind: "claude" }));
    expect(useAgentStatusesStore.getState().discoveredAgents).toHaveLength(1);
  });

  it("ignores WSL agents during native discovery", () => {
    useAgentStatusesStore.getState().beginFirstLaunchDiscovery();
    useAgentStatusesStore
      .getState()
      .pushDiscoveredAgent(makeStatus({ kind: "gemini", envKind: "wsl", envDistro: "Ubuntu" }));
    expect(useAgentStatusesStore.getState().discoveredAgents).toEqual([]);
  });

  it("appends matching WSL agents during WSL discovery", () => {
    useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "wsl", distro: "Ubuntu" });
    useAgentStatusesStore
      .getState()
      .pushDiscoveredAgent(makeStatus({ kind: "gemini", envKind: "wsl", envDistro: "Ubuntu" }));
    useAgentStatusesStore
      .getState()
      .pushDiscoveredAgent(makeStatus({ kind: "claude", envKind: "wsl", envDistro: "Debian" }));
    expect(useAgentStatusesStore.getState().discoveredAgents.map((status) => status.kind)).toEqual([
      "gemini",
    ]);
  });

  it("appends native and matching WSL agents during combined discovery", () => {
    useAgentStatusesStore
      .getState()
      .beginFirstLaunchDiscovery({ kind: "all", wslDistros: ["Ubuntu"] });
    useAgentStatusesStore.getState().pushDiscoveredAgent(makeStatus({ kind: "codex" }));
    useAgentStatusesStore
      .getState()
      .pushDiscoveredAgent(makeStatus({ kind: "codex", envKind: "wsl", envDistro: "Ubuntu" }));
    useAgentStatusesStore
      .getState()
      .pushDiscoveredAgent(makeStatus({ kind: "gemini", envKind: "wsl", envDistro: "Debian" }));
    expect(
      useAgentStatusesStore.getState().discoveredAgents.map((status) => status.envKind),
    ).toEqual([undefined, "wsl"]);
  });
});

describe("resetDiscoveredAgents", () => {
  it("clears the discovered list and ends first-launch discovery", () => {
    useAgentStatusesStore.setState({
      discoveredAgents: [makeStatus({ kind: "claude" })],
      inFirstLaunchDiscovery: true,
    });
    useAgentStatusesStore.getState().resetDiscoveredAgents();
    const state = useAgentStatusesStore.getState();
    expect(state.discoveredAgents).toEqual([]);
    expect(state.inFirstLaunchDiscovery).toBe(false);
    expect(state.discoveryScope).toBeUndefined();
  });

  it("is a no-op when there is nothing to clear", () => {
    const before = useAgentStatusesStore.getState();
    useAgentStatusesStore.getState().resetDiscoveredAgents();
    expect(useAgentStatusesStore.getState()).toBe(before);
  });
});

describe("mergeAgentStatus", () => {
  it("appends a new posix entry", () => {
    useAgentStatusesStore
      .getState()
      .mergeAgentStatus(makeStatus({ kind: "claude", envKind: "posix" }));
    expect(useAgentStatusesStore.getState().agentStatuses).toHaveLength(1);
    expect(useAgentStatusesStore.getState().windowsLoaded).toBe(true);
  });

  it("updates the matching posix entry in place by (kind, envKind, envDistro)", () => {
    const initial = makeStatus({ kind: "claude", authState: "missing" });
    useAgentStatusesStore.setState({ agentStatuses: [initial], windowsLoaded: true });
    const updated = makeStatus({ kind: "claude", authState: "authenticated" });
    useAgentStatusesStore.getState().mergeAgentStatus(updated);
    const state = useAgentStatusesStore.getState();
    expect(state.agentStatuses).toHaveLength(1);
    expect(state.agentStatuses[0]?.authState).toBe("authenticated");
  });

  it("routes WSL statuses into wslAgentStatuses and keeps posix list untouched", () => {
    const wsl = makeStatus({ kind: "gemini", envKind: "wsl", envDistro: "Ubuntu" });
    useAgentStatusesStore.getState().mergeAgentStatus(wsl);
    const state = useAgentStatusesStore.getState();
    expect(state.wslAgentStatuses).toHaveLength(1);
    expect(state.agentStatuses).toHaveLength(0);
    expect(state.wslLoaded).toBe(true);
  });

  it("treats different envDistro values as distinct entries", () => {
    useAgentStatusesStore
      .getState()
      .mergeAgentStatus(makeStatus({ kind: "gemini", envKind: "wsl", envDistro: "Ubuntu" }));
    useAgentStatusesStore
      .getState()
      .mergeAgentStatus(makeStatus({ kind: "gemini", envKind: "wsl", envDistro: "Debian" }));
    expect(useAgentStatusesStore.getState().wslAgentStatuses).toHaveLength(2);
  });
});

describe("removeAgentStatus", () => {
  it("removes matching statuses from native, WSL, and discovery lists", () => {
    const profile = makeStatus({ kind: "claude:glm" });
    const wslProfile = makeStatus({ kind: "claude:glm", envKind: "wsl", envDistro: "Ubuntu" });
    const codex = makeStatus({ kind: "codex" });
    useAgentStatusesStore.setState({
      agentStatuses: [profile, codex],
      wslAgentStatuses: [wslProfile],
      discoveredAgents: [profile],
    });

    useAgentStatusesStore.getState().removeAgentStatus("claude:glm");

    const state = useAgentStatusesStore.getState();
    expect(state.agentStatuses.map((status) => status.kind)).toEqual(["codex"]);
    expect(state.wslAgentStatuses).toEqual([]);
    expect(state.discoveredAgents).toEqual([]);
  });
});

describe("isDetectingAgentsForLocation", () => {
  it("returns true for a windows location when windowsLoaded is false", () => {
    const loc: ProjectLocation = { kind: "windows", path: "C:\\tmp" };
    expect(isDetectingAgentsForLocation({ windowsLoaded: false, wslLoaded: true }, loc)).toBe(true);
  });

  it("returns false for a windows location once windowsLoaded flips true", () => {
    const loc: ProjectLocation = { kind: "windows", path: "C:\\tmp" };
    expect(isDetectingAgentsForLocation({ windowsLoaded: true, wslLoaded: false }, loc)).toBe(
      false,
    );
  });

  it("uses wslLoaded for a WSL location", () => {
    const loc: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/u/p",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\u\\p",
    };
    expect(isDetectingAgentsForLocation({ windowsLoaded: true, wslLoaded: false }, loc)).toBe(true);
    expect(isDetectingAgentsForLocation({ windowsLoaded: false, wslLoaded: true }, loc)).toBe(
      false,
    );
  });
});

describe("isDiscoveryActiveForLocation", () => {
  it("matches native discovery to native projects", () => {
    const loc: ProjectLocation = { kind: "windows", path: "C:\\tmp" };
    expect(
      isDiscoveryActiveForLocation(
        { inFirstLaunchDiscovery: true, discoveryScope: { kind: "native" } },
        loc,
      ),
    ).toBe(true);
  });

  it("matches WSL discovery only to the same distro", () => {
    const loc: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/u/p",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\u\\p",
    };
    expect(
      isDiscoveryActiveForLocation(
        { inFirstLaunchDiscovery: true, discoveryScope: { kind: "wsl", distro: "Ubuntu" } },
        loc,
      ),
    ).toBe(true);
    expect(
      isDiscoveryActiveForLocation(
        { inFirstLaunchDiscovery: true, discoveryScope: { kind: "wsl", distro: "Debian" } },
        loc,
      ),
    ).toBe(false);
  });

  it("matches combined discovery to every project location", () => {
    const loc: ProjectLocation = { kind: "windows", path: "C:\\tmp" };
    expect(
      isDiscoveryActiveForLocation(
        { inFirstLaunchDiscovery: true, discoveryScope: { kind: "all", wslDistros: ["Ubuntu"] } },
        loc,
      ),
    ).toBe(true);
  });
});
