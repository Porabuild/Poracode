import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { useResidentProjectMcpServers } from "./useResidentProjectMcpServers";

const mocks = vi.hoisted(() => ({
  ensureLoaded: vi.fn<(projectId: string) => Promise<void>>(async () => undefined),
  isLoaded: vi.fn<(project: Project) => boolean>(() => false),
}));

vi.mock("@/renderer/state/projectSettings/projectSettingsLoader", () => ({
  ensureProjectMcpServersLoaded: mocks.ensureLoaded,
  isProjectMcpServersLoaded: mocks.isLoaded,
}));

const project = {
  id: "p1",
  name: "Project",
  location: { kind: "posix", path: "/work/project" },
} as Project;

describe("useResidentProjectMcpServers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads a catalog row's private MCP settings so project servers can be listed", () => {
    renderHook(() => useResidentProjectMcpServers(project));
    expect(mocks.ensureLoaded).toHaveBeenCalledExactlyOnceWith("p1");
  });

  it("does not re-read settings that are already resident", () => {
    mocks.isLoaded.mockReturnValueOnce(true);
    renderHook(() => useResidentProjectMcpServers(project));
    expect(mocks.ensureLoaded).not.toHaveBeenCalled();
  });

  it("swallows a failed read so the surface keeps its Global list", async () => {
    mocks.ensureLoaded.mockRejectedValueOnce(new Error("offline"));
    renderHook(() => useResidentProjectMcpServers(project));
    await Promise.resolve();
    expect(mocks.ensureLoaded).toHaveBeenCalledOnce();
  });

  it("skips a missing project", () => {
    renderHook(() => useResidentProjectMcpServers(undefined));
    expect(mocks.ensureLoaded).not.toHaveBeenCalled();
  });
});
