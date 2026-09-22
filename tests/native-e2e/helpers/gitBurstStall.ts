import { createServer, type Server } from "node:net";
import assert from "node:assert/strict";
import type { ProfileClient } from "./concurrencyProfileClient.ts";
import {
  diffGitAdmissionUsage,
  environmentUsage,
  type GitBurstAdmissionUsage,
} from "./gitBurstDiagnostics.ts";
import { GIT_BURST_BOUNDS, GIT_BURST_DRAIN_TIMEOUT_MS } from "./gitBurstConfig.ts";
import { assertClassLimits } from "./gitBurstClassification.ts";
import type { GitBurstSession } from "./gitBurstSession.ts";
import { expectOk, posixLocation, type WorkloadProject } from "./sharedHostWorkload.ts";

/**
 * The deliberately stalled `long` permit of the §4 Git-burst cell.
 *
 * A connect-and-never-respond loopback listener pins one `long` admission
 * permit with a real `gitFetch` while the burst, the streaming PTY and the
 * control path keep running: the fetch's HTTP request never answers, so the
 * production GIT_NETWORK_TIMEOUT ends it. No external network is touched.
 *
 * The module also owns the release side of the same evidence: the slow-fetch
 * accounting in the production counters and the exact drain of every pool
 * once the burst and the stalled child are gone.
 */

/** How long the cell waits for the stalled fetch to become a visible long
 * permit in the production gauges. */
const LONG_PERMIT_VISIBILITY_TIMEOUT_MS = 10_000;
const LONG_PERMIT_POLL_INTERVAL_MS = 25;

export interface GitBurstBlackhole {
  /** Remote URL pointing at the connect-and-never-respond listener. */
  readonly url: string;
  readonly close: () => Promise<void>;
}

/** Starts the connect-and-never-respond loopback listener. */
export async function startBlackholeListener(): Promise<GitBurstBlackhole> {
  const blackhole: Server = createServer((socket) => socket.resume());
  await new Promise<void>((resolve, reject) => {
    blackhole.once("error", reject);
    blackhole.listen(0, "127.0.0.1", () => resolve());
  });
  return {
    url: `http://127.0.0.1:${String((blackhole.address() as { port: number }).port)}/repo.git`,
    close: () =>
      new Promise<void>((resolve) => {
        (blackhole as Server & { closeAllConnections?: () => void }).closeAllConnections?.();
        blackhole.close(() => resolve());
      }),
  };
}

export interface GitBurstPendingStalledFetch {
  /** Resolves when the fetch settles; the cell requires slow and bounded. */
  readonly settled: Promise<{ readonly elapsedMs: number; readonly status: number }>;
}

/** Pins one `long` permit: registers the black-hole remote, then starts the
 * `gitFetch` whose stall the production network timeout must bound. */
export async function pinStalledNetworkFetch(input: {
  readonly client: ProfileClient;
  readonly project: WorkloadProject;
  readonly blackholeUrl: string;
}): Promise<GitBurstPendingStalledFetch> {
  const added = await input.client.gitProcedure("git-add-remote", "gitAddRemote", {
    projectLocation: posixLocation(input.project),
    remote: "blackhole",
    url: input.blackholeUrl,
  });
  expectOk(added.status, "gitAddRemote blackhole", added.body);
  const fetchStartedAt = performance.now();
  const settled = input.client
    .gitProcedure("git-fetch-stalled", "gitFetch", {
      projectLocation: posixLocation(input.project),
      remote: "blackhole",
    })
    .then((response) => ({
      elapsedMs: performance.now() - fetchStartedAt,
      status: response.status,
    }));
  return { settled };
}

/** Polls the admission gauges until the stalled fetch is visible as an active
 * `long` permit. Returns false when the deadline passed unseen (no-sample). */
export async function waitForVisibleLongPermit(session: GitBurstSession): Promise<boolean> {
  const deadline = performance.now() + LONG_PERMIT_VISIBILITY_TIMEOUT_MS;
  while (performance.now() < deadline) {
    if ((await session.gitDiagnostics()).gitProcesses.long.active >= 1) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, LONG_PERMIT_POLL_INTERVAL_MS));
  }
  return false;
}

/** The stalled fetch settles only through the production network timeout, and
 * the diagnostics must have counted it as slow with class limits intact. */
export async function assertStalledFetchAccounted(input: {
  readonly session: GitBurstSession;
  readonly before: GitBurstAdmissionUsage;
  readonly stall: { readonly elapsedMs: number; readonly status: number };
}): Promise<void> {
  const { stall } = input;
  assert.notStrictEqual(stall.status, 200, "a black-hole fetch must not succeed");
  assert(
    stall.elapsedMs >= GIT_BURST_BOUNDS.slowFetchThresholdMs,
    `fetch settled in ${String(stall.elapsedMs)}ms, below the slow-fetch threshold`,
  );
  assert(
    stall.elapsedMs <= GIT_BURST_BOUNDS.fetchStallMaxMs,
    `fetch took ${String(stall.elapsedMs)}ms; the production network timeout did not bound it`,
  );
  const afterFetch = (await input.session.gitDiagnostics()).gitProcesses;
  assert(
    (afterFetch.slowFetches ?? 0) >= (input.before.gitProcesses.slowFetches ?? 0) + 1,
    "stalled fetch must increment the production slowFetches counter",
  );
  assertClassLimits(diffGitAdmissionUsage(input.before.gitProcesses, afterFetch));
}

/** Waits until every pool drains to zero (permits release only at the reap
 * boundary); throws with the stuck pool state past the deadline. */
export async function waitForAdmissionDrain(session: GitBurstSession): Promise<void> {
  const deadline = performance.now() + GIT_BURST_DRAIN_TIMEOUT_MS;
  for (;;) {
    const usage = (await session.gitDiagnostics()).gitProcesses;
    const posix = environmentUsage(usage, "posix");
    const drained =
      usage.short.active === 0 &&
      usage.short.queued === 0 &&
      usage.long.active === 0 &&
      usage.long.queued === 0 &&
      posix.active === 0 &&
      posix.queued === 0;
    if (drained) return;
    if (performance.now() >= deadline) {
      throw new Error(
        `admission pools did not drain: short=${JSON.stringify(usage.short)} long=${JSON.stringify(usage.long)} ` +
          `posix=${JSON.stringify(posix)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
