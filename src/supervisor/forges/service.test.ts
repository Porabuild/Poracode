import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForgeRepository, GhGetPrDetailsResult, PrData } from "@/shared/contracts";
import { forgeMergePrAtHeadPayloadSchema } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { GitHubService } from "../github";
import { FORGE_CAPABILITIES } from "./connection";
import { ForgeApi, type ForgeHttp } from "./api";
import { ForgeRuntime } from "./runtime";
import { ForgeReviewService } from "./service";

const location = { kind: "windows" as const, path: "C:\\repo" };
const pr: PrData = {
  number: 7,
  title: "Review",
  state: "open",
  isDraft: false,
  baseBranch: "main",
  url: "https://github.com/team/app/pull/7",
  updatedAt: "now",
  headSha: "a".repeat(40),
};
const details: GhGetPrDetailsResult = {
  pr,
  details: {
    number: 7,
    title: pr.title,
    body: "",
    baseBranch: "main",
    headBranch: "feature",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    comments: [],
    reviews: [],
    checks: [],
    commits: [],
  },
};

function fixture(repository = "team/app") {
  const source: ForgeRepository = {
    forge: "github",
    host: "https://github.com",
    repository,
    remote: "origin",
    capabilities: structuredClone(FORGE_CAPABILITIES.github),
  };
  const github = new GitHubService();
  const resolve = vi.fn<() => Promise<{ source: ForgeRepository }>>(async () => ({ source }));
  const scoped = vi.spyOn(github, "forReviewRepository").mockResolvedValue({
    service: github,
    host: "https://github.com",
    repository: "team/app",
    account: { host: "github.com", login: "alice" },
  });
  const read = vi.spyOn(github, "getPrDetails").mockResolvedValue(details);
  const merge = vi.spyOn(github, "mergePr").mockResolvedValue(undefined);
  return {
    source,
    github,
    resolve,
    scoped,
    read,
    merge,
    service: new ForgeReviewService(github, { connections: { resolve } }),
  };
}

describe("shared source-host review dispatch", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["feature", "other"])(
    "honors explicit retry after an overlapping %s poll",
    async (branch) => {
      const f = fixture();
      const pending = Promise.withResolvers<never>();
      f.scoped.mockReturnValueOnce(pending.promise);
      vi.spyOn(f.github, "getPrForBranch").mockResolvedValue(pr);
      const background = f.service.pollPullRequests({ projectLocation: location, branch });
      const retry = f.service.pollPullRequests({
        projectLocation: location,
        branch: "feature",
        retry: true,
      });
      pending.reject(new Error("Bad credentials"));
      expect(await background).toMatchObject({ status: "blocked" });
      expect(await retry).toMatchObject({ status: "ready", prs: { feature: { number: 7 } } });
      expect(f.scoped).toHaveBeenCalledTimes(2);
    },
  );

  it("returns one host-scoped authentication problem across concurrent background readers, without a rejected IPC operation", async () => {
    const f = fixture();
    vi.spyOn(f.github, "checkGhAvailable").mockResolvedValue({ available: true });
    expect(await f.service.checkAvailable(location)).toEqual({ available: true });
    f.scoped.mockRejectedValue(
      new Error("To get started with GitHub CLI, please run: gh auth login"),
    );
    const captureIpcFailure = vi.fn<(error: unknown) => void>();
    const results = await Promise.all([
      f.service.pollPullRequests({ projectLocation: location, branch: "feature" }),
      f.service.pollPullRequests({ projectLocation: location, branch: "other" }),
      f.service.pollPullRequests({ projectLocation: location }),
    ]).catch(captureIpcFailure);
    expect(captureIpcFailure).not.toHaveBeenCalled();
    expect(f.scoped).toHaveBeenCalledTimes(1);
    expect(results).toEqual(
      Array(3).fill({
        status: "blocked",
        problem: expect.objectContaining({
          kind: "authentication",
          executionHost: expect.any(String),
        }),
      }),
    );
  });

  it.each(["Bad credentials (HTTP 401)", msg("forge.credentials")])(
    "keeps credential errors out of background rejection: %s",
    async (message) => {
      const f = fixture();
      f.scoped.mockRejectedValue(new Error(message));
      expect(await f.service.pollPullRequests({ projectLocation: location })).toMatchObject({
        status: "blocked",
        problem: { kind: "authentication" },
      });
      await expect(
        f.service.getPrForBranch({ projectLocation: location, branch: "feature" }),
      ).rejects.toThrow(message);
    },
  );

  it("backs off on the execution host, retries on demand, and clears the problem after recovery", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.scoped.mockRejectedValue(new Error("Bad credentials"));
    const input = { projectLocation: location, branch: "feature" };
    const first = await f.service.pollPullRequests(input);
    expect(first).toMatchObject({
      status: "blocked",
      problem: { retryAt: new Date(Date.now() + 30_000).toISOString() },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    const second = await f.service.pollPullRequests(input);
    expect(second).toMatchObject({
      status: "blocked",
      problem: { retryAt: new Date(Date.now() + 60_000).toISOString() },
    });
    await f.service.pollPullRequests(input);
    expect(f.scoped).toHaveBeenCalledTimes(2);
    f.scoped.mockResolvedValue({
      service: f.github,
      host: "https://github.com",
      repository: "team/app",
    });
    const read = vi.spyOn(f.github, "getPrForBranch").mockResolvedValue(pr);
    expect(await f.service.pollPullRequests({ ...input, retry: true })).toMatchObject({
      status: "ready",
      prs: { feature: { number: 7 } },
    });
    read.mockResolvedValue(null);
    expect(await f.service.pollPullRequests(input)).toMatchObject({ status: "ready", prs: {} });
  });

  it("names the WSL execution runtime and isolates projects and unknown failures", async () => {
    const f = fixture();
    f.scoped.mockRejectedValue(new Error("Bad credentials"));
    const wsl = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
    };
    expect(await f.service.pollPullRequests({ projectLocation: wsl })).toMatchObject({
      status: "blocked",
      problem: { executionHost: expect.stringContaining("WSL Ubuntu") },
    });
    f.scoped.mockRejectedValue(new Error("a parser invariant failed"));
    await expect(f.service.pollPullRequests({ projectLocation: location })).rejects.toThrow(
      "a parser invariant failed",
    );
  });
  it("edits only a comment proven to belong to the selected review and account", async () => {
    const f = fixture();
    f.read.mockResolvedValue({
      ...details,
      details: {
        ...details.details,
        comments: [{ id: "IC_1", author: { login: "alice" }, body: "Original", createdAt: "now" }],
      },
    });
    const edit = vi.spyOn(f.github, "editPrComment").mockResolvedValue(undefined);
    const input = {
      projectLocation: location,
      prNumber: 7,
      commentId: "IC_1",
      expectedBody: "Original",
      body: "Updated",
      forgeAccount: { forge: "github" as const, host: "https://github.com", login: "alice" },
      forgeRepository: "team/app",
    };
    await f.service.editPrComment(input);
    expect(edit).toHaveBeenCalledWith(location, "IC_1", "Updated", false);
    edit.mockClear();
    await expect(
      f.service.editPrComment({ ...input, commentId: "another-pr-comment" }),
    ).rejects.toThrow("Only your own comments");
    await expect(f.service.editPrComment({ ...input, expectedBody: "Stale" })).rejects.toThrow(
      "changed while you were editing",
    );
    f.read.mockResolvedValue({
      ...details,
      details: {
        ...details.details,
        comments: [{ id: "IC_1", author: { login: "bob" }, body: "Original", createdAt: "now" }],
      },
    });
    await expect(f.service.editPrComment(input)).rejects.toThrow("Only your own comments");
    expect(edit).not.toHaveBeenCalled();
  });

  it("binds inline edits to their actual review thread", async () => {
    const f = fixture();
    const comment = {
      id: "PRRC_1",
      author: { login: "alice" },
      body: "Original",
      createdAt: "now",
    };
    vi.spyOn(f.github, "getPrReviewThreads").mockResolvedValue({
      comments: [comment],
      threads: [
        {
          id: "thread-1",
          path: "a.ts",
          line: 2,
          isResolved: false,
          isOutdated: false,
          comments: [comment],
        },
      ],
    });
    const edit = vi.spyOn(f.github, "editPrComment").mockResolvedValue(undefined);
    const input = {
      projectLocation: location,
      prNumber: 7,
      threadId: "thread-1",
      commentId: "PRRC_1",
      expectedBody: "Original",
      body: "Updated",
      forgeAccount: { forge: "github" as const, host: "https://github.com", login: "alice" },
      forgeRepository: "team/app",
    };
    await f.service.editPrComment(input);
    expect(edit).toHaveBeenCalledWith(location, "PRRC_1", "Updated", true);
    edit.mockClear();
    await expect(f.service.editPrComment({ ...input, threadId: "another-thread" })).rejects.toThrow(
      "Only your own comments",
    );
    expect(edit).not.toHaveBeenCalled();
  });

  it("routes native viewed marks through the selected account and refuses a changed repository", async () => {
    const f = fixture();
    const account = { forge: "github" as const, host: "https://github.com", login: "alice" };
    const input = {
      projectLocation: location,
      prNumber: 7,
      forgeAccount: account,
      forgeRepository: "team/app",
    };
    const read = vi.spyOn(f.github, "getPrViewedFiles").mockResolvedValue({ "file.ts": "VIEWED" });
    const write = vi
      .spyOn(f.github, "setPrFileViewed")
      .mockResolvedValue({ "file.ts": "UNVIEWED" });
    expect(await f.service.getPrViewedFiles(input)).toEqual({
      storage: "forge",
      files: [{ path: "file.ts", fingerprint: "VIEWED" }],
    });
    expect(
      await f.service.setPrFileViewed({ ...input, path: "file.ts", fingerprint: null }),
    ).toEqual({ storage: "forge", files: [{ path: "file.ts", fingerprint: "UNVIEWED" }] });
    expect(f.scoped).toHaveBeenCalledWith(location, { host: "github.com", login: "alice" });
    expect(write).toHaveBeenCalledWith(location, 7, "file.ts", false);
    read.mockClear();
    write.mockClear();
    await expect(
      f.service.setPrFileViewed({
        ...input,
        forgeRepository: "other/app",
        path: "file.ts",
        fingerprint: "read",
      }),
    ).rejects.toThrow("repository");
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("does not retry viewed marks with the ambient account after selected credentials fail", async () => {
    const f = fixture();
    f.scoped.mockRejectedValue(new Error("selected credential denied"));
    const read = vi.spyOn(f.github, "getPrViewedFiles");
    await expect(
      f.service.getPrViewedFiles({
        projectLocation: location,
        prNumber: 7,
        forgeAccount: { forge: "github", host: "https://github.com", login: "alice" },
        forgeRepository: "team/app",
      }),
    ).rejects.toThrow("selected credential denied");
    expect(f.scoped).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([false, true, undefined])(
    "preserves GitHub data and only advertises auto-fix for a proven same-repository PR (%s)",
    async (isCrossRepository) => {
      const f = fixture();
      const data = { ...pr, ...(isCrossRepository !== undefined ? { isCrossRepository } : {}) };
      f.read.mockResolvedValue({ ...details, pr: data });
      const result = await f.service.getPrDetails({ projectLocation: location, prNumber: 7 });
      expect(result.pr).toMatchObject({
        ...data,
        source: {
          host: "https://github.com",
          repository: "team/app",
          account: { login: "alice" },
          capabilities: { autoFix: isCrossRepository === false },
        },
      });
      expect(result.details.source).toEqual(result.pr?.source);
    },
  );

  it("publishes gh's actual default repository and disables origin-based fixes for a different checkout", async () => {
    const f = fixture("fork/app");
    const result = await f.service.getRepository({ projectLocation: location });
    expect(result.repository).toMatchObject({
      repository: "team/app",
      capabilities: { autoFix: false },
    });
    expect(f.scoped).toHaveBeenCalledWith(location, undefined);
  });

  it("refuses a changed same-host repository before a merge, without retrying as the active account", async () => {
    const f = fixture();
    const account = { forge: "github" as const, host: "https://github.com", login: "alice" };
    await expect(
      f.service.mergePr({
        projectLocation: location,
        prNumber: 7,
        method: "squash",
        admin: false,
        forgeAccount: account,
        forgeRepository: "other/app",
        expectedHeadSha: pr.headSha!,
      }),
    ).rejects.toThrow(/repository no longer matches/);
    expect(f.scoped).toHaveBeenCalledWith(location, { host: "github.com", login: "alice" });
    expect(f.merge).not.toHaveBeenCalled();
    expect(f.resolve).toHaveBeenCalledOnce();
  });

  it("retains the explicit account, repository and head precondition for GitHub writes", async () => {
    const f = fixture();
    const account = { forge: "github" as const, host: "https://github.com", login: "alice" };
    await f.service.mergePr({
      projectLocation: location,
      prNumber: 7,
      method: "squash",
      admin: false,
      forgeAccount: account,
      forgeRepository: "team/app",
      expectedHeadSha: pr.headSha!,
    });
    expect(f.resolve).toHaveBeenCalledWith(location, account);
    expect(f.merge).toHaveBeenCalledWith(location, 7, "squash", false, pr.headSha);
  });

  it.each(["a".repeat(40), "", "not-a-head"])(
    "refuses unsupported conditional Bitbucket merge %j before any host write",
    async (expectedHeadSha) => {
      const source: ForgeRepository = {
        forge: "bitbucket",
        host: "https://bitbucket.org",
        repository: "team/app",
        remote: "origin",
        account: { forge: "bitbucket", host: "https://bitbucket.org", login: "alice" },
        capabilities: structuredClone(FORGE_CAPABILITIES.bitbucket),
      };
      const request = vi.fn<ForgeHttp>(async () => ({ status: 200, headers: {}, body: "{}" }));
      const api = new ForgeApi("https://api.bitbucket.org/2.0", {}, request);
      const service = new ForgeReviewService(new GitHubService(), {
        connections: { resolve: async () => ({ source, api }) },
      });
      const attempt = Promise.resolve().then(() =>
        service.mergePr(
          forgeMergePrAtHeadPayloadSchema.parse({
            projectLocation: location,
            prNumber: 7,
            method: "squash",
            admin: false,
            forgeAccount: source.account,
            forgeRepository: source.repository,
            expectedHeadSha,
          }),
        ),
      );
      await expect(attempt).rejects.toThrow(
        expectedHeadSha.length === 40 ? /not supported by the bitbucket/ : /expectedHeadSha/,
      );
      expect(request).not.toHaveBeenCalled();
    },
  );
});

const patchText = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n";

function azureFixture() {
  const state = {
    source: {
      forge: "azure-devops",
      host: "https://azure.example/org",
      repository: "team/app",
      remote: "origin",
      account: { forge: "azure-devops", host: "https://azure.example/org", login: "alice" },
      capabilities: structuredClone(FORGE_CAPABILITIES["azure-devops"]),
    } as ForgeRepository,
    location: { ...location },
    base: "b".repeat(40),
    head: "a".repeat(40),
  };
  const requests: URL[] = [];
  const runtime = new ForgeRuntime(() => undefined);
  const held = Promise.withResolvers<string>();
  const patch = vi.spyOn(runtime, "patch").mockReturnValue(held.promise);
  const service = new ForgeReviewService(new GitHubService(), {
    runtime,
    connections: {
      resolve: async () => {
        const source = structuredClone(state.source);
        return {
          source,
          api: new ForgeApi(source.host, {}, async (request) => {
            const url = new URL(request.url);
            requests.push(url);
            let body: unknown;
            if (url.pathname.endsWith("/pullRequests/7"))
              body = {
                pullRequestId: 7,
                status: "active",
                title: "Review",
                sourceRefName: "refs/heads/feature",
                targetRefName: "refs/heads/main",
                lastMergeSourceCommit: { commitId: state.head },
                lastMergeTargetCommit: { commitId: state.base },
                repository: { project: { id: "project" } },
                reviewers: [],
              };
            else if (url.pathname.endsWith("/diffs/commits"))
              body = {
                commonCommit: state.base,
                allChangesIncluded: true,
                changes: [{ item: { path: "/a.ts" }, changeType: "edit" }],
              };
            else if (url.pathname.endsWith("/items"))
              body = {
                content:
                  url.searchParams.get("versionDescriptor.version") === state.head
                    ? "new\n"
                    : "old\n",
              };
            else if (
              ["/statuses", "/evaluations", "/threads", "/commits"].some((suffix) =>
                url.pathname.endsWith(suffix),
              )
            )
              body = { value: [] };
            else throw new Error(`Unexpected Azure fixture request ${url.pathname}`);
            return { status: 200, headers: {}, body: JSON.stringify(body) };
          }),
        };
      },
    },
  });
  const input = () => ({
    projectLocation: state.location,
    prNumber: 7,
    forgeAccount: state.source.account!,
    forgeRepository: state.source.repository,
  });
  return { state, requests, patch, held, service, input };
}

describe("Azure in-flight patch snapshots", () => {
  it("shares one patch computation for concurrent files, diff and details without retaining it", async () => {
    const f = azureFixture();
    const load = Promise.all([
      f.service.getPrFiles(f.input()),
      f.service.getPrDiff(f.input()),
      f.service.getPrDetails(f.input()),
    ]);
    await vi.waitFor(() => expect(f.patch).toHaveBeenCalledOnce());
    f.held.resolve(patchText);
    const [files, diff, review] = await load;
    expect(files.files).toEqual([{ path: "a.ts", additions: 1, deletions: 1 }]);
    expect(diff.diff).toBe(patchText);
    expect(review.details).toMatchObject({ additions: 1, deletions: 1, changedFiles: 1 });
    expect(f.patch).toHaveBeenCalledOnce();
    expect(f.requests.filter((url) => url.pathname.endsWith("/items"))).toHaveLength(2);
    expect(f.requests.filter((url) => url.pathname.endsWith("/diffs/commits"))).toHaveLength(1);
    await f.service.getPrDiff(f.input());
    expect(f.patch).toHaveBeenCalledTimes(2);
    expect(f.requests.filter((url) => url.pathname.endsWith("/items"))).toHaveLength(4);
  });

  it.each(["location", "account", "host", "repository", "base", "head"] as const)(
    "isolates a concurrent changed %s snapshot",
    async (change) => {
      const f = azureFixture();
      const first = f.service.getPrDiff(f.input());
      await vi.waitFor(() => expect(f.patch).toHaveBeenCalledOnce());
      if (change === "location") f.state.location = { ...location, path: "C:\\other" };
      else if (change === "account")
        f.state.source.account = { ...f.state.source.account!, login: "bob" };
      else if (change === "host") {
        f.state.source.host = "https://other.example/org";
        f.state.source.account = { ...f.state.source.account!, host: f.state.source.host };
      } else if (change === "repository") f.state.source.repository = "other/app";
      else f.state[change] = "c".repeat(40);
      const second = f.service.getPrFiles(f.input());
      await vi.waitFor(() => expect(f.patch).toHaveBeenCalledTimes(2));
      f.held.resolve(patchText);
      await Promise.all([first, second]);
      expect(f.requests.filter((url) => url.pathname.endsWith("/items"))).toHaveLength(4);
      expect(f.requests.filter((url) => url.pathname.endsWith("/diffs/commits"))).toHaveLength(2);
    },
  );

  it("releases a failed computation so the same snapshot can recover", async () => {
    const f = azureFixture();
    const loads = Promise.allSettled([
      f.service.getPrFiles(f.input()),
      f.service.getPrDiff(f.input()),
    ]);
    await vi.waitFor(() => expect(f.patch).toHaveBeenCalledOnce());
    f.held.reject(new Error("fixture patch failed"));
    expect((await loads).map((result) => result.status)).toEqual(["rejected", "rejected"]);
    f.patch.mockResolvedValue(patchText);
    expect(await f.service.getPrDiff(f.input())).toEqual({ diff: patchText });
    expect(f.patch).toHaveBeenCalledTimes(2);
  });
});
