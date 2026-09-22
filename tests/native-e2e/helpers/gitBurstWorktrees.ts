import assert from "node:assert/strict";
import { join } from "node:path";
import type { ProfileClient } from "./concurrencyProfileClient.ts";
import { summarizeLatencies, type LatencySummary } from "./profileMetrics.ts";
import { expectOk, posixLocation, type WorkloadProject } from "./sharedHostWorkload.ts";

/**
 * Distinct real Git worktrees and burst refreshes for the §4 Git-burst cell.
 *
 * Worktrees are created through the production `gitAddWorktree` procedure
 * (an admitted short-class worktree caller per B7) at explicit paths inside
 * the run's disposable fixture root, so the burst refreshes DISTINCT real
 * checkouts and never reuses one repository path. Every refresh is a real
 * authenticated `getGitStatus` round-trip through `/api/git/call`.
 *
 * Classification is honest by construction: a refresh is
 *  - `ok` only when the host answered 200 with `isRepo: true` AND the
 *    worktree's own declared branch (a status that silently reported
 *    `isRepo: false` would be a B7 failure — overload must never read as
 *    "not a Git repository" — and is its own outcome class),
 *  - `httpError` when the host answered any non-200. Two distinct bounded
 *    layers can produce this: the host's B3 ingress admission (`host_busy`,
 *    before the supervisor is involved) and supervisor-side Git admission
 *    pressure. The envelope's `error.code` (if any) is recorded; failures
 *    without a typed code are counted in `missingErrorCode` and the cell's
 *    classification rules (gitBurstClassification.ts) reject them,
 *  - `unexpectedBody` for any other 200 shape.
 */

export interface GitBurstWorktree {
  readonly path: string;
  readonly branch: string;
}

export type GitBurstRefreshOutcome =
  | { readonly kind: "ok"; readonly elapsedMs: number }
  | { readonly kind: "silentFalseRepo"; readonly elapsedMs: number; readonly body: unknown }
  | {
      readonly kind: "httpError";
      readonly elapsedMs: number;
      readonly status: number;
      readonly errorCode: string | null;
    }
  | { readonly kind: "unexpectedBody"; readonly elapsedMs: number; readonly body: unknown };

/** Creates `count` distinct worktrees sequentially through the production
 * procedure. Sequential by design: creation is fixture setup, not the burst,
 * and it keeps the one-pairing/token discipline of the shared-host harness. */
export async function createGitBurstWorktrees(input: {
  readonly client: ProfileClient;
  readonly project: WorkloadProject;
  readonly root: string;
  readonly count: number;
}): Promise<GitBurstWorktree[]> {
  const worktrees: GitBurstWorktree[] = [];
  for (let index = 1; index <= input.count; index += 1) {
    const label = String(index).padStart(2, "0");
    const worktree: GitBurstWorktree = {
      path: join(input.root, `wt-${label}`),
      branch: `gitburst/wt-${label}`,
    };
    const added = await input.client.gitProcedure("git-add-worktree", "gitAddWorktree", {
      projectLocation: posixLocation(input.project),
      path: worktree.path,
      branch: worktree.branch,
      createBranch: true,
    });
    expectOk(added.status, `gitAddWorktree ${worktree.branch}`, added.body);
    worktrees.push(worktree);
  }
  return worktrees;
}

/** Asserts the host's own worktree list reports every created checkout. */
export async function assertWorktreesRegistered(
  client: ProfileClient,
  project: WorkloadProject,
  expected: readonly GitBurstWorktree[],
): Promise<void> {
  const listed = await client.gitProcedure("git-list-worktrees", "gitListWorktrees", {
    projectLocation: posixLocation(project),
  });
  expectOk(listed.status, "gitListWorktrees after creation", listed.body);
  const listedPaths = new Set(
    ((listed.body as { worktrees?: Array<{ path?: string }> }).worktrees ?? []).map(
      (entry) => entry.path,
    ),
  );
  for (const worktree of expected) {
    assert(
      listedPaths.has(worktree.path),
      `host worktree list must report ${worktree.path} (listed ${String(listedPaths.size)})`,
    );
  }
}

/** One real refresh round-trip, classified without optimism. */
export async function refreshWorktree(
  client: ProfileClient,
  project: WorkloadProject,
  worktree: GitBurstWorktree,
): Promise<{ outcome: GitBurstRefreshOutcome; branch: string | null }> {
  const response = await client.gitProcedure("git-status-refresh", "getGitStatus", {
    projectLocation: { kind: "posix", path: worktree.path },
  });
  if (response.status === 200) {
    const body = response.body as { isRepo?: unknown; branch?: unknown };
    if (body.isRepo === true && body.branch === worktree.branch) {
      return { outcome: { kind: "ok", elapsedMs: response.elapsedMs }, branch: worktree.branch };
    }
    if (body.isRepo === false) {
      return {
        outcome: { kind: "silentFalseRepo", elapsedMs: response.elapsedMs, body: response.body },
        branch: null,
      };
    }
    return {
      outcome: { kind: "unexpectedBody", elapsedMs: response.elapsedMs, body: response.body },
      branch: null,
    };
  }
  const errorCode =
    (response.body as { error?: { code?: unknown } }).error?.code !== undefined
      ? String((response.body as { error: { code: unknown } }).error.code)
      : null;
  return {
    outcome: {
      kind: "httpError",
      elapsedMs: response.elapsedMs,
      status: response.status,
      errorCode,
    },
    branch: null,
  };
}

export interface GitBurstRefreshSummary {
  readonly refreshes: number;
  readonly ok: number;
  readonly httpErrors: number;
  readonly silentFalseRepo: number;
  readonly unexpectedBody: number;
  readonly distinctErrorCodes: readonly string[];
  readonly httpErrorsByCode: Readonly<Record<string, number>>;
  /** HTTP failures whose envelope carried no typed `error.code`. */
  readonly missingErrorCode: number;
  readonly okLatency: LatencySummary;
  readonly perWorktree: ReadonlyArray<{
    readonly branch: string;
    readonly outcome: string;
    readonly elapsedMs: number;
    readonly status: number | null;
    readonly errorCode: string | null;
  }>;
}

/** Fires `worktrees` refreshes across `clients` fully concurrently (round-robin
 * assignment, so multiple authenticated principals drive the burst) and
 * summarizes the classified outcomes. Never asserts: the caller decides what
 * the §4 cell requires and records the rest. */
export async function runGitBurst(
  clients: readonly ProfileClient[],
  project: WorkloadProject,
  worktrees: readonly GitBurstWorktree[],
): Promise<GitBurstRefreshSummary> {
  if (clients.length === 0) throw new Error("git burst ran with no clients");
  const results = await Promise.all(
    worktrees.map(async (worktree, index) => {
      const client = clients[index % clients.length]!;
      const { outcome } = await refreshWorktree(client, project, worktree);
      return { worktree, outcome };
    }),
  );
  const okLatencies = results
    .map((entry) => entry.outcome)
    .filter(
      (outcome): outcome is Extract<GitBurstRefreshOutcome, { kind: "ok" }> =>
        outcome.kind === "ok",
    )
    .map((outcome) => outcome.elapsedMs);
  const errorCounts = new Map<string, number>();
  let missingErrorCode = 0;
  for (const entry of results) {
    if (entry.outcome.kind !== "httpError") continue;
    if (entry.outcome.errorCode === null) {
      missingErrorCode += 1;
      continue;
    }
    errorCounts.set(entry.outcome.errorCode, (errorCounts.get(entry.outcome.errorCode) ?? 0) + 1);
  }
  return {
    refreshes: results.length,
    ok: okLatencies.length,
    httpErrors: results.filter((entry) => entry.outcome.kind === "httpError").length,
    silentFalseRepo: results.filter((entry) => entry.outcome.kind === "silentFalseRepo").length,
    unexpectedBody: results.filter((entry) => entry.outcome.kind === "unexpectedBody").length,
    distinctErrorCodes: [...errorCounts.keys()].sort(),
    httpErrorsByCode: Object.fromEntries(
      [...errorCounts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    missingErrorCode,
    okLatency: summarizeLatencies(okLatencies),
    perWorktree: results.map((entry) => ({
      branch: entry.worktree.branch,
      outcome: entry.outcome.kind,
      elapsedMs: Math.round(entry.outcome.elapsedMs),
      status: entry.outcome.kind === "httpError" ? entry.outcome.status : null,
      errorCode: entry.outcome.kind === "httpError" ? entry.outcome.errorCode : null,
    })),
  };
}
