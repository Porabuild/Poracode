import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./appStore";
import { useInitialProjectDraftConfig, useProjectWithoutDraftConfig } from "./useThread";

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

  it("keeps the initial draft config until the project changes and retries missing projects", () => {
    const config = {
      agentKind: "claude",
      model: "sonnet",
      effort: "high",
      mode: "agent",
      approvalPolicy: "auto",
      worktreeMode: false,
    } as const;
    const project = {
      id: "project-1",
      name: "Project",
      location: { kind: "posix", path: "/repo" } as const,
      createdAt: "2026-07-28T00:00:00.000Z",
      lastDraftConfig: config,
    };
    useAppStore.setState({ projects: [project] });
    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string | undefined }) => useInitialProjectDraftConfig(projectId),
      { initialProps: { projectId: "project-1" as string | undefined } },
    );
    expect(result.current).toBe(config);
    useAppStore.setState({
      projects: [{ ...project, lastDraftConfig: { ...config, model: "opus" } }],
    });
    rerender({ projectId: "project-1" });
    expect(result.current).toBe(config);

    rerender({ projectId: "project-2" });
    expect(result.current).toBeUndefined();
    useAppStore.setState({ projects: [{ ...project, id: "project-2" }] });
    rerender({ projectId: "project-2" });
    expect(result.current).toBe(config);
    rerender({ projectId: undefined });
    expect(result.current).toBeUndefined();
  });
});
