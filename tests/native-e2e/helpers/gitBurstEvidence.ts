import { PORACODE_REMOTE_PROTOCOL_VERSION } from "../../../src/shared/remote/protocol.ts";
import {
  diffGitAdmissionUsage,
  type GitBurstAdmissionDelta,
  type GitBurstAdmissionUsage,
  type GitBurstGaugePoller,
  type GitBurstGaugeWindow,
} from "./gitBurstDiagnostics.ts";
import {
  GIT_BURST_BOUNDS,
  GIT_BURST_CLIENTS_BY_SIZE,
  GIT_BURST_GENERATOR_LINES,
  GIT_BURST_RUN_ENVIRONMENT,
  GIT_BURST_WORKTREE_COUNT,
} from "./gitBurstConfig.ts";
import {
  captureTreeDiff,
  describeArtifact,
  observeSources,
  summarizeProvenance,
  writeExperimentArtifact,
} from "./experimentArtifacts.ts";
import type { GitBurstRefreshSummary } from "./gitBurstWorktrees.ts";

/**
 * Artifact evidence written by the §4 Git-burst cell: build provenance (the
 * exact server artifact the run qualified), one persisted record per burst
 * window (refresh classification + cumulative admission deltas + sampled
 * gauges), and the closing run summary. Nothing here invents a number — every
 * field is copied from a measurement taken elsewhere in the cell.
 */

/** Writes the build provenance and tree-diff evidence for the artifact under
 * test; returns the provenance descriptor the run summary embeds. */
export function writeGitBurstBuildEvidence(input: {
  readonly repoRoot: string;
  readonly entrypoint: string;
}): ReturnType<typeof describeArtifact> {
  const provenance = describeArtifact(input.entrypoint, observeSources(input.repoRoot));
  writeExperimentArtifact(input.repoRoot, "git-burst-build.json", provenance);
  writeExperimentArtifact(
    input.repoRoot,
    "git-burst-tree-diff.patch",
    captureTreeDiff(input.repoRoot),
  );
  return provenance;
}

export interface GitBurstCellWindow {
  readonly name: string;
  readonly windowStartedAtMs: number;
  readonly windowFinishedAtMs: number;
  readonly before: GitBurstAdmissionUsage;
  readonly after: GitBurstAdmissionUsage;
  readonly refresh: GitBurstRefreshSummary;
  readonly extra: Record<string, unknown>;
}

/** Persists one cell's window: refresh classification, cumulative admission
 * deltas (the exact queue-wait/execution split) and the sampled gauges.
 * Returns the admission delta for the caller's asserts. */
export function createGitBurstCellWindowRecorder(input: {
  readonly repoRoot: string;
  readonly poller?: GitBurstGaugePoller;
}): (cell: GitBurstCellWindow) => Promise<GitBurstAdmissionDelta> {
  return async (cell) => {
    const delta = diffGitAdmissionUsage(cell.before.gitProcesses, cell.after.gitProcesses);
    const gauges: GitBurstGaugeWindow =
      input.poller !== undefined
        ? input.poller.window(cell.windowStartedAtMs, cell.windowFinishedAtMs)
        : emptyGaugeWindow("no gauge poller ran for this window");
    writeExperimentArtifact(input.repoRoot, `git-burst-cell-${cell.name}.json`, {
      cell: cell.name,
      windowStartedAtMs: cell.windowStartedAtMs,
      windowFinishedAtMs: cell.windowFinishedAtMs,
      windowDurationMs: cell.windowFinishedAtMs - cell.windowStartedAtMs,
      refresh: cell.refresh,
      admissionDelta: delta,
      gaugeWindow: gauges,
      ...cell.extra,
      environment: GIT_BURST_RUN_ENVIRONMENT,
    });
    return delta;
  };
}

function emptyGaugeWindow(note: string): GitBurstGaugeWindow {
  return {
    samples: 0,
    presentSamples: 0,
    maxShortActive: 0,
    maxShortQueued: 0,
    maxLongActive: 0,
    maxLongQueued: 0,
    environmentMaxima: {
      posix: { active: 0, queued: 0 },
      windows: { active: 0, queued: 0 },
      wsl: { active: 0, queued: 0 },
    },
    note,
  };
}

/** The closing run-summary artifact of the whole cell (identical evidence
 * shape to what earlier burst runs recorded). */
export function gitBurstRunSummary(input: {
  readonly runStartedAtIso: string | null;
  readonly build: ReturnType<typeof summarizeProvenance> | null;
  readonly worktreeRoot: string;
  readonly fixtureSeedCommitHash: string | null;
  readonly warmupColdGitStatusMs: number;
  readonly firstDiagnostics: GitBurstAdmissionUsage;
}): Record<string, unknown> {
  return {
    runStartedAtIso: input.runStartedAtIso,
    runFinishedAtIso: new Date().toISOString(),
    build: input.build,
    planCell: "docs/V2_SERVER_ARCHITECTURE_PRODUCTION_PLAN.md §4 Git burst + B7",
    burstSizes: Object.keys(GIT_BURST_CLIENTS_BY_SIZE),
    clientsBySize: GIT_BURST_CLIENTS_BY_SIZE,
    distinctWorktrees: GIT_BURST_WORKTREE_COUNT,
    worktreeRoot: input.worktreeRoot,
    fixtureSeedCommitHash: input.fixtureSeedCommitHash,
    generatorLines: GIT_BURST_GENERATOR_LINES,
    warmupColdGitStatusMs: input.warmupColdGitStatusMs,
    bounds: GIT_BURST_BOUNDS,
    observedShortPermitLimit: input.firstDiagnostics.gitProcesses.short.limit,
    observedLongPermitLimit: input.firstDiagnostics.gitProcesses.long.limit,
    unsupported: GIT_BURST_RUN_ENVIRONMENT.unsupported,
    protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    environment: GIT_BURST_RUN_ENVIRONMENT,
  };
}
