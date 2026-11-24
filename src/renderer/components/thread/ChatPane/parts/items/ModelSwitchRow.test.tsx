import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Thread } from "@/shared/contracts";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ModelSwitchRow } from "./ModelSwitchRow";

vi.mock("@heroui/react", () => ({
  Surface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function status(kind: string, models: { id: string; label: string }[]): AgentStatus {
  return {
    kind,
    label: kind,
    installed: true,
    capabilities: { models },
  } as unknown as AgentStatus;
}

function switchItem(fromModel: string, toModel: string): RuntimeChatItem {
  return {
    id: "switch-1",
    type: "model_switch",
    state: "completed",
    payload: { fromModel, toModel, at: "2026-08-29T00:00:00.000Z" },
    streams: {},
  } as RuntimeChatItem;
}

describe("ModelSwitchRow", () => {
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
          agentKind: "custom-a",
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
      agentStatuses: [
        status("custom-a", [
          { id: "model-a", label: "Local Model A" },
          { id: "model-b", label: "Local Model B" },
        ]),
      ],
      wslAgentStatuses: [],
    });
    useRemoteServersStore.setState({
      runtime: {
        d1: {
          status: "online",
          projects: [],
          threads: [],
          agentStatuses: {
            windows: [
              status("custom-a", [
                { id: "model-a", label: "Host Model A" },
                { id: "model-b", label: "Host Model B" },
              ]),
            ],
            wsl: [],
            updatedAt: "2026-08-29T00:00:00.000Z",
          },
        },
      },
    });
  });

  it("uses the remote host's model labels", () => {
    const { getByText } = render(
      <ModelSwitchRow threadId="remote:d1:thread:t1" item={switchItem("model-a", "model-b")} />,
    );

    expect(getByText("Switched model from Host Model A to Host Model B")).toBeInTheDocument();
  });

  it("falls back to raw model ids the catalog does not know", () => {
    const { getByText } = render(
      <ModelSwitchRow
        threadId="remote:d1:thread:t1"
        item={switchItem("custom/old", "custom/new")}
      />,
    );

    expect(getByText("Switched model from custom/old to custom/new")).toBeInTheDocument();
  });
});
