import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/bootstrap";
import type { AgentStatus, Thread } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
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

function agent(kind: string, label: string, mode: "gui" | "terminal"): AgentStatus {
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
    },
  } as unknown as AgentStatus;
}

function renderDialog(overrides: { thread?: Partial<Thread>; installedAgents?: AgentStatus[] }) {
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
