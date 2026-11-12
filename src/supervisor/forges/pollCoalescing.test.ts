import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

type ExecGitFn = typeof import("../git/exec").execGit;
type ExecFileAsyncFn = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

const execGitMock = vi.hoisted(() => vi.fn<ExecGitFn>());
const execFileAsyncMock = vi.hoisted(() => vi.fn<ExecFileAsyncFn>());

vi.mock("../git/exec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../git/exec")>();
  return {
    ...actual,
    execGit: execGitMock,
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: (
      file: string,
      args: readonly string[],
      optionsOrCb: unknown,
      maybeCb?: (err: Error | null, res: { stdout: string; stderr: string }) => void,
    ) => {
      const cb = typeof optionsOrCb === "function" ? (optionsOrCb as typeof maybeCb) : maybeCb;
      execFileAsyncMock(file, args)
        .then((res: { stdout: string; stderr: string }) => cb?.(null, res))
        .catch((err: Error) => cb?.(err, { stdout: "", stderr: "" }));
      return {} as ReturnType<typeof actual.execFile>;
    },
  };
});

import { ForgeConnections } from "./connection";
import { ForgeRuntime } from "./runtime";
import { GitHubService } from "../github";
import { GitStatusService } from "../git/statusService";

const location: ProjectLocation = { kind: "posix", path: "/repo/app" };

describe("forge and git poller coalescing", () => {
  beforeEach(() => {
    execGitMock.mockReset();
    execFileAsyncMock.mockReset();
  });

  it("coalesces concurrent ForgeConnections.resolve bursts, caches within TTL, and isolates source mutations", async () => {
    let gitRemoteCalls = 0;
    const runtime = new ForgeRuntime(() => undefined);
    vi.spyOn(runtime, "run").mockImplementation(async (_loc, cmd, args) => {
      if (cmd === "git" && args[0] === "remote" && args[1] === "-v") {
        gitRemoteCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return "origin\thttps://github.com/acme/widget.git (fetch)\n";
      }
      if (cmd === "git" && args[0] === "remote" && args[1] === "get-url") {
        return "https://github.com/acme/widget.git\n";
      }
      if (cmd === "git" && args[0] === "rev-parse") {
        return "origin/main\n";
      }
      throw new Error(`unexpected cli: ${cmd} ${args.join(" ")}`);
    });
    vi.spyOn(runtime, "environment").mockResolvedValue({});
    vi.spyOn(runtime, "read").mockResolvedValue(null);

    const connections = new ForgeConnections(runtime, { ttlMs: 5_000 });
    const [first, second, third] = await Promise.all([
      connections.resolve(location),
      connections.resolve(location),
      connections.resolve(location),
    ]);

    expect(gitRemoteCalls).toBe(1);
    expect(first?.source.repository).toBe("acme/widget");
    expect(second?.source.repository).toBe("acme/widget");
    expect(third?.source.repository).toBe("acme/widget");

    // Mutating one caller's source must not contaminate subsequent cached reads.
    first!.source.capabilities.autoFix = false;
    first!.source.repository = "mutated/repo";
    const fourth = await connections.resolve(location);
    expect(gitRemoteCalls).toBe(1);
    expect(fourth?.source.repository).toBe("acme/widget");
    expect(fourth?.source.capabilities.autoFix).toBe(true);
  });

  it("does not cache ForgeConnections.resolve rejections", async () => {
    let attempts = 0;
    const runtime = new ForgeRuntime(() => undefined);
    vi.spyOn(runtime, "run").mockImplementation(async (_loc, cmd, args) => {
      if (cmd === "git" && args[0] === "remote" && args[1] === "-v") {
        attempts += 1;
        if (attempts === 1) {
          return [
            "first\thttps://github.com/acme/one.git (fetch)",
            "second\thttps://github.com/acme/two.git (fetch)",
          ].join("\n");
        }
        return "origin\thttps://github.com/acme/one.git (fetch)\n";
      }
      throw new Error("no upstream");
    });
    vi.spyOn(runtime, "environment").mockResolvedValue({});
    vi.spyOn(runtime, "read").mockResolvedValue(null);

    const connections = new ForgeConnections(runtime, { ttlMs: 5_000 });
    await expect(connections.resolve(location)).rejects.toThrow(/ambiguous|remote/i);
    const recovered = await connections.resolve(location);
    expect(recovered?.source.repository).toBe("acme/one");
    expect(attempts).toBe(2);
  });

  it("coalesces concurrent GitHubService.forReviewRepository calls and avoids caching errors", async () => {
    let ghCalls = 0;
    let failNext = true;
    execFileAsyncMock.mockImplementation(async (_file: string, args: readonly string[]) => {
      ghCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (failNext) {
        throw new Error("transient gh failure");
      }
      if (args[0] === "repo" && args[1] === "view") {
        return {
          stdout: JSON.stringify({
            nameWithOwner: "acme/widget",
            url: "https://github.com/acme/widget",
          }),
          stderr: "",
        };
      }
      if (args[0] === "auth" && args[1] === "token") {
        return { stdout: "gho_test_token\n", stderr: "" };
      }
      if (args[0] === "api" && args[1] === "user") {
        return { stdout: "octocat\n", stderr: "" };
      }
      throw new Error(`unexpected gh args: ${args.join(" ")}`);
    });

    const gh = new GitHubService();
    await expect(gh.forReviewRepository(location)).rejects.toThrow("transient gh failure");
    const failedCallCount = ghCalls;

    failNext = false;
    const [a, b, c] = await Promise.all([
      gh.forReviewRepository(location),
      gh.forReviewRepository(location),
      gh.forReviewRepository(location),
    ]);
    const afterBurstCount = ghCalls;
    // One resolved probe runs 3 gh commands (repo view, auth token, api user) shared across all 3 callers.
    expect(afterBurstCount - failedCallCount).toBe(3);
    expect(a.repository).toBe("acme/widget");
    expect(b.repository).toBe("acme/widget");
    expect(c.account).toEqual({ host: "github.com", login: "octocat" });

    // Immediate follow-up hits the short TTL cache with zero extra gh spawns.
    const d = await gh.forReviewRepository(location);
    expect(ghCalls).toBe(afterBurstCount);
    expect(d.repository).toBe("acme/widget");
  });

  it("coalesces concurrent GitStatusService.getStatus and getStatusSummary calls into single git batches", async () => {
    let statusCalls = 0;
    let summaryCalls = 0;
    execGitMock.mockImplementation(async (_loc: ProjectLocation, args: readonly string[]) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
        return "true\n";
      }
      if (args[0] === "status" && args[1] === "--porcelain=v2") {
        statusCalls += 1;
        return "# branch.oid abcdef\n# branch.head main\n1 .M N... 100644 100644 100644 abc def src/index.ts\n";
      }
      if (args[0] === "remote") {
        return "";
      }
      if (args[0] === "diff") {
        return "3\t1\tsrc/index.ts\n";
      }
      if (args[0] === "ls-files") {
        summaryCalls += 1;
        return "";
      }
      return "";
    });

    const service = new GitStatusService();
    const [s1, s2, s3] = await Promise.all([
      service.getStatus(location),
      service.getStatus(location),
      service.getStatus(location),
    ]);
    expect(statusCalls).toBe(1);
    expect(s1.unstaged).toHaveLength(1);
    s1.unstaged.length = 0;
    expect(s2.unstaged).toHaveLength(1);
    expect(s3.unstaged).toHaveLength(1);

    statusCalls = 0;
    const [m1, m2] = await Promise.all([
      service.getStatusSummary(location),
      service.getStatusSummary(location),
    ]);
    expect(statusCalls).toBe(1);
    expect(summaryCalls).toBe(1);
    expect(m1.unstaged).toHaveLength(1);
    m1.unstaged.length = 0;
    expect(m2.unstaged).toHaveLength(1);
  });
});
