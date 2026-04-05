import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock child_process.execFile (used by execGit internally)
const mockExecFile = vi.fn();
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: mockExecFile,
  };
});

// Must import after mock
const { FileIndexService } = await import("./fileIndex");

/** Helper to set up execFile mock responses based on git command args. */
function mockGit(handler: (args: string[]) => string | Error) {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      args: string[],
      _opts: unknown,
      callback: (error: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      const result = handler(args);
      if (result instanceof Error) {
        callback(result, { stdout: "", stderr: result.message });
      } else {
        callback(null, { stdout: result, stderr: "" });
      }
    },
  );
}

describe("FileIndexService", () => {
  let service: InstanceType<typeof FileIndexService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FileIndexService();
  });

  const location = { kind: "windows" as const, path: "C:\\repo" };

  describe("buildIndex", () => {
    it("parses git ls-files output into file and directory entries", async () => {
      mockGit(() => "src/main.ts\nsrc/utils/helper.ts\nREADME.md\n");

      const result = await service.searchProjectFiles({
        projectLocation: location,
        query: "",
        limit: 50,
      });

      const paths = result.entries.map((e) => `${e.type}:${e.path}`);
      expect(paths).toContain("file:README.md");
      expect(paths).toContain("file:src/main.ts");
      expect(paths).toContain("file:src/utils/helper.ts");
      expect(paths).toContain("directory:src");
      expect(paths).toContain("directory:src/utils");
    });

    it("normalizes backslashes from Windows git output", async () => {
      mockGit(() => "src\\main.ts\nsrc\\utils\\helper.ts\n");

      const result = await service.searchProjectFiles({
        projectLocation: location,
        query: "",
        limit: 50,
      });

      const filePaths = result.entries.filter((e) => e.type === "file").map((e) => e.path);
      expect(filePaths).toContain("src/main.ts");
      expect(filePaths).toContain("src/utils/helper.ts");
      for (const p of filePaths) {
        expect(p).not.toContain("\\");
      }
    });

    it("returns empty array for non-git repos", async () => {
      mockGit(() => new Error("not a git repo"));

      const result = await service.searchProjectFiles({
        projectLocation: location,
        query: "",
        limit: 50,
      });

      expect(result.entries).toEqual([]);
      expect(result.totalIndexed).toBe(0);
    });

    it("extracts name from path correctly", async () => {
      mockGit(() => "src/components/Button.tsx\n");

      const result = await service.searchProjectFiles({
        projectLocation: location,
        query: "",
        limit: 50,
      });

      const file = result.entries.find((e) => e.path === "src/components/Button.tsx");
      expect(file?.name).toBe("Button.tsx");

      const dir = result.entries.find((e) => e.path === "src/components");
      expect(dir?.name).toBe("components");
    });

    it("caps entries at 25000", async () => {
      const lines = Array.from({ length: 30000 }, (_, i) => `file${i}.ts`).join("\n");
      mockGit(() => lines);

      const result = await service.searchProjectFiles({
        projectLocation: location,
        query: "",
        limit: 50,
      });

      expect(result.totalIndexed).toBe(25000);
    });
  });

  describe("search ranking", () => {
    beforeEach(() => {
      mockGit(() =>
        [
          "src/main.ts",
          "src/maintenance/index.ts",
          "src/utils/main-helper.ts",
          "docs/main-guide.md",
          "main.ts",
        ].join("\n"),
      );
    });

    it("ranks filename-starts-with above filename-contains above path-contains", async () => {
      const result = await service.searchProjectFiles({
        projectLocation: location,
        query: "main",
        limit: 10,
      });

      const names = result.entries.map((e) => e.name);
      const mainTsIdx = names.indexOf("main.ts");
      const helperIdx = names.indexOf("main-helper.ts");
      expect(mainTsIdx).toBeLessThan(helperIdx);
    });

    it("returns empty results for non-matching query", async () => {
      const result = await service.searchProjectFiles({
        projectLocation: location,
        query: "zzzznotfound",
        limit: 10,
      });

      expect(result.entries).toEqual([]);
    });

    it("respects limit parameter", async () => {
      const result = await service.searchProjectFiles({
        projectLocation: location,
        query: "main",
        limit: 2,
      });

      expect(result.entries.length).toBeLessThanOrEqual(2);
    });

    it("ranks files before directories at same score", async () => {
      const result = await service.searchProjectFiles({
        projectLocation: location,
        query: "main",
        limit: 20,
      });

      const firstDirIdx = result.entries.findIndex((e) => e.type === "directory");
      const filesBefore = firstDirIdx >= 0 ? result.entries.slice(0, firstDirIdx) : result.entries;
      expect(filesBefore.every((e) => e.type === "file")).toBe(true);
    });
  });

  describe("caching", () => {
    it("serves from cache on second call within TTL", async () => {
      mockGit(() => "file.ts\n");

      await service.searchProjectFiles({ projectLocation: location, query: "", limit: 10 });
      await service.searchProjectFiles({ projectLocation: location, query: "", limit: 10 });

      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it("rebuilds after cache TTL expires", async () => {
      mockGit(() => "file.ts\n");

      await service.searchProjectFiles({ projectLocation: location, query: "", limit: 10 });

      vi.useFakeTimers();
      vi.advanceTimersByTime(16_000);

      await service.searchProjectFiles({ projectLocation: location, query: "", limit: 10 });
      vi.useRealTimers();

      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });
  });
});
