import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ForgeGetPrReviewGuidePayload, ForgeReviewGuideContent } from "@/shared/contracts";
import {
  ForgeReviewGuideStore,
  reviewGuideFingerprint,
  validateReviewGuide,
  type ReviewGuideSnapshot,
} from "./reviewGuides";

const input: ForgeGetPrReviewGuidePayload = {
  projectLocation: { kind: "posix", path: "/repo" },
  forgeAccount: { forge: "gitlab", host: "https://git.example", login: "alice" },
  forgeRepository: "team/app",
  prNumber: 7,
};
const snapshot: ReviewGuideSnapshot = {
  headSha: "a".repeat(40),
  details: {
    number: 7,
    title: "Fix",
    body: "",
    baseBranch: "main",
    headBranch: "fix",
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    comments: [],
    reviews: [],
    commits: [],
    checks: [],
  },
  files: [{ path: "a.ts", additions: 1, deletions: 1 }],
  diff: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n",
  threads: [],
};
const content: ForgeReviewGuideContent = {
  summary: "A fix",
  stops: [
    {
      title: "Read the fix",
      body: "Check the new behavior.",
      lookClosely: true,
      files: ["a.ts"],
      excerpts: [{ path: "a.ts", side: "RIGHT", startLine: 1, endLine: 1, text: "new" }],
      questions: ["Why this behavior?"],
    },
  ],
};
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function storePath() {
  const directory = await mkdtemp(join(tmpdir(), "poracode-guide-test-"));
  directories.push(directory);
  return join(directory, "guides.json");
}

it("persists complete guides across restart and shares them only within one source host and repository", async () => {
  const path = await storePath();
  const store = new ForgeReviewGuideStore(path);
  const job = Promise.withResolvers<ForgeReviewGuideContent>();
  expect((await store.start(input, snapshot, "writer", () => job.promise)).status).toBe(
    "generating",
  );
  const duplicate = vi.fn<() => Promise<ForgeReviewGuideContent>>(async () => content);
  await store.start(input, snapshot, "writer", duplicate);
  expect(duplicate).not.toHaveBeenCalled();
  job.resolve(content);
  await vi.waitFor(async () =>
    expect((await store.get(input, reviewGuideFingerprint(snapshot))).status).toBe("ready"),
  );
  const restarted = new ForgeReviewGuideStore(path);
  expect(
    (
      await restarted.get(
        { ...input, forgeAccount: { ...input.forgeAccount, login: "bob" } },
        reviewGuideFingerprint(snapshot),
      )
    ).guide?.summary,
  ).toBe(content.summary);
  expect(
    (
      await restarted.get(
        { ...input, forgeRepository: "other/app" },
        reviewGuideFingerprint(snapshot),
      )
    ).guide,
  ).toBeNull();
  expect(
    (await restarted.get(input, reviewGuideFingerprint({ ...snapshot, headSha: "b".repeat(40) })))
      .stale,
  ).toBe(true);
  expect(JSON.parse(await readFile(path, "utf8")).version).toBe(1);
  for (const details of [
    { ...snapshot.details, title: "New requirements" },
    { ...snapshot.details, body: "New requirements" },
  ]) {
    expect(
      (await restarted.get(input, reviewGuideFingerprint({ ...snapshot, details }))).stale,
    ).toBe(true);
  }
});

it("rejects missing files, cross-file excerpts and invented code", () => {
  expect(() => validateReviewGuide(content, snapshot)).not.toThrow();
  expect(() =>
    validateReviewGuide(content, {
      ...snapshot,
      files: [...snapshot.files, { path: "missing.ts", additions: 0, deletions: 0 }],
    }),
  ).toThrow(/did not cover every changed file/);
  for (const excerpt of [
    { ...content.stops[0]!.excerpts[0]!, text: "invented" },
    { ...content.stops[0]!.excerpts[0]!, path: "another.ts" },
  ]) {
    expect(() =>
      validateReviewGuide(
        { ...content, stops: [{ ...content.stops[0]!, excerpts: [excerpt] }] },
        snapshot,
      ),
    ).toThrow(/did not cover every changed file/);
  }
});

it("retains an earlier valid guide when a rewrite fails and allows a later retry", async () => {
  const store = new ForgeReviewGuideStore(await storePath());
  await store.start(input, snapshot, "writer", async () => content);
  await vi.waitFor(async () => expect((await store.get(input, "old")).status).toBe("ready"));
  await store.start(input, snapshot, "writer", async () => {
    throw new Error("unavailable");
  });
  await vi.waitFor(async () => expect((await store.get(input, "new")).status).toBe("failed"));
  expect((await store.get(input, "new")).guide?.summary).toBe(content.summary);
  await store.start(input, snapshot, "writer", async () => content);
  await vi.waitFor(async () =>
    expect((await store.get(input, reviewGuideFingerprint(snapshot))).status).toBe("ready"),
  );
});

it.each([2, 99])(
  "refuses future store version %s without rewriting it or starting a writer",
  async (version) => {
    const path = await storePath();
    const bytes = JSON.stringify({ version, guides: {} });
    await writeFile(path, bytes);
    const generate = vi.fn<() => Promise<ForgeReviewGuideContent>>(async () => content);
    await expect(
      new ForgeReviewGuideStore(path).start(input, snapshot, "writer", generate),
    ).rejects.toThrow(/version/);
    expect(generate).not.toHaveBeenCalled();
    expect(await readFile(path, "utf8")).toBe(bytes);
  },
);

it("accepts a previous version-one guide without silently changing its content", async () => {
  const path = await storePath();
  const key = JSON.stringify(["gitlab", "https://git.example", "team/app", 7]);
  const guide = {
    ...content,
    version: 1,
    fingerprint: reviewGuideFingerprint(snapshot),
    createdAt: "2026-10-19T00:00:00Z",
    model: "previous-model",
  };
  const bytes = JSON.stringify({ version: 1, guides: { [key]: guide } });
  await writeFile(path, bytes);
  expect((await new ForgeReviewGuideStore(path).get(input, guide.fingerprint)).guide).toEqual(
    guide,
  );
  expect(await readFile(path, "utf8")).toBe(bytes);
});
