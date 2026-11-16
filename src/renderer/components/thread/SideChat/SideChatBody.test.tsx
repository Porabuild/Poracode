import { useState } from "react";
import { act, createEvent, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentCapability, AgentStatus, Project, PromptSegment } from "@/shared/contracts";
import type { SideChatBootstrap, SideChatSelection } from "@/shared/ipc/sideChat";
import "@/renderer/components/providers/bootstrap";
import { sideChatDraftFromBootstrap } from "./useSideChatSession";

const project: Project = {
  id: "project",
  name: "Project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const capabilities: AgentCapability = {
  models: [
    { id: "test", label: "Test Model" },
    { id: "alt", label: "Alt Model" },
  ],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  presentationModes: ["gui"],
  settingDefs: [],
};

const agents: AgentStatus[] = [
  {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities,
  },
];

const mocks = vi.hoisted(() => ({
  start: vi.fn<(...args: unknown[]) => Promise<void>>(),
  threadId: undefined as string | undefined,
  setThreadId: undefined as ((id: string | undefined) => void) | undefined,
}));

vi.mock("@/renderer/hooks/uiSelectors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/hooks/uiSelectors")>();
  return {
    ...actual,
    useDraftEnvironment: () => ({
      agentStatuses: agents,
      isDetectingAgents: false,
    }),
  };
});

vi.mock("./useSideChatSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useSideChatSession")>();
  return {
    ...actual,
    useSideChatSession: (entry: SideChatBootstrap) => {
      const [selection, setSelection] = useState<SideChatSelection>(
        entry.selection ?? {
          agentKind: "codex",
          config: { model: "test", mode: "agent" },
        },
      );
      const [draftContent, setDraftContent] = useState(() => sideChatDraftFromBootstrap(entry));
      const [threadId, setThreadId] = useState<string | undefined>(mocks.threadId);
      mocks.setThreadId = setThreadId;
      return {
        composerId: `side-chat:${entry.id ?? "test"}`,
        draftContent,
        setDraftContent,
        draftEditorMountedRef: { current: false },
        selection,
        setSelection,
        project,
        threadId,
        busy: false,
        hasProject: true,
        start: async (
          question: string,
          segments?: PromptSegment[],
          launchSelection?: SideChatSelection,
        ) => {
          setThreadId("optimistic-child");
          await mocks.start(question, segments, launchSelection);
        },
      };
    },
  };
});
vi.mock("./SideChatModelText", () => ({ SideChatModelText: () => null }));
vi.mock("./SideChatThreadView", () => ({
  SideChatThreadView: ({ threadId }: { threadId: string }) => (
    <div data-testid="side-chat-thread-view">{threadId}</div>
  ),
}));

import { SideChatBody } from "./SideChatBody";

beforeEach(() => {
  mocks.start.mockReset().mockResolvedValue(undefined);
  mocks.threadId = undefined;
});

it("can add, remove, and re-add Plan from a side-chat draft", async () => {
  const entry = {
    source: { id: "parent", projectId: "project", agentKind: "codex", config: { model: "test" } },
    title: "Side chat",
    prompt: "",
    context: null,
  } as SideChatBootstrap;
  render(<SideChatBody entry={entry} surface="panel" />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Add attachment or capability" }),
    ).toBeInTheDocument(),
  );
  expect(screen.queryByRole("button", { name: "Work" })).not.toBeInTheDocument();
  for (let index = 0; index < 2; index++) {
    fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Plan" }));
    expect(screen.queryByRole("button", { name: "Remove Plan" })).not.toBeInTheDocument();
  }
});

it("keeps side-chat selections as removable chips in MentionInput and switches optimistically on send", async () => {
  let resolveStart!: () => void;
  mocks.start.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveStart = resolve;
    }),
  );
  const entry = {
    source: { id: "parent", projectId: "project", agentKind: "codex", config: { model: "test" } },
    title: "Side chat",
    prompt: "first line\nsecond line",
    context: null,
    segments: [{ kind: "text", content: "first line\nsecond line", selection: true }],
  } as SideChatBootstrap;
  const view = render(<SideChatBody entry={entry} surface="panel" />);
  const input = await screen.findByRole("textbox");
  await waitFor(() => expect(screen.getByText("first line second line")).toBeInTheDocument());
  const remove = screen.getByRole("button", { name: "Remove" });
  const mouseDown = createEvent.mouseDown(remove);
  fireEvent(remove, mouseDown);
  expect(mouseDown.defaultPrevented).toBe(true);
  expect(screen.queryByText("first line second line")).not.toBeInTheDocument();

  // Undo brings the selection chip back, just like Main Chat.
  fireEvent.keyDown(input, { key: "z", ctrlKey: true });
  await waitFor(() => expect(screen.getByText("first line second line")).toBeInTheDocument());

  input.appendChild(document.createTextNode(" Explain this"));
  fireEvent.input(input);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  // Optimistically transitions to SideChatThreadView before start() resolves.
  await waitFor(() =>
    expect(screen.getByTestId("side-chat-thread-view")).toHaveTextContent("optimistic-child"),
  );
  expect(mocks.start).toHaveBeenCalledWith(
    "first line\nsecond line Explain this",
    [
      { kind: "text", content: "first line\nsecond line", selection: true },
      { kind: "text", content: " Explain this" },
    ],
    expect.objectContaining({ agentKind: "codex" }),
  );
  await act(async () => {
    resolveStart();
    await Promise.resolve();
  });
  view.unmount();
});
