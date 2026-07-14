import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadHeaderStatusButton } from "./ThreadHeaderStatus";

const { useThreadHasBackgroundActivityMock } = vi.hoisted(() => ({
  useThreadHasBackgroundActivityMock: vi.fn<(threadId: string) => boolean>(),
}));

vi.mock("@heroui/react", () => ({
  Tooltip: Object.assign((props: { children: ReactNode }) => <>{props.children}</>, {
    Trigger: (props: { children: ReactNode }) => <>{props.children}</>,
    Content: (props: { children: ReactNode }) => <>{props.children}</>,
  }),
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: (props: { tone: string }) => (
    <span data-testid="provider-status" data-tone={props.tone} />
  ),
}));

vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useThreadHasBackgroundActivity: (threadId: string) =>
    useThreadHasBackgroundActivityMock(threadId),
}));

vi.mock("@/renderer/state/useThread", () => ({
  useThread: () => undefined,
}));

function makeThread(status: "idle" | "finished"): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread 1",
    agentKind: "claude",
    config: { model: "claude-sonnet-4-5" },
    status,
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
  };
}

describe("ThreadHeaderStatusButton", () => {
  beforeEach(() => {
    useThreadHasBackgroundActivityMock.mockReset();
    useThreadHasBackgroundActivityMock.mockReturnValue(true);
  });

  it.each(["idle", "finished"] as const)(
    "shows a %s thread as working while background activity remains",
    (status) => {
      const thread = makeThread(status);

      const { getByRole, getByTestId } = render(
        <ThreadHeaderStatusButton
          threadId={thread.id}
          fallbackThread={thread}
          fallbackAgentKind="claude"
          agentLabel="Claude"
        />,
      );

      expect(
        getByRole("button", { name: "Claude: Working. Hover for status details." }),
      ).toBeInTheDocument();
      expect(getByTestId("provider-status")).toHaveAttribute("data-tone", "working");
      expect(useThreadHasBackgroundActivityMock).toHaveBeenCalledOnce();
    },
  );
});
