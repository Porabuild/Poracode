import { describe, expect, it } from "vitest";
import type { McpServer, Project } from "./contracts";
import { dedupeProjects } from "./projectIdentity";

const original: Project = {
  id: "original",
  name: "Configured project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2024-01-01T00:00:00.000Z",
};
const readded: Project = {
  ...original,
  id: "readded",
  name: "repo",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const action = (id: string, command: string) => ({ id, name: id, command });
const server = (name: string, enabled = true): McpServer => ({
  id: name,
  name,
  description: "",
  enabled,
  timeoutMs: 30000,
  transport: { type: "stdio", command: "node", args: [`${name}.js`], env: {} },
});

describe("duplicate project settings", () => {
  it("keeps independently renamed MCP entries separately editable when their old IDs collide", () => {
    const first = { ...original, mcpServers: [server("memory")] };
    const newer = { ...readded, mcpServers: [{ ...server("renamed-memory"), id: "memory" }] };
    const result = dedupeProjects([newer, first]);
    const servers = result.projects[0]!.mcpServers!;
    expect(servers.map((entry) => entry.name)).toEqual(["memory", "renamed-memory"]);
    expect(new Set(servers.map((entry) => entry.id)).size).toBe(2);
    expect(dedupeProjects([...result.projects, newer]).projects).toEqual(result.projects);
  });
  it.each([false, true])(
    "keeps original choices and recovers distinct settings (reversed=%s)",
    (reversed) => {
      const configured: Project = {
        ...original,
        icon: "lucide:rocket",
        workspaceId: "original-workspace",
        disabled: false,
        scripts: {
          setupScript: "custom setup",
          actions: [action("test", "custom test")],
          worktreeCopyPatterns: [".env"],
        },
        searchSettings: { useIgnoreFiles: false, exclude: { dist: false } },
        mcpServers: [server("memory", false)],
        ghAccount: { host: "github.com", login: "original-account" },
        lastDraftConfig: { agentKind: "agent-a", model: "chosen-model", fast: false },
        worktreeLocation: { mode: "project-relative" },
      };
      const newer: Project = {
        ...readded,
        icon: "auto",
        workspaceId: "other-workspace",
        disabled: true,
        scripts: {
          setupScript: "auto-detected setup",
          cleanupScript: "custom cleanup",
          actions: [action("test", "different test"), action("lint", "run lint")],
          worktreeCopyPatterns: [".env", ".secrets"],
        },
        searchSettings: { useIgnoreFiles: true, exclude: { dist: true, cache: true } },
        mcpServers: [server("MEMORY"), server("docs")],
        ghAccount: { host: "example.com", login: "another-account" },
        lastDraftConfig: { agentKind: "agent-b", model: "other-model", thinking: true },
        worktreeLocation: { mode: "global", basePath: "/other-worktrees" },
      };
      const snapshot = structuredClone([configured, newer]);
      const result = dedupeProjects(reversed ? [newer, configured] : [configured, newer]);
      const expected = {
        ...configured,
        scripts: {
          ...configured.scripts,
          cleanupScript: "custom cleanup",
          actions: [action("test", "custom test"), action("lint", "run lint")],
          worktreeCopyPatterns: [".env", ".secrets"],
        },
        searchSettings: { useIgnoreFiles: false, exclude: { dist: false, cache: true } },
        mcpServers: [server("memory", false), server("docs")],
      };
      expect(result.projects).toEqual([expected]);
      expect(result.duplicateIds).toEqual(new Map([[readded.id, original.id]]));
      expect([configured, newer]).toEqual(snapshot);
      expect(dedupeProjects([...result.projects, newer]).projects).toEqual(result.projects);
    },
  );

  it("fills empty settings from the next-oldest configured copy across three duplicates", () => {
    const empty: Project = {
      ...original,
      scripts: { setupScript: "", actions: [] },
      mcpServers: [],
      searchSettings: {},
      worktreeLocation: {},
    };
    const middle: Project = {
      ...readded,
      id: "middle",
      createdAt: "2025-01-01T00:00:00.000Z",
      icon: "lucide:folder",
      workspaceId: "workspace",
      scripts: { setupScript: "middle setup", actions: [action("test", "test")] },
      searchSettings: { useIgnoreFiles: false, exclude: { cache: false } },
      mcpServers: [server("memory", false)],
      worktreeLocation: { mode: "global", basePath: "/worktrees" },
      lastDraftConfig: { agentKind: "agent-a", model: "model" },
      ghAccount: { host: "github.com", login: "account" },
    };
    const newest = { ...readded, scripts: { setupScript: "newest setup", actions: [] } };
    const result = dedupeProjects([newest, middle, empty]);
    expect(result.projects).toEqual([
      { ...middle, id: original.id, name: original.name, createdAt: original.createdAt },
    ]);
    expect([...result.duplicateIds.values()]).toEqual([original.id, original.id]);
  });

  it("keeps group display order while selecting the oldest ID by actual timestamp", () => {
    const oldest = { ...original, createdAt: "2026-01-01T01:00:00+02:00" };
    const unrelated = {
      ...original,
      id: "unrelated",
      location: { kind: "posix" as const, path: "/another" },
    };
    const result = dedupeProjects([readded, unrelated, oldest]);
    expect(result.projects.map((project) => project.id)).toEqual([original.id, unrelated.id]);
  });

  it.each(["2026-01-01", "legacy-unknown-date"])(
    "breaks timestamp ties deterministically (%s)",
    (createdAt) => {
      const a = { ...original, id: "a", createdAt };
      const b = { ...original, id: "b", createdAt };
      for (const projects of [
        [a, b],
        [b, a],
      ]) {
        expect(dedupeProjects(projects).duplicateIds).toEqual(new Map([[b.id, a.id]]));
      }
    },
  );
});
