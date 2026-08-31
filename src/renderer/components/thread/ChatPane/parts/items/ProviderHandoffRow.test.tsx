import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ProviderHandoffRow } from "./ProviderHandoffRow";

const { useThreadAgentStatusesMock } = vi.hoisted(() => ({
  useThreadAgentStatusesMock: vi.fn<(input: unknown) => unknown[]>(),
}));

vi.mock("@heroui/react", () => ({
  Surface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useThreadAgentStatuses: (input: unknown) => useThreadAgentStatusesMock(input),
}));

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
    useThreadAgentStatusesMock.mockReturnValue([
      { kind: "custom-a", label: "Host Alpha" },
      { kind: "custom-b", label: "Host Beta" },
    ]);
  });

  it("uses the remote host provider labels", () => {
    const item = {
      id: "handoff-1",
      type: "provider_handoff",
      state: "completed",
      payload: {
        fromAgentKind: "custom-a",
        toAgentKind: "custom-b",
        at: "2026-08-29T00:00:00.000Z",
      },
      streams: {},
    } as RuntimeChatItem;

    const { getByText } = render(<ProviderHandoffRow threadId="remote:d1:thread:t1" item={item} />);

    expect(getByText("Switched from Host Alpha to Host Beta")).toBeInTheDocument();
  });
});
