import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/bootstrap";
import type { AgentStatus, Thread } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ContinueInProviderDialog } from "./ContinueInProviderDialog";

type DialogProps = Parameters<typeof ContinueInProviderDialog>[0];

const { bridge } = vi.hoisted(() => ({
  bridge: {
    platform: "win32" as const,
    extractContext: vi.fn<() => Promise<unknown>>(),
    cancelExtractContext: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    searchProjectFiles: vi
      .fn<() => Promise<{ entries: unknown[]; totalIndexed: number }>>()
      .mockResolvedValue({ entries: [], totalIndexed: 0 }),
  },
}));

vi.mock("../../bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isDevApp: () => false,
  isCompactClientSurface: () => false,
}));

const thread: Thread = {
  id: "thread-1",
  projectId: "project-1",
  agentKind: "claude",
  config: { model: "claude-opus-5" },
  title: "Incident triage",
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "gui",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function agent(
  kind: string,
  label: string,
  mode: "gui" | "terminal",
  capabilityOverrides?: Record<string, unknown>,
): AgentStatus {
  return {
    kind,
    label,
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: `${kind}-model`, label: `${kind} model` }],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: mode === "gui" ? "server" : "terminal",
      presentationMode: mode,
      presentationModes: [mode],
      ...capabilityOverrides,
    },
  } as unknown as AgentStatus;
}

function renderDialog(overrides: {
  thread?: Partial<Thread>;
  installedAgents?: AgentStatus[];
  lastDraftConfig?: DialogProps["lastDraftConfig"];
}) {
  const onContinue = vi.fn<DialogProps["onContinue"]>();
  render(
    <AppProvider>
      <ContinueInProviderDialog
        isOpen
        thread={{ ...thread, ...overrides.thread }}
        projectLocation={{ kind: "windows", path: "C:\\repo" }}
        installedAgents={
          overrides.installedAgents ?? [
            agent("claude", "Claude", "gui"),
            agent("codex", "Codex", "terminal"),
          ]
        }
        {...(overrides.lastDraftConfig ? { lastDraftConfig: overrides.lastDraftConfig } : {})}
        onClose={() => {}}
        onContinue={onContinue}
      />
    </AppProvider>,
  );
  return onContinue;
}

function seedRuntimeItems(items: readonly RuntimeChatItem[]) {
  useAppStore.setState({
    runtimeItemIdsByThread: { [thread.id]: items.map((item) => item.id) },
    runtimeItemsByIdByThread: {
      [thread.id]: Object.fromEntries(items.map((item) => [item.id, item])),
    },
  } as never);
}

async function pressSwitch() {
  fireEvent.click(await screen.findByRole("button", { name: "Switch" }));
}

describe("ContinueInProviderDialog handoff flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.extractContext.mockResolvedValue({
      summary: "extracted",
      sourceProvider: "claude",
      sourceSessionId: "session-1",
      extractedAt: "2026-09-01T00:00:00.000Z",
    });
    useSharedSettings.setState({
      hiddenModels: {},
      providerConfigs: {},
      providerModelPreferences: {},
    } as never);
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      threadMentionToolsAvailableByThreadId: {},
    } as never);
  });

  it("hands the stored chat history over without costing an extraction run", async () => {
    seedRuntimeItems([
      {
        id: "u1",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Fix the flaky test" }] },
        streams: {},
      },
    ]);
    const onContinue = renderDialog({
      thread: {
        sessionRef: { providerSessionId: "ses_1", discoveredAt: "2026-09-01T00:00:00.000Z" },
      },
    });

    await pressSwitch();

    // A stored history exists, so extraction must not run even though the
    // thread has a session to extract from.
    expect(bridge.extractContext).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({ model: "codex-model" }),
      "terminal",
      expect.anything(),
      undefined, // empty composer: no segments
      "switch",
      {
        strategy: "context-file",
        extracted: expect.objectContaining({
          contentKind: "transcript",
          summary: expect.stringContaining("Fix the flaky test"),
        }),
      },
    );
  });

  it.each([
    ["32k", 44_800],
    ["200k", 280_000],
    ["1m", 1_400_000],
  ])("sizes stored history for the destination's %s window", async (contextSize, budget) => {
    seedRuntimeItems([
      {
        id: "u1",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Original ask" }] },
        streams: {},
      },
      ...Array.from({ length: 100 }, (_, index): RuntimeChatItem => ({
        id: `a${index}`,
        type: "assistant_message",
        state: "completed",
        payload: {},
        streams: { assistant_text: `Turn ${index}: ${"x".repeat(5_900)}` },
      })),
    ]);
    const onContinue = renderDialog({
      thread: { config: { model: "source-model", contextSize: "1k" } },
      installedAgents: [
        agent("claude", "Claude", "gui"),
        agent("codex", "Codex", "terminal", {
          contextSizes: [{ id: contextSize, label: contextSize }],
          defaultContextSize: contextSize,
        }),
      ],
    });

    await pressSwitch();

    expect(bridge.extractContext).not.toHaveBeenCalled();
    expect(onContinue.mock.calls[0]?.[1].contextSize).toBe(contextSize);
    const context = onContinue.mock.calls[0]?.[6];
    expect(context?.strategy).toBe("context-file");
    if (context?.strategy !== "context-file") throw new Error("Expected transferred context");
    const summary = context.extracted?.summary ?? "";
    expect(summary).toContain("Original ask");
    expect(summary).toContain("Turn 99:");
    expect(summary.length).toBeLessThanOrEqual(budget);
    expect(summary.length).toBeGreaterThan(Math.min(budget, 590_000) - 7_000);
    expect(summary.includes("Turn 0:")).toBe(contextSize === "1m");
  });

  it("hands the thread itself over when the target can read it", async () => {
    useAppStore.setState({
      threadMentionToolsAvailableByThreadId: { [thread.id]: true },
    } as never);
    const onContinue = renderDialog({
      thread: {
        sessionRef: { providerSessionId: "ses_1", discoveredAt: "2026-09-01T00:00:00.000Z" },
      },
      installedAgents: [agent("claude", "Claude", "gui"), agent("codex", "Codex", "gui")],
    });

    await pressSwitch();

    expect(bridge.extractContext).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledWith(
      "codex",
      expect.anything(),
      "gui",
      expect.anything(),
      undefined, // empty composer: no segments
      "switch",
      { strategy: "thread-transcript" },
    );
  });

  it("hands the thread itself over to a target that owns its MCP config at provider level", async () => {
    // Such a provider declares a composer MCP scope of "none" because the
    // composer has nothing to toggle, yet the supervisor still resolves the
    // built-in `read_thread` server for it. It must not be sent a context file.
    useAppStore.setState({
      threadMentionToolsAvailableByThreadId: { [thread.id]: true },
    } as never);
    const providerOwnedMcpTarget = agent("codex", "Codex", "gui");
    Object.assign(providerOwnedMcpTarget.capabilities, {
      mcpScope: { terminal: "none", gui: "none" },
      mcpConfigSource: "agentSettings",
    });
    const onContinue = renderDialog({
      thread: {
        sessionRef: { providerSessionId: "ses_1", discoveredAt: "2026-09-01T00:00:00.000Z" },
      },
      installedAgents: [agent("claude", "Claude", "gui"), providerOwnedMcpTarget],
    });

    await pressSwitch();

    expect(bridge.extractContext).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledWith(
      "codex",
      expect.anything(),
      "gui",
      expect.anything(),
      undefined,
      "switch",
      { strategy: "thread-transcript" },
    );
  });

  it("starts without context when nothing is stored and no session exists", async () => {
    const onContinue = renderDialog({});

    await pressSwitch();

    expect(bridge.extractContext).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledWith(
      "codex",
      expect.anything(),
      "terminal",
      expect.anything(),
      undefined, // empty composer: no segments
      "switch",
      { strategy: "context-file", extracted: null },
    );
  });

  it("shows the error phase and continues without context when extraction fails", async () => {
    bridge.extractContext.mockRejectedValue(new Error("provider quota exhausted"));
    const onContinue = renderDialog({
      thread: {
        sessionRef: { providerSessionId: "ses_1", discoveredAt: "2026-09-01T00:00:00.000Z" },
      },
    });

    await pressSwitch();
    expect(await screen.findByText("Could not extract context.")).toBeTruthy();
    expect(screen.getByText("provider quota exhausted")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start Without Context" }));

    expect(onContinue).toHaveBeenCalledWith(
      "codex",
      expect.anything(),
      "terminal",
      expect.anything(),
      undefined, // empty composer: no segments
      "switch",
      { strategy: "context-file", extracted: null },
    );
  });
});

describe("ContinueInProviderDialog target config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSharedSettings.setState({
      hiddenModels: {},
      providerConfigs: {},
      providerModelPreferences: {},
    } as never);
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      threadMentionToolsAvailableByThreadId: {},
    } as never);
  });

  it("falls back to a visible, labeled model when the saved model is hidden", async () => {
    const target = agent("codex", "Codex", "gui", {
      models: [
        { id: "codex-hidden", label: "Codex Hidden" },
        { id: "codex-visible", label: "Codex Visible" },
      ],
    });
    useSharedSettings.setState({ hiddenModels: { codex: ["codex-hidden"] } } as never);

    const onContinue = renderDialog({
      installedAgents: [agent("claude", "Claude", "gui"), target],
      lastDraftConfig: { agentKind: "codex", model: "codex-hidden" } as never,
    });

    // The picker trigger can only label models it displays, so a hidden model
    // would render as its bare id.
    expect((await screen.findAllByText("Codex Visible")).length).toBeGreaterThan(0);
    expect(screen.queryByText("codex-hidden")).toBeNull();

    await pressSwitch();
    expect(onContinue).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({ model: "codex-visible" }),
      "gui",
      expect.anything(),
      undefined,
      "switch",
      expect.anything(),
    );
  });

  it("applies the saved per-provider permission level for a target the project did not last use", async () => {
    const target = agent("codex", "Codex", "gui", {
      approvalPolicies: [
        { id: "always", label: "Bypass Approvals" },
        { id: "never", label: "Ask" },
      ],
      bypassPermissions: { approvalPolicy: "always" },
    });
    useSharedSettings.setState({
      providerConfigs: { codex: { model: "codex-model", approvalPolicy: "never" } },
    } as never);

    const onContinue = renderDialog({
      installedAgents: [agent("claude", "Claude", "gui"), target],
      // The project's last draft is a different provider, so the saved config
      // has to come from the app-wide per-provider settings.
      lastDraftConfig: { agentKind: "claude", model: "claude-model" } as never,
    });

    await pressSwitch();
    expect(onContinue).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({ approvalPolicy: "never" }),
      "gui",
      expect.anything(),
      undefined,
      "switch",
      expect.anything(),
    );
  });

  it("falls back to the provider's declared default permission level when nothing is saved", async () => {
    const target = agent("codex", "Codex", "gui", {
      approvalPolicies: [
        { id: "always", label: "Bypass Approvals" },
        { id: "never", label: "Ask" },
      ],
      defaultApprovalPolicy: "never",
    });

    const onContinue = renderDialog({
      installedAgents: [agent("claude", "Claude", "gui"), target],
    });

    await pressSwitch();
    expect(onContinue).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({ approvalPolicy: "never" }),
      "gui",
      expect.anything(),
      undefined,
      "switch",
      expect.anything(),
    );
  });
});
