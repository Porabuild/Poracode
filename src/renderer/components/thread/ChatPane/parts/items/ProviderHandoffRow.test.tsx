import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Thread } from "@/shared/contracts";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ProviderHandoffRow } from "./ProviderHandoffRow";

vi.mock("@heroui/react", () => ({
  Surface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function status(kind: string, label: string): AgentStatus {
  return { kind, label, installed: true } as AgentStatus;
}

function handoffItem(fromAgentKind: string, toAgentKind: string): RuntimeChatItem {
  return {
    id: "handoff-1",
    type: "provider_handoff",
    state: "completed",
    payload: { fromAgentKind, toAgentKind, at: "2026-08-29T00:00:00.000Z" },
    streams: {},
  } as RuntimeChatItem;
}

describe("ProviderHandoffRow", () => {
  beforeEach(() => {
    useAppStore.setState({
      projects: [],
      threads: [
        {
          id: "remote:d1:thread:t1",
          projectId: "remote:d1:project:p1",
          remoteServerId: "d1",
          remoteId: "t1",
          title: "Remote thread",
          agentKind: "custom-b",
          config: { model: "model-b" },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-08-29T00:00:00.000Z",
          updatedAt: "2026-08-29T00:00:00.000Z",
        } satisfies Thread,
      ],
    });
    useAgentStatusesStore.setState({
      agentStatuses: [status("custom-a", "Local Alpha"), status("custom-b", "Local Beta")],
      wslAgentStatuses: [status("custom-wsl", "Local WSL")],
    });
    useRemoteServersStore.setState({
      runtime: {
        d1: {
          status: "online",
          projects: [],
          threads: [],
          agentStatuses: {
            windows: [status("custom-a", "Host Alpha")],
            wsl: [status("custom-b", "Host Beta")],
            updatedAt: "2026-08-29T00:00:00.000Z",
          },
        },
      },
    });
  });

  it("uses the remote host provider labels", () => {
    const { getByText } = render(
      <ProviderHandoffRow
        threadId="remote:d1:thread:t1"
        item={handoffItem("custom-a", "custom-b")}
      />,
    );

    expect(getByText("Switched from Host Alpha to Host Beta")).toBeInTheDocument();
  });

  it("uses the desktop's own labels, across both environments, for a local thread", () => {
    useAppStore.setState({
      threads: [
        {
          ...useAppStore.getState().threads[0]!,
          id: "t-local",
          remoteServerId: undefined,
          remoteId: undefined,
        },
      ],
    });
    const { getByText } = render(
      <ProviderHandoffRow threadId="t-local" item={handoffItem("custom-a", "custom-wsl")} />,
    );

    expect(getByText("Switched from Local Alpha to Local WSL")).toBeInTheDocument();
  });
});
