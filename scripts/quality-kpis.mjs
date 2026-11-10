#!/usr/bin/env node
/**
 * Weekly engineering-quality KPIs from GitHub data: how much merged work is
 * fixing earlier work, which areas keep needing fixes, and how often landed
 * commits go red or never get a verdict. Prints Markdown and appends it to
 * the job summary when `GITHUB_STEP_SUMMARY` is set.
 *
 * Usage: node scripts/quality-kpis.mjs [--days 14] [--repo owner/name]
 * Requires an authenticated `gh` (GH_TOKEN in CI).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONVENTIONAL = /^(?:#\d+\s+)?([a-z]+)(?:\(([^)]+)\))?!?:/u;
const WATCHED_WORKFLOWS = [
  "CI",
  "Native clients",
  "V2 performance qualification",
  "Windows WSL qualification",
  "Dependency audit",
  "Browser layout tests",
];

export function summarizePullRequests(pulls) {
  const byType = {};
  const fixScopes = {};
  for (const pull of pulls) {
    const match = CONVENTIONAL.exec(pull.title);
    const type = match?.[1] ?? "other";
    byType[type] = (byType[type] ?? 0) + 1;
    if (type === "fix") {
      const scope = match?.[2] ?? "(none)";
      fixScopes[scope] = (fixScopes[scope] ?? 0) + 1;
    }
  }
  const fixes = byType.fix ?? 0;
  const repeatFixScopes = Object.entries(fixScopes)
    .filter(([, count]) => count >= 3)
    .sort(
      ([leftScope, left], [rightScope, right]) =>
        right - left || leftScope.localeCompare(rightScope),
    )
    .map(([scope, count]) => ({ scope, count }));
  return {
    merged: pulls.length,
    fixes,
    fixRatio: pulls.length === 0 ? 0 : fixes / pulls.length,
    byType,
    repeatFixScopes,
  };
}

export function summarizeRuns(runs) {
  const workflows = {};
  for (const run of runs) {
    const entry = (workflows[run.name] ??= {
      total: 0,
      success: 0,
      failure: 0,
      cancelled: 0,
      other: 0,
    });
    entry.total += 1;
    if (run.conclusion === "success") entry.success += 1;
    else if (run.conclusion === "failure") entry.failure += 1;
    else if (run.conclusion === "cancelled") entry.cancelled += 1;
    else entry.other += 1;
  }
  for (const entry of Object.values(workflows)) {
    const decided = entry.success + entry.failure;
    entry.redRate = decided === 0 ? 0 : entry.failure / decided;
    entry.verdictRate = entry.total === 0 ? 0 : decided / entry.total;
  }
  return workflows;
}

const percent = (value) => `${Math.round(value * 100)}%`;

export function renderMarkdown({ days, pulls, runs }) {
  const lines = [
    `## Engineering quality - last ${days} days`,
    "",
    `- Merged PRs: **${pulls.merged}**, of which fixes: **${pulls.fixes}** (${percent(pulls.fixRatio)})`,
    `- PR types: ${Object.entries(pulls.byType)
      .sort(([, left], [, right]) => right - left)
      .map(([type, count]) => `${type} ${count}`)
      .join(", ")}`,
  ];
  if (pulls.repeatFixScopes.length > 0) {
    lines.push(
      `- Areas fixed 3+ times: ${pulls.repeatFixScopes.map(({ scope, count }) => `\`${scope}\` ${count}`).join(", ")}`,
    );
  }
  lines.push(
    "",
    "| Workflow (default branch) | Runs | Red rate | Runs with a verdict |",
    "| --- | ---: | ---: | ---: |",
  );
  for (const name of WATCHED_WORKFLOWS) {
    const entry = runs[name];
    if (!entry) continue;
    lines.push(
      `| ${name} | ${entry.total} | ${percent(entry.redRate)} | ${percent(entry.verdictRate)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function gh(args) {
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

export function main(argv = process.argv.slice(2)) {
  const option = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  const days = Number(option("--days", "14"));
  const repo = option("--repo", process.env.GITHUB_REPOSITORY ?? "");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const repoArgs = repo ? ["--repo", repo] : [];
  const pulls = gh([
    "pr",
    "list",
    ...repoArgs,
    "--state",
    "merged",
    "--limit",
    "1000",
    "--search",
    `merged:>=${since.slice(0, 10)}`,
    "--json",
    "title,mergedAt",
  ]);
  const branch = gh(["repo", "view", ...(repo ? [repo] : []), "--json", "defaultBranchRef"])
    .defaultBranchRef.name;
  const runs = gh([
    "run",
    "list",
    ...repoArgs,
    "--branch",
    branch,
    "--limit",
    "1000",
    "--created",
    `>=${since.slice(0, 10)}`,
    "--json",
    "name,conclusion",
  ]);
  const markdown = renderMarkdown({
    days,
    pulls: summarizePullRequests(pulls),
    runs: summarizeRuns(runs),
  });
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  return 0;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) process.exitCode = main();
