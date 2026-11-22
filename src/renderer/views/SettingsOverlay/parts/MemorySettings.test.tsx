import "fake-indexeddb/auto";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useMemoryOperationsStore, type MemorySyncDetails } from "@/renderer/state/memorySync";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { agentStatusSchema } from "@/shared/contracts/agent";
import { defaultMemorySettings } from "@/shared/memory";
import { MemorySettings } from "./MemorySettings";

const mocks = vi.hoisted(() => ({
  memoryCommand: vi.fn<(payload: unknown) => Promise<unknown>>(),
  runMemoryCatalogCommand: vi.fn<(...args: unknown[]) => Promise<unknown>>(
    () => new Promise(() => {}),
  ),
  syncDetailed: vi.fn<(options?: { force?: boolean }) => Promise<MemorySyncDetails>>(),
  syncBasic: vi.fn<() => Promise<{ syncedHosts: number; changed: boolean }>>(async () => ({
    syncedHosts: 0,
    changed: false,
  })),
  editPairedHostSettings: vi.fn<
    (key: string, edit: (current: Record<string, unknown>) => unknown) => Promise<void>
  >(async () => undefined),
  usePairedHostSettings: vi.fn<
    (
      key: string | undefined,
    ) => { generation: number; settings?: Record<string, unknown>; error?: unknown } | undefined
  >(() => undefined),
}));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isRemoteSession: () => false,
  readBridge: () => ({ memoryCommand: mocks.memoryCommand }),
}));

vi.mock("@/renderer/state/memoryCatalog", () => ({
  runMemoryCatalogCommand: (...args: unknown[]) => mocks.runMemoryCatalogCommand(...args),
}));

vi.mock("@/renderer/state/memorySync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/state/memorySync")>()),
  syncMemoryAcrossEnvironments: () => mocks.syncBasic(),
  syncMemoryAcrossEnvironmentsDetailed: (options?: { force?: boolean }) =>
    mocks.syncDetailed(options),
}));

vi.mock("@/renderer/state/pairedHostSettings", () => ({
  editPairedHostSettings: (key: string, edit: (current: Record<string, unknown>) => unknown) =>
    mocks.editPairedHostSettings(key, edit),
  usePairedHostSettings: (key: string | undefined) => mocks.usePairedHostSettings(key),
}));

const agent = agentStatusSchema.parse({
  kind: "test-agent",
  label: "Test agent",
  installed: true,
  authState: "authenticated",
  capabilities: {
    supportsOneShot: true,
    models: [
      { id: "flash", label: "Flash" },
      { id: "pro", label: "Pro" },
      { id: "plain", label: "Plain" },
    ],
    modelEfforts: { flash: ["low", "medium"], pro: ["medium", "high"], plain: [] },
  },
});

function reasoningFor(title: "Capture model" | "Dream model") {
  return within(screen.getByRole("group", { name: title })).getByRole("button", {
    name: "Reasoning",
  });
}

function pickOption(option: HTMLElement) {
  fireEvent.pointerDown(option, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.mouseDown(option, { button: 0 });
  fireEvent.pointerUp(option, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.mouseUp(option, { button: 0 });
  fireEvent.click(option, { button: 0 });
}

function pickReasoning(title: "Capture model" | "Dream model", label: string) {
  fireEvent.click(reasoningFor(title));
  pickOption(screen.getByRole("option", { name: label }));
}

describe("Memory model reasoning", () => {
  beforeEach(() => {
    useAgentStatusesStore.setState({ agentStatuses: [agent], wslAgentStatuses: [] });
    useSharedSettings.setState({ memory: { ...defaultMemorySettings, enabled: true } });
  });

  afterEach(() => {
    cleanup();
    mocks.memoryCommand.mockReset();
    mocks.runMemoryCatalogCommand.mockReset().mockImplementation(() => new Promise(() => {}));
    mocks.syncDetailed.mockReset();
    mocks.syncBasic.mockReset().mockResolvedValue({ syncedHosts: 0, changed: false });
    mocks.editPairedHostSettings.mockReset().mockResolvedValue(undefined);
    mocks.usePairedHostSettings.mockReset().mockReturnValue(undefined);
    useMemoryOperationsStore.setState({
      syncing: false,
      syncProgress: null,
      dreaming: false,
      dreamStartedAt: null,
      undoing: false,
      notice: null,
    });
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useAgentStatusesStore.setState({ agentStatuses: [], wslAgentStatuses: [] });
    useSharedSettings.setState({ memory: defaultMemorySettings });
    localStorage.clear();
  });

  it("saves per-model effort independently and restores the default without changing the model", () => {
    renderWithI18n(<MemorySettings />);

    expect(reasoningFor("Capture model")).toHaveTextContent("Default");
    fireEvent.click(reasoningFor("Capture model"));
    expect(screen.queryByRole("option", { name: "High" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    pickReasoning("Capture model", "Low");
    pickReasoning("Dream model", "High");

    expect(useSharedSettings.getState().memory).toMatchObject({
      captureProvider: agent.kind,
      captureModel: "flash",
      captureEffort: "low",
      dreamProvider: agent.kind,
      dreamModel: "pro",
      dreamEffort: "high",
    });
    expect(reasoningFor("Capture model")).toHaveTextContent("Low");
    expect(reasoningFor("Dream model")).toHaveTextContent("High");

    pickReasoning("Capture model", "Default");
    expect(useSharedSettings.getState().memory).toMatchObject({
      captureModel: "flash",
      captureEffort: "",
      dreamEffort: "high",
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Dream model" })).getByRole("button", {
        name: "Reset",
      }),
    );
    expect(useSharedSettings.getState().memory).toMatchObject({
      dreamProvider: "auto",
      dreamModel: "",
      dreamEffort: "",
    });
  });

  it("does not offer an effort choice for a model without tiers and disables it when memory is off", () => {
    useSharedSettings.setState({
      memory: {
        ...defaultMemorySettings,
        enabled: false,
        captureProvider: agent.kind,
        captureModel: "plain",
      },
    });
    renderWithI18n(<MemorySettings />);

    expect(
      within(screen.getByRole("group", { name: "Capture model" })).queryByRole("button", {
        name: "Reasoning",
      }),
    ).not.toBeInTheDocument();
    expect(reasoningFor("Dream model")).toBeDisabled();
  });

  it("changes the exact member for model-bound effort and keeps it on a family re-pick", async () => {
    useAgentStatusesStore.setState({
      agentStatuses: [
        {
          ...agent,
          capabilities: {
            ...agent.capabilities,
            modelFamilies: [
              {
                model: "pro",
                label: "Pro family",
                selectors: [],
                bindings: { effort: "model", fast: "config" },
                members: [
                  { model: "pro", selections: {}, effort: "high" },
                  { model: "plain", selections: {}, effort: "low" },
                ],
              },
            ],
          },
        },
      ],
    });
    renderWithI18n(<MemorySettings />);

    expect(reasoningFor("Dream model")).toHaveTextContent("High");
    pickReasoning("Dream model", "Low");
    fireEvent.click(screen.getByRole("button", { name: "Dream model" }));
    const search = await screen.findByPlaceholderText("Search models...");
    fireEvent.change(search, { target: { value: "Pro family" } });
    pickOption(await screen.findByRole("option", { name: /Pro family/ }));

    expect(reasoningFor("Dream model")).toHaveTextContent("Low");
    expect(useSharedSettings.getState().memory).toMatchObject({
      dreamProvider: agent.kind,
      dreamModel: "plain",
      dreamEffort: "",
    });
  });

  it("shows loading state, live progress, and outcome feedback for Dream and Sync", async () => {
    let resolveDream!: (value: unknown) => void;
    mocks.memoryCommand.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDream = resolve;
        }),
    );
    mocks.runMemoryCatalogCommand.mockResolvedValue({
      enabled: true,
      learning: true,
      syncEnabled: true,
      captureTiming: "settle-2m",
      pendingCandidates: 0,
      entryCount: 12,
      suggestionCount: 0,
      lastDreamAt: null,
      lastDreamSummary: null,
      lastDreamRunId: null,
      lastDreamCounts: null,
      threadMode: null,
    });

    renderWithI18n(<MemorySettings />);
    fireEvent.click(screen.getByRole("button", { name: "Dream now" }));

    expect(screen.getByRole("button", { name: "Dreaming…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Consolidating memories…");

    resolveDream({ report: "Promoted 2. Suggested 0 skills.", runId: "dream-1" });
    await waitFor(() =>
      expect(
        screen.getByText("Dream finished: Promoted 2. Suggested 0 skills."),
      ).toBeInTheDocument(),
    );

    mocks.syncDetailed.mockResolvedValueOnce({
      syncedHosts: 0,
      changed: false,
      onlineHosts: 1,
      skippedDisabledHosts: ["Mac Studio"],
      failedHosts: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() =>
      expect(
        screen.getByText("Skipped Mac Studio — memory or sync is turned off there."),
      ).toBeInTheDocument(),
    );
  });

  it("reads and patches memory settings for a selected paired host", async () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "mac-studio",
          label: "Mac Studio",
          endpoint: "https://mac.test",
          accessToken: "fixture",
          scopes: ["session:operate"],
          memoryCatalogAvailable: true,
        },
      ] as never,
      runtime: {
        "mac-studio": {
          status: "online",
          projects: [],
          threads: [],
          agentStatuses: { windows: [agent], wsl: [], updatedAt: "now" },
        },
      } as never,
    });
    mocks.usePairedHostSettings.mockReturnValue({
      generation: 1,
      settings: {
        memory: { ...defaultMemorySettings, enabled: false },
        disabledAgents: [],
        hiddenModels: {},
      },
    });
    mocks.runMemoryCatalogCommand.mockResolvedValue({
      enabled: false,
      learning: true,
      syncEnabled: true,
      captureTiming: "settle-2m",
      pendingCandidates: 0,
      entryCount: 2,
      suggestionCount: 0,
      lastDreamAt: null,
      lastDreamSummary: null,
      lastDreamRunId: null,
      lastDreamCounts: null,
      threadMode: null,
    });

    renderWithI18n(<MemorySettings connectionKey="mac-studio" />);
    const toggle = screen.getByRole("switch", { name: "Use memory" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => expect(mocks.editPairedHostSettings).toHaveBeenCalledTimes(1));
    const [hostKey, updater] = mocks.editPairedHostSettings.mock.calls[0]!;
    expect(hostKey).toBe("mac-studio");
    expect(updater({ memory: { ...defaultMemorySettings, enabled: false } })).toEqual({
      memory: expect.objectContaining({ enabled: true }),
    });
    expect(useSharedSettings.getState().memory.enabled).toBe(true);
  });
});
