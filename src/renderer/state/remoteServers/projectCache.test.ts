import { describe, expect, it } from "vitest";
import type { Project } from "@/shared/contracts";
import type { RemoteServersState } from "./types";
import {
  persistedRemoteServersState,
  removeCachedProjects,
  replaceCachedProjects,
} from "./projectCache";

const project: Project = {
  id: "p1",
  name: "Remote App",
  location: { kind: "posix", path: "/srv/app", remoteServerId: "desktop-1" },
  remoteServerId: "desktop-1",
  remoteId: "remote-p1",
  workspaceId: "workspace-1",
  scripts: { setupScript: "pnpm install", actions: [] },
  mcpServers: [
    {
      id: "memory-id",
      name: "memory",
      description: "Memory tools",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "node", args: ["server.js"], env: {} },
    },
  ],
  disabled: true,
  createdAt: "2026-08-02T00:00:00.000Z",
};

describe("remote project cache", () => {
  it("persists only the fields needed to retain offline sidebar rows", () => {
    const cached = replaceCachedProjects({}, "desktop-1", [project]);

    expect(cached["desktop-1"]).toEqual([
      {
        id: "p1",
        name: "Remote App",
        location: { kind: "posix", path: "/srv/app", remoteServerId: "desktop-1" },
        disabled: true,
        createdAt: "2026-08-02T00:00:00.000Z",
      },
    ]);
    expect(replaceCachedProjects(cached, "desktop-1", [project])).toBe(cached);
  });

  it("removes one host without rewriting an unchanged cache", () => {
    const cached = { "desktop-1": [project] };
    expect(removeCachedProjects(cached, "missing")).toBe(cached);
    expect(removeCachedProjects(cached, "desktop-1")).toEqual({});
  });

  it("excludes live connection machinery from persisted store state", () => {
    const persisted = persistedRemoteServersState({
      servers: [],
      excludedProjectIds: {},
      projectWorkspaceIds: {},
      projectNameOverrides: {},
      lastKnownProjects: { "desktop-1": [project] },
      runtime: { "desktop-1": { status: "online", projects: [project], threads: [] } },
      openThread: null,
    } as unknown as RemoteServersState);

    expect(persisted).toEqual({
      servers: [],
      excludedProjectIds: {},
      projectWorkspaceIds: {},
      projectNameOverrides: {},
      lastKnownProjects: { "desktop-1": [project] },
    });
    expect(persisted).not.toHaveProperty("runtime");
    expect(persisted).not.toHaveProperty("openThread");
  });
});
