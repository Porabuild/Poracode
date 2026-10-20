import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ForgeRepository, ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "./agents/base";
import type { ReviewGuideSnapshot } from "./forges/reviewGuides";

const owned = vi.hoisted(() => ({ checkout: "", failAfterAdd: false }));
vi.mock("./git/exec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./git/exec")>();
  return {
    ...actual,
    computeDefaultWorktreePath: async () => owned.checkout,
    execGit: async (...args: Parameters<typeof actual.execGit>) => {
      const result = await actual.execGit(...args);
      if (owned.failAfterAdd && args[1].includes("add") && args[1].includes("worktree"))
        throw new Error("checkout timed out");
      return result;
    },
  };
});
vi.mock("./oneShotPromptRunner", () => ({
  runOneShotPromptWithFallback:
    vi.fn<typeof import("./oneShotPromptRunner").runOneShotPromptWithFallback>(),
}));
import { execGit } from "./git/exec";
import { runOneShotPromptWithFallback } from "./oneShotPromptRunner";
import { generateReviewGuide } from "./reviewGuideGenerator";
import { FORGE_CAPABILITIES } from "./forges/connection";

const source: ForgeRepository = {
  forge: "gitlab",
  host: "https://git.example",
  repository: "team/app",
  remote: "origin",
  account: { forge: "gitlab", host: "https://git.example", login: "alice" },
  capabilities: FORGE_CAPABILITIES.gitlab,
};
const adapter = {
  label: "Writer",
  defaultOneShotModel: "writer-model",
  capabilities: { supportsReadOnlyOneShotWorkspace: true },
} as AgentAdapter;
const content = {
  summary: "Fix",
  stops: [
    {
      title: "Behavior",
      body: "Read the code",
      lookClosely: true,
      files: ["a.txt"],
      excerpts: [],
      questions: [],
    },
  ],
};
let directory: string;
let location: ProjectLocation;
let snapshot: ReviewGuideSnapshot;
beforeEach(async () => {
  vi.clearAllMocks();
  owned.failAfterAdd = false;
  directory = await mkdtemp(join(tmpdir(), "poracode-guide-checkout-test-"));
  location = { kind: process.platform === "win32" ? "windows" : "posix", path: directory };
  owned.checkout = join(directory, "review-checkout");
  await execGit(location, ["init"]);
  await writeFile(join(directory, "a.txt"), "committed\n");
  await execGit(location, ["add", "a.txt"]);
  await execGit(location, [
    "-c",
    "user.email=guide@example.test",
    "-c",
    "user.name=Guide test",
    "commit",
    "-m",
    "fixture",
  ]);
  snapshot = {
    headSha: (await execGit(location, ["rev-parse", "HEAD"])).trim(),
    details: {
      number: 7,
      title: "Fix",
      body: "",
      baseBranch: "main",
      headBranch: "fix",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      comments: [],
      reviews: [],
      commits: [],
      checks: [],
    },
    files: [{ path: "a.txt", additions: 1, deletions: 0 }],
    diff: "full diff",
    threads: [],
  };
  await writeFile(join(directory, "a.txt"), "uncommitted user's work\n");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("reads the pinned commit in a detached checkout and leaves the user's dirty checkout intact", async () => {
  vi.mocked(runOneShotPromptWithFallback).mockImplementation(async (options) => {
    expect(options.location).toEqual({ ...location, path: owned.checkout });
    expect(options.readOnlyWorkspace).toBe(true);
    expect(options.selection).toEqual({ model: "writer-model", effort: "", fast: false });
    expect(await readFile(join(owned.checkout, "a.txt"), "utf8")).toBe("committed\n");
    expect((await execGit(options.location, ["rev-parse", "HEAD"])).trim()).toBe(snapshot.headSha);
    return JSON.stringify(content);
  });
  await expect(
    generateReviewGuide(
      {
        projectLocation: location,
        forgeAccount: source.account!,
        forgeRepository: source.repository,
        prNumber: 7,
        agentKind: "writer",
        selection: { model: "writer-model", effort: "", fast: false },
      },
      snapshot,
      source,
      adapter,
    ),
  ).resolves.toEqual(content);
  expect(await readFile(join(directory, "a.txt"), "utf8")).toBe("uncommitted user's work\n");
  await expect(access(owned.checkout)).rejects.toThrow(/ENOENT/);
  expect(
    (await execGit(location, ["worktree", "list", "--porcelain"])).match(/^worktree /gm),
  ).toHaveLength(1);
});

it("cleans up a failed writer and refuses adapters without the read-only capability before creating a checkout", async () => {
  const payload = {
    projectLocation: location,
    forgeAccount: source.account!,
    forgeRepository: source.repository,
    prNumber: 7,
    agentKind: "writer",
  };
  await expect(
    generateReviewGuide(payload, snapshot, source, {
      ...adapter,
      capabilities: { ...adapter.capabilities, supportsReadOnlyOneShotWorkspace: false },
    }),
  ).rejects.toThrow(/enforced read-only workspace/);
  expect(runOneShotPromptWithFallback).not.toHaveBeenCalled();
  await expect(access(owned.checkout)).rejects.toThrow(/ENOENT/);
  vi.mocked(runOneShotPromptWithFallback).mockRejectedValue(new Error("writer failed"));
  await expect(generateReviewGuide(payload, snapshot, source, adapter)).rejects.toThrow(
    "writer failed",
  );
  await expect(access(owned.checkout)).rejects.toThrow(/ENOENT/);
  expect(await readFile(join(directory, "a.txt"), "utf8")).toBe("uncommitted user's work\n");
});

it("cleans a checkout registered before creation fails and preserves pre-existing paths", async () => {
  const payload = {
    projectLocation: location,
    forgeAccount: source.account!,
    forgeRepository: source.repository,
    prNumber: 7,
    agentKind: "writer",
  };
  owned.failAfterAdd = true;
  await expect(generateReviewGuide(payload, snapshot, source, adapter)).rejects.toThrow(
    "checkout timed out",
  );
  await expect(access(owned.checkout)).rejects.toThrow(/ENOENT/);
  expect(
    (await execGit(location, ["worktree", "list", "--porcelain"])).match(/^worktree /gm),
  ).toHaveLength(1);
  await writeFile(owned.checkout, "foreign bytes");
  await expect(generateReviewGuide(payload, snapshot, source, adapter)).rejects.toThrow(/EEXIST/);
  expect(await readFile(owned.checkout, "utf8")).toBe("foreign bytes");
  expect(runOneShotPromptWithFallback).not.toHaveBeenCalled();
});
