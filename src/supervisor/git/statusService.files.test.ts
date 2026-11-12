import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { WslBridgeClient } from "../wsl/bridge/client";
import { execGit } from "./exec";
import { GitStatusService } from "./statusService";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

vi.mock("./exec", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./exec")>()),
  execGit: vi.fn<typeof execGit>(async () => ""),
}));

describe("Git working-file boundaries", () => {
  let directory: string;
  let location: ProjectLocation;
  let service: GitStatusService;
  beforeEach(() => {
    vi.clearAllMocks();
    directory = mkdtempSync(join(tmpdir(), "poracode-git-files-"));
    const root = join(directory, "repo");
    mkdirSync(root);
    mkdirSync(join(directory, "private"));
    writeFileSync(join(directory, "private", "synthetic.txt"), "private fixture");
    writeFileSync(join(root, "inside.txt"), "inside fixture");
    location =
      process.platform === "win32"
        ? { kind: "windows", path: root }
        : { kind: "posix", path: root };
    service = new GitStatusService();
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("rejects traversal before Git or filesystem reads", async () => {
    await expect(
      service.getFileContent(location, "../private/synthetic.txt", false),
    ).rejects.toThrow("Path traversal");
    await expect(service.getDiff(location, "../private/synthetic.txt", false)).rejects.toThrow(
      "Path traversal",
    );
    expect(execGit).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === "win32")(
    "does not read through an out-of-root link or invoke the no-index fallback",
    async () => {
      symlinkSync(
        join(directory, "private"),
        join(location.kind === "wsl" ? "" : location.path, "escape"),
      );
      expect(
        (await service.getFileContent(location, "escape/synthetic.txt", false)).newContent,
      ).toBe("");
      expect((await service.getDiff(location, "escape/synthetic.txt", false)).diff).toBe("");
      expect(vi.mocked(execGit).mock.calls.some((call) => call[1].includes("--no-index"))).toBe(
        false,
      );
      expect((await service.getFileContent(location, "inside.txt", false)).newContent).toBe(
        "inside fixture",
      );
    },
  );

  it("retains index-only content when the working file was deleted", async () => {
    vi.mocked(execGit).mockResolvedValueOnce("old index").mockResolvedValueOnce("new index");
    expect(await service.getFileContent(location, "deleted.txt", true)).toEqual({
      oldContent: "old index",
      newContent: "new index",
    });
  });

  it("uses the deployed WSL file boundary and followed stat before fallback", async () => {
    const wsl: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
    };
    const readFile = vi.fn<WslBridgeClient["readFile"]>(async () => {
      throw new Error("ESCAPE");
    });
    const stat = vi.fn<WslBridgeClient["stat"]>(async () => ({
      stats: [{ path: "/repo/escape/synthetic.txt", exists: false, code: "ESCAPE" }],
    }));
    service.setWslClient({ readFile, stat } as unknown as WslBridgeClient);
    expect((await service.getFileContent(wsl, "escape/synthetic.txt", false)).newContent).toBe("");
    expect(readFile).toHaveBeenCalledWith(wsl, "/repo/escape/synthetic.txt");
    expect((await service.getDiff(wsl, "escape/synthetic.txt", false)).diff).toBe("");
    expect(stat).toHaveBeenCalledWith(wsl, ["/repo/escape/synthetic.txt"], { follow: true });
    expect(vi.mocked(execGit).mock.calls.some((call) => call[1].includes("--no-index"))).toBe(
      false,
    );
  });

  it("starts a fresh coalesced status read after mutation invalidation", async () => {
    const oldStatus = deferred<string>();
    const freshStatus = deferred<string>();
    let revParseCalls = 0;
    vi.mocked(execGit).mockImplementation(async (_location, args) => {
      if (args[0] !== "rev-parse") return "";
      revParseCalls += 1;
      return revParseCalls === 1 ? oldStatus.promise : freshStatus.promise;
    });

    const oldRequest = service.getStatus(location);
    expect(revParseCalls).toBe(1);

    service.invalidateStatus(location);
    const freshRequest = service.getStatus(location);
    const coalescedFreshRequest = service.getStatus(location);
    expect(revParseCalls).toBe(2);

    oldStatus.resolve("true");
    await oldRequest;

    const anotherCoalescedRequest = service.getStatus(location);
    expect(revParseCalls).toBe(2);
    freshStatus.resolve("true");
    await Promise.all([freshRequest, coalescedFreshRequest, anotherCoalescedRequest]);
  });
});
