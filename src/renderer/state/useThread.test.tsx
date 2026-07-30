import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./appStore";
import { useProjectWithoutDraftConfig } from "./useThread";

describe("useProjectWithoutDraftConfig", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ projects: [] });
  });

  it("preserves remote routing metadata while omitting draft config", () => {
    useAppStore.setState({
      projects: [
        {
          id: "remote:server-1:project:project-1",
          remoteServerId: "server-1",
          remoteId: "project-1",
          name: "Remote project",
          location: { kind: "posix", path: "/repo", remoteServerId: "server-1" },
          lastDraftConfig: {
            agentKind: "claude",
            model: "sonnet",
            effort: "high",
            mode: "agent",
            approvalPolicy: "auto",
            worktreeMode: false,
          },
          createdAt: "2026-07-28T00:00:00.000Z",
        },
      ],
    });

    const { result } = renderHook(() =>
      useProjectWithoutDraftConfig("remote:server-1:project:project-1"),
    );

    expect(result.current).toMatchObject({
      remoteServerId: "server-1",
      remoteId: "project-1",
    });
    expect(result.current).not.toHaveProperty("lastDraftConfig");
  });
});
