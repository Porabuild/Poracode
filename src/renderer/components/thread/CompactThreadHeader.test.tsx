import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { CompactThreadHeader } from "./CompactThreadHeader";

vi.mock("@/renderer/components/mobileComposer/MobileCircleButton", () => ({
  MobileCircleButton: (props: { children: ReactNode; "aria-label": string }) => (
    <button type="button" aria-label={props["aria-label"]}>
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
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
  });

  it("shows the project and hosting machine beneath the thread title", () => {
    const { getByText, queryByTestId } = render(
      <CompactThreadHeader thread={thread} project={project} agentStatus={undefined} />,
    );

    expect(getByText("Casual greeting")).toBeInTheDocument();
    const projectLine = getByText("Lightcode").parentElement;
    expect(projectLine).toHaveTextContent("LightcodeMacBook 16");
    expect(queryByTestId("thread-status")).not.toBeInTheDocument();
  });
});
