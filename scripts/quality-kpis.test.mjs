import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";
import { renderMarkdown, summarizePullRequests, summarizeRuns } from "./quality-kpis.mjs";

void test("summarizes PR types, fix ratio and areas that keep needing fixes", () => {
  const summary = summarizePullRequests([
    { title: "fix(chat): a" },
    { title: "fix(chat): b" },
    { title: "#12 fix(chat): c" },
    { title: "fix(remote): d" },
    { title: "feat(home): e" },
    { title: "Revert something" },
  ]);
  assert.equal(summary.merged, 6);
  assert.equal(summary.fixes, 4);
  assert.equal(summary.fixRatio, 4 / 6);
  assert.deepEqual(summary.byType, { fix: 4, feat: 1, other: 1 });
  assert.deepEqual(summary.repeatFixScopes, [{ scope: "chat", count: 3 }]);
});

void test("separates red runs from runs that never got a verdict", () => {
  const runs = summarizeRuns([
    { name: "CI", conclusion: "success" },
    { name: "CI", conclusion: "failure" },
    { name: "CI", conclusion: "cancelled" },
    { name: "CI", conclusion: "success" },
  ]);
  assert.deepEqual(runs.CI, {
    total: 4,
    success: 2,
    failure: 1,
    cancelled: 1,
    other: 0,
    redRate: 1 / 3,
    verdictRate: 3 / 4,
  });
  const markdown = renderMarkdown({
    days: 14,
    pulls: summarizePullRequests([{ title: "fix(chat): a" }]),
    runs,
  });
  assert.match(markdown, /Merged PRs: \*\*1\*\*, of which fixes: \*\*1\*\* \(100%\)/u);
  assert.match(markdown, /\| CI \| 4 \| 33% \| 75% \|/u);
});

void test("the KPI workflow runs weekly with read-only permissions", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/quality-kpis.yml", import.meta.url), "utf8"),
  );
  assert.equal(workflow.on.schedule.length, 1);
  assert.ok("workflow_dispatch" in workflow.on);
  assert.deepEqual(workflow.permissions, {
    actions: "read",
    contents: "read",
    "pull-requests": "read",
  });
  const step = workflow.jobs.report.steps.find((item) => item.run?.includes("quality-kpis.mjs"));
  assert.ok(step, "the report step runs the KPI script");
  assert.equal(step.env.GH_TOKEN, "${{ github.token }}");
});
