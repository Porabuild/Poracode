import type { ReactNode } from "react";
import { act, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentStatusSchema, type Project, type Thread } from "@/shared/contracts";
import { useContinueInProviderStore } from "@/renderer/state/continueInProviderStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { setConfirmThreadDelete } from "@/renderer/state/threadDeletePreference";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { CompactThreadHeader } from "./CompactThreadHeader";

const deleteThread = vi.hoisted(() =>
  vi.fn<typeof import("@/renderer/actions/threadActions").deleteThread>(),
);
vi.mock("@/renderer/actions/threadActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/actions/threadActions")>()),
  deleteThread,
}));

vi.mock("@/renderer/components/mobileComposer/MobileCircleButton", () => ({
  MobileCircleButton: (props: {
    children: ReactNode;
    "aria-label": string;
    onPress?: () => void;
  }) => (
    <button type="button" aria-label={props["aria-label"]} onClick={props.onPress}>
      {props.children}
    </button>
  ),
}));

vi.mock("./ThreadHeaderStatus", () => ({
  ThreadHeaderStatusButton: () => <span data-testid="thread-status" />,
}));

const thread: Thread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Casual greeting",
  agentKind: "claude",
  config: { model: "claude-sonnet-4-5" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

const project = {
  id: "project-1",
  name: "Lightcode",
  location: { kind: "posix", path: "/work/lightcode" },
  remoteServerId: "desktop-1",
  remoteId: "remote-project-1",
  createdAt: "2026-08-15T00:00:00.000Z",
} as Project;

describe("CompactThreadHeader", () => {
  beforeEach(() => {
    deleteThread.mockClear();
    useContinueInProviderStore.setState({ requestedThreadId: null });
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
  });

  it("shows the project and hosting machine beneath the thread title", () => {
    const { getByText, queryByTestId } = render(
      <CompactThreadHeader thread={thread} project={project} />,
    );

    expect(getByText("Casual greeting")).toBeInTheDocument();
    const projectLine = getByText("Lightcode").parentElement;
    expect(projectLine).toHaveTextContent("LightcodeMacBook 16");
    expect(queryByTestId("thread-status")).not.toBeInTheDocument();
  });

  it("asks for confirmation before deleting from the thread header", () => {
    const { closeDialog } = useWorktreeDeleteStore.getState();
    closeDialog();
    setConfirmThreadDelete(true);
    const { getByRole } = render(<CompactThreadHeader thread={thread} project={project} />);

    try {
      fireEvent.click(getByRole("button", { name: "Thread actions" }));
      fireEvent.click(getByRole("button", { name: "Delete Thread" }));

      expect(deleteThread).not.toHaveBeenCalled();
      expect(useWorktreeDeleteStore.getState().dialog).toMatchObject({
        kind: "single-thread",
        threadId: thread.id,
        projectId: project.id,
      });
    } finally {
      closeDialog();
    }
  });

  it("hands off only with an available provider and operate scope on the thread's desktop", async () => {
    const owner: RemoteServerRecord = {
      desktopId: "desktop-1",
      label: "MacBook 16",
      endpoint: "https://desktop-1.test",
      accessToken: "test-owner",
      scopes: ["session:read", "session:operate"],
    };
    const provider = (kind: string) =>
      agentStatusSchema.parse({
        kind,
        label: kind,
        installed: true,
        authState: "authenticated",
        capabilities: {},
      });
    const current = provider("claude");
    const alternative = provider("codex");
    const online = { status: "online" as const, projects: [], threads: [] };
    useRemoteServersStore.setState({
      servers: [owner, { ...owner, desktopId: "desktop-2", endpoint: "https://desktop-2.test" }],
      runtime: {
        "desktop-1": {
          ...online,
          agentStatuses: { windows: [current], wsl: [], updatedAt: thread.updatedAt },
        },
        "desktop-2": {
          ...online,
          agentStatuses: { windows: [alternative], wsl: [], updatedAt: thread.updatedAt },
        },
      },
    });
    const pairedThread = {
      ...thread,
      id: "remote:desktop-1:thread:thread-1",
      remoteServerId: "desktop-1",
    };
    const { getByRole, queryByRole } = render(
      <CompactThreadHeader thread={pairedThread} project={project} />,
    );
    fireEvent.click(getByRole("button", { name: "Thread actions" }));
    const handoff = { name: "Continue in another provider" };
    expect(queryByRole("button", handoff)).not.toBeInTheDocument();

    await act(async () => {
      useRemoteServersStore.setState((state) => ({
        servers: state.servers.map((server) =>
          server.desktopId === owner.desktopId ? { ...server, scopes: ["session:read"] } : server,
        ),
        runtime: {
          ...state.runtime,
          "desktop-1": {
            ...online,
            agentStatuses: {
              windows: [current, alternative],
              wsl: [],
              updatedAt: thread.updatedAt,
            },
          },
        },
      }));
    });
    expect(queryByRole("button", handoff)).not.toBeInTheDocument();

    await act(async () => {
      useRemoteServersStore.setState((state) => ({
        servers: state.servers.map((server) =>
          server.desktopId === owner.desktopId ? owner : server,
        ),
      }));
    });
    fireEvent.click(getByRole("button", handoff));
    expect(useContinueInProviderStore.getState().requestedThreadId).toBe(pairedThread.id);
    expect(queryByRole("dialog", { name: "Thread actions" })).not.toBeInTheDocument();
    useContinueInProviderStore.getState().clear(pairedThread.id);
  });
});
