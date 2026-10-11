import { mkdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { ProcessCleanup } from "../harness/processCleanup.ts";
import {
  assertWorktreesRegistered,
  createGitBurstWorktrees,
  type GitBurstWorktree,
} from "./gitBurstWorktrees.ts";
import { GIT_BURST_SEED_PROJECT_NAME, GIT_BURST_TMP_DIR } from "./gitBurstConfig.ts";
import type { GitBurstSession } from "./gitBurstSession.ts";
import { expectOk, type WorkloadProject } from "./sharedHostWorkload.ts";

/**
 * One-time fixture bootstrap for the §4 Git-burst cell, split into the two
 * phases the qualification test runs in order:
 *
 *  1. `discoverGitBurstFixtureProject` — find the seeded fixture project in
 *     the host snapshot and run the recorded cold `getGitStatus` warmup (the
 *     supervisor's first start; its latency is excluded from burst
 *     distributions but kept as evidence).
 *  2. `createGitBurstFixtureWorktrees` — seed the initial commit through the
 *     production procedure (a fresh fixture repo has no HEAD for
 *     `git worktree add`) and create the DISTINCT real worktrees inside a
 *     disposable tracked scratch root.
 *
 * The diagnostics gate the cell runs between the two phases deliberately
 * stays in the test: it must observe the host after the warmup start but
 * before the worktree-creation traffic.
 */

export interface GitBurstFixtureProject {
  readonly project: WorkloadProject;
  readonly warmupColdGitStatusMs: number;
}

export interface GitBurstFixture {
  readonly root: string;
  readonly seedCommitHash: string | null;
  readonly worktrees: GitBurstWorktree[];
}

/** Discovers the seeded fixture project and records the cold warmup. */
export async function discoverGitBurstFixtureProject(
  session: GitBurstSession,
): Promise<GitBurstFixtureProject> {
  const bootstrap = (await session.openBurstClients(1, "gitburst-bootstrap"))[0]!;
  try {
    const snapshot = await bootstrap.fetchJson("snapshot-read", "/api/snapshot");
    expectOk(snapshot.status, "bootstrap snapshot", snapshot.body);
    const projects =
      (snapshot.body as { projects?: Array<Record<string, unknown>> }).projects ?? [];
    const seeded = projects.find((entry) => entry.name === GIT_BURST_SEED_PROJECT_NAME);
    assert(seeded, `seeded project ${GIT_BURST_SEED_PROJECT_NAME} must exist`);
    const location = seeded?.location as { kind?: string; path?: string } | undefined;
    assert.strictEqual(location?.kind, "posix", "seeded project must be a posix location");
    const project: WorkloadProject = {
      projectId: String(seeded?.id),
      locationPath: String(location?.path),
    };
    assert.strictEqual(
      project.locationPath,
      join(session.baseDir, "fixture-repo"),
      "seeded project must live in the isolated fixture repo",
    );
    const cold = await bootstrap.gitProcedure("git-status-cold", "getGitStatus", {
      projectLocation: { kind: "posix", path: project.locationPath },
    });
    expectOk(cold.status, "warmup getGitStatus", cold.body);
    assert.strictEqual(
      (cold.body as { isRepo?: boolean }).isRepo,
      true,
      "fixture repo must report isRepo",
    );
    session.bindFixtureProject(project);
    return { project, warmupColdGitStatusMs: cold.elapsedMs };
  } finally {
    await bootstrap.close();
  }
}

/** Seeds the initial commit and creates `count` distinct worktrees through the
 * production admission seam, inside a disposable tracked scratch root. */
export async function createGitBurstFixtureWorktrees(input: {
  readonly session: GitBurstSession;
  readonly repoRoot: string;
  readonly cleanup: ProcessCleanup;
  readonly count: number;
}): Promise<GitBurstFixture> {
  const root = join(input.repoRoot, GIT_BURST_TMP_DIR, "worktrees");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  input.cleanup.trackTempDir(root);
  const creator = (await input.session.openBurstClients(1, "gitburst-worktree"))[0]!;
  try {
    const seededCommit = await creator.gitProcedure("git-commit-seed", "gitCommit", {
      projectLocation: input.session.fixtureProjectLocation(),
      message: "git burst fixture seed",
      addAll: true,
    });
    expectOk(seededCommit.status, "fixture seed commit", seededCommit.body);
    const seedCommitHash = (seededCommit.body as { hash?: string }).hash ?? null;
    const worktrees = await createGitBurstWorktrees({
      client: creator,
      project: input.session.fixtureProject(),
      root,
      count: input.count,
    });
    await assertWorktreesRegistered(creator, input.session.fixtureProject(), worktrees);
    return { root, seedCommitHash, worktrees };
  } finally {
    await creator.close();
  }
}
