import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchProjectTreePayloadSchema, type ProjectLocation } from "@/shared/contracts";
import type { WslBridgeClient } from "./wsl/bridge/client";

const execGitMock = vi.hoisted(() => vi.fn<() => Promise<string>>());

vi.mock("./git", async () => {
  const actual = await vi.importActual<typeof import("./git")>("./git");
  return {
    ...actual,
    execGit: execGitMock,
  };
});

import { ProjectSearchIndex } from "./ProjectSearchIndex";

const location: Extract<ProjectLocation, { kind: "wsl" }> = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/user/project",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\user\\project",
};

describe("ProjectSearchIndex caching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses separate cache entries when useIgnoreFiles changes", async () => {
    execGitMock.mockResolvedValue("src/tracked.ts\n");
    const find = vi.fn<WslBridgeClient["find"]>().mockResolvedValue({
      entries: [{ path: "ignored/generated.ts", name: "generated.ts", type: "file" }],
      truncated: false,
    });
    const index = new ProjectSearchIndex(() => "");
    index.setWslClient({ find } as unknown as WslBridgeClient);
    const excludePatterns = ["**/.git"];

    const respectingIgnoreFiles = await index.searchProjectTree({
      projectLocation: location,
      query: "tracked",
      limit: 10,
      searchConfig: { useIgnoreFiles: true, excludePatterns },
    });
    const includingIgnoredFiles = await index.searchProjectTree({
      projectLocation: location,
      query: "generated",
      limit: 10,
      searchConfig: { useIgnoreFiles: false, excludePatterns },
    });

    expect(respectingIgnoreFiles.entries.map((entry) => entry.path)).toEqual(["src/tracked.ts"]);
    expect(includingIgnoredFiles.entries.map((entry) => entry.path)).toEqual([
      "ignored/generated.ts",
    ]);
    expect(execGitMock).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledOnce();
  });

  it("uses separate cache entries for comma-separated and distinct exclude patterns", async () => {
    const find = vi.fn<WslBridgeClient["find"]>().mockResolvedValue({
      entries: [{ path: "src/keep.ts", name: "keep.ts", type: "file" }],
      truncated: false,
    });
    const index = new ProjectSearchIndex(() => "");
    index.setWslClient({ find } as unknown as WslBridgeClient);

    await index.searchProjectTree({
      projectLocation: location,
      query: "keep",
      limit: 10,
      searchConfig: { useIgnoreFiles: false, excludePatterns: ["a,b"] },
    });
    await index.searchProjectTree({
      projectLocation: location,
      query: "keep",
      limit: 10,
      searchConfig: { useIgnoreFiles: false, excludePatterns: ["a", "b"] },
    });

    expect(find).toHaveBeenCalledTimes(2);
  });

  it("filters entry types before applying the result limit", async () => {
    execGitMock.mockResolvedValue("src/match.ts\n");
    const index = new ProjectSearchIndex(() => "");

    const result = await index.searchProjectTree({
      projectLocation: location,
      query: "src",
      limit: 1,
      entryType: "file",
      searchConfig: { useIgnoreFiles: true, excludePatterns: [] },
    });

    expect(result.entries.map((entry) => entry.path)).toEqual(["src/match.ts"]);
  });

  it("keeps the pre-upgrade payload valid and returns both files and directories", async () => {
    execGitMock.mockResolvedValue("src/match.ts\n");
    const payload = searchProjectTreePayloadSchema.parse({
      projectLocation: location,
      query: "src",
      limit: 10,
    });
    expect(payload.entryType).toBeUndefined();
    const index = new ProjectSearchIndex(() => "");
    expect((await index.searchProjectTree(payload)).entries.map((entry) => entry.type)).toEqual([
      "directory",
      "file",
    ]);
  });

  it("ranks literal names ahead of abbreviations and matches accented file names", async () => {
    execGitMock.mockResolvedValue("src/CommandPalette.tsx\nsrc/cmdplt.ts\nsrc/Café.ts\n");
    const index = new ProjectSearchIndex(() => "");
    const search = (query: string) =>
      index.searchProjectTree({ projectLocation: location, query, limit: 10, entryType: "file" });
    expect((await search("cmdplt")).entries.map((entry) => entry.name)).toEqual([
      "cmdplt.ts",
      "CommandPalette.tsx",
    ]);
    expect((await search("cafe")).entries.map((entry) => entry.name)).toEqual(["Café.ts"]);
  });

  it("matches reordered terms across an entry name and path", async () => {
    execGitMock.mockResolvedValue(
      "src/components/search/CommandPalette.tsx\nsrc/components/search/Other.tsx\n",
    );
    const index = new ProjectSearchIndex(() => "");

    const result = await index.searchProjectTree({
      projectLocation: location,
      query: "palette components",
      limit: 10,
      entryType: "file",
      searchConfig: { useIgnoreFiles: true, excludePatterns: [] },
    });

    expect(result.entries.map((entry) => entry.path)).toEqual([
      "src/components/search/CommandPalette.tsx",
    ]);
  });
});
