import { summarizeLatencies } from "./profileMetrics.ts";
import type {
  GitProcessAdmissionDiagnostics,
  GitProcessAdmissionEnvironment,
} from "../../../src/shared/hostResourceAdmission.ts";

/**
 * Reader and sampler for the B7 Git-process admission diagnostics that the
 * production headless host exposes through its loopback `/metrics` route
 * (`hostResourceAdmission.gitProcesses`, answered by the running supervisor's
 * on-demand peek). Everything here is observation-only: the probe never forks
 * a supervisor, never mutates admission state, and never guesses a value the
 * host did not report.
 *
 * The honest-measurement rules this module enforces for the Git burst cell:
 *  - An absent `gitProcesses` block (older supervisor artifact) is surfaced as
 *    `GitBurstDiagnosticsUnavailable`, never as zero usage — the cell fails
 *    loudly on it instead of qualifying against a fabricated answer.
 *  - Instantaneous gauges (`active`/`queued`) are sampled, so a drain faster
 *    than the poll interval reads as a measured zero with coverage noted; the
 *    cumulative counters (`admitted`, `queueWaitMs`, `executionMs`, class
 *    high-water `maxActive`) are the exact evidence and are diffed instead.
 *  - Environments the reference host cannot execute (windows/wsl) are reported
 *    as not-exercised, never as qualification evidence.
 */

export interface GitBurstAdmissionUsage {
  readonly resolution: unknown;
  readonly policy: unknown;
  readonly gitProcesses: GitProcessAdmissionDiagnostics;
}

export class GitBurstDiagnosticsUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitBurstDiagnosticsUnavailable";
  }
}

const GIT_BURST_DIAGNOSTICS_TIMEOUT_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Minimal structural guard for the git admission block of `/metrics`. The
 * authoritative zod schema stays in production; this guard only decides
 * presence/absence so the cell can refuse a diagnostics-free host. */
function parseGitAdmission(body: unknown): GitBurstAdmissionUsage {
  if (!isRecord(body)) {
    throw new GitBurstDiagnosticsUnavailable("/metrics returned a non-object body");
  }
  const admission = body.hostResourceAdmission;
  if (!isRecord(admission)) {
    throw new GitBurstDiagnosticsUnavailable(
      "/metrics omitted hostResourceAdmission: the supervisor peek did not answer " +
        "(stopped, unknown, or older-than-B7 supervisor). Rebuild dist/main and retry.",
    );
  }
  const git = admission.gitProcesses;
  if (
    !isRecord(git) ||
    !isRecord(git.short) ||
    !isRecord(git.long) ||
    typeof git.admitted !== "number"
  ) {
    throw new GitBurstDiagnosticsUnavailable(
      "/metrics hostResourceAdmission carries no usable gitProcesses block; the built " +
        "artifact predates the B7 admission diagnostics. Rebuild dist/main and retry.",
    );
  }
  return {
    resolution: admission.resolution,
    policy: admission.policy,
    gitProcesses: git as unknown as GitProcessAdmissionDiagnostics,
  };
}

/** Fetches one admission snapshot from the loopback metrics route. No bearer
 * token: the route is transport-gated to loopback peers by design. */
export async function fetchGitAdmissionUsage(
  httpBaseUrl: string,
  timeoutMs = GIT_BURST_DIAGNOSTICS_TIMEOUT_MS,
): Promise<GitBurstAdmissionUsage> {
  const response = await fetch(new URL("/metrics", httpBaseUrl), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 200) {
    throw new GitBurstDiagnosticsUnavailable(
      `/metrics answered HTTP ${String(response.status)} instead of 200`,
    );
  }
  return parseGitAdmission((await response.json()) as unknown);
}

export type GitBurstEnvironment = GitProcessAdmissionEnvironment;

export interface GitBurstGaugeSample {
  readonly atMs: number;
  readonly present: boolean;
  readonly shortActive: number;
  readonly shortQueued: number;
  readonly longActive: number;
  readonly longQueued: number;
  readonly environments: Readonly<Record<GitBurstEnvironment, { active: number; queued: number }>>;
}

export interface GitBurstGaugeWindow {
  readonly samples: number;
  readonly presentSamples: number;
  readonly maxShortActive: number;
  readonly maxShortQueued: number;
  readonly maxLongActive: number;
  readonly maxLongQueued: number;
  readonly environmentMaxima: Readonly<
    Record<GitBurstEnvironment, { active: number; queued: number }>
  >;
  /** Zero-maximum windows with samples are measured zeros (drain faster than
   * the poll), not missing data; missing data is samples=0. */
  readonly note: string;
}

const EMPTY_ENVIRONMENT = (): Record<GitBurstEnvironment, { active: number; queued: number }> => ({
  posix: { active: 0, queued: 0 },
  windows: { active: 0, queued: 0 },
  wsl: { active: 0, queued: 0 },
});

function absentSample(atMs: number): GitBurstGaugeSample {
  return {
    atMs,
    present: false,
    shortActive: 0,
    shortQueued: 0,
    longActive: 0,
    longQueued: 0,
    environments: EMPTY_ENVIRONMENT(),
  };
}

/** Reads one environment gauge, refusing a snapshot that lost its
 * per-environment block mid-run (the beforeAll gate guarantees presence). */
export function environmentUsage(
  git: GitProcessAdmissionDiagnostics,
  environment: GitBurstEnvironment,
): { active: number; queued: number } {
  const envs = git.environments;
  if (!envs) {
    throw new GitBurstDiagnosticsUnavailable(
      "per-environment gauges disappeared from the diagnostics mid-run",
    );
  }
  return envs[environment];
}

/** Fast loop that samples the instantaneous admission gauges while a burst
 * runs. Polling is best-effort: an unavailable sample is recorded as
 * `present: false` instead of silently flattening to zero. */
export class GitBurstGaugePoller {
  private readonly samples: GitBurstGaugeSample[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly httpBaseUrl: string,
    private readonly intervalMs = 25,
    private readonly requestTimeoutMs = GIT_BURST_DIAGNOSTICS_TIMEOUT_MS,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.inFlight) return;
      this.inFlight = this.poll().finally(() => {
        this.inFlight = null;
      });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    const timer = this.timer;
    this.timer = null;
    if (timer) clearInterval(timer);
    await this.inFlight;
  }

  private async poll(): Promise<void> {
    const atMs = Date.now();
    try {
      const usage = await fetchGitAdmissionUsage(this.httpBaseUrl, this.requestTimeoutMs);
      const git = usage.gitProcesses;
      const envs = git.environments;
      if (!envs) {
        this.samples.push(absentSample(atMs));
        return;
      }
      this.samples.push({
        atMs,
        present: true,
        shortActive: git.short.active,
        shortQueued: git.short.queued,
        longActive: git.long.active,
        longQueued: git.long.queued,
        environments: {
          posix: { ...envs.posix },
          windows: { ...envs.windows },
          wsl: { ...envs.wsl },
        },
      });
    } catch {
      this.samples.push(absentSample(atMs));
    }
  }

  window(fromMs: number, toMs: number): GitBurstGaugeWindow {
    const inWindow = this.samples.filter((sample) => sample.atMs >= fromMs && sample.atMs <= toMs);
    const present = inWindow.filter((sample) => sample.present);
    const environmentMaxima = EMPTY_ENVIRONMENT();
    for (const sample of present) {
      for (const environment of Object.keys(environmentMaxima) as GitBurstEnvironment[]) {
        const usage = sample.environments[environment];
        const maximum = environmentMaxima[environment];
        maximum.active = Math.max(maximum.active, usage.active);
        maximum.queued = Math.max(maximum.queued, usage.queued);
      }
    }
    return {
      samples: inWindow.length,
      presentSamples: present.length,
      maxShortActive: present.reduce((worst, sample) => Math.max(worst, sample.shortActive), 0),
      maxShortQueued: present.reduce((worst, sample) => Math.max(worst, sample.shortQueued), 0),
      maxLongActive: present.reduce((worst, sample) => Math.max(worst, sample.longActive), 0),
      maxLongQueued: present.reduce((worst, sample) => Math.max(worst, sample.longQueued), 0),
      environmentMaxima,
      note:
        present.length === 0
          ? "no usable gauge samples in this window (missing data, not a measured zero)"
          : "instantaneous gauge maxima from a " +
            `${String(this.intervalMs)}ms poll; a fast drain can read as a measured zero. ` +
            "Cumulative counters and class maxActive high-water marks are the exact evidence.",
    };
  }
}

export interface GitBurstAdmissionDelta {
  readonly admitted: number;
  readonly queueFullRefusals: number;
  readonly waitTimeoutRefusals: number;
  readonly cancellations: number;
  readonly slowFetches: number | null;
  readonly short: GitBurstClassDelta;
  readonly long: GitBurstClassDelta;
}

export interface GitBurstClassDelta {
  readonly limit: number;
  /** High-water mark over the whole process lifetime as seen at `after`. */
  readonly maxActiveAfter: number;
  readonly maxActiveGrowth: number;
  readonly queueWaitMsDelta: number;
  readonly maxQueueWaitMsAfter: number | null;
  readonly executionMsDelta: number;
  readonly maxExecutionMsAfter: number | null;
}

interface CumulativeClassView {
  limit: number;
  active: number;
  queued: number;
  maxActive: number;
  queueWaitMs: number;
  maxQueueWaitMs?: number;
  executionMs: number;
  maxExecutionMs?: number;
}

function classView(
  git: GitProcessAdmissionDiagnostics,
  which: "short" | "long",
): CumulativeClassView {
  const view = git[which] as unknown as CumulativeClassView;
  return view;
}

/** Diffs two snapshots of the cumulative admission counters. `slowFetches` and
 * the timing-split fields stay null when the artifact predates them — the cell
 * refuses that upstream, but the diff type stays honest for older evidence. */
export function diffGitAdmissionUsage(
  before: GitProcessAdmissionDiagnostics,
  after: GitProcessAdmissionDiagnostics,
): GitBurstAdmissionDelta {
  const delta = (which: "short" | "long"): GitBurstClassDelta => {
    const beforeView = classView(before, which);
    const afterView = classView(after, which);
    return {
      limit: afterView.limit,
      maxActiveAfter: afterView.maxActive,
      maxActiveGrowth: afterView.maxActive - beforeView.maxActive,
      queueWaitMsDelta: Math.max(0, afterView.queueWaitMs - beforeView.queueWaitMs),
      maxQueueWaitMsAfter: afterView.maxQueueWaitMs ?? null,
      executionMsDelta: Math.max(0, afterView.executionMs - beforeView.executionMs),
      maxExecutionMsAfter: afterView.maxExecutionMs ?? null,
    };
  };
  return {
    admitted: after.admitted - before.admitted,
    queueFullRefusals: after.queueFullRefusals - before.queueFullRefusals,
    waitTimeoutRefusals: after.waitTimeoutRefusals - before.waitTimeoutRefusals,
    cancellations: after.cancellations - before.cancellations,
    slowFetches:
      after.slowFetches === undefined || before.slowFetches === undefined
        ? null
        : after.slowFetches - before.slowFetches,
    short: delta("short"),
    long: delta("long"),
  };
}

export interface GitBurstHeartbeatRecord {
  /** Server WS liveness pings observed in the window (30s default sweep). */
  readonly pings: number;
  /** Offsets of each observed ping from the window start (ms). */
  readonly pingOffsetsMs: readonly number[];
  /** Max observed interval between consecutive pings; null when fewer than
   * two pings arrived — a no-sample, never a zero. */
  readonly maxObservedGapMs: number | null;
  readonly note: string;
}

/** Records server-side WS heartbeat pings (`protocol` pings from the
 * host's 30s liveness sweep) by observing one client socket. The `ws`
 * auto-pong is untouched; this is a pure observer. */
export class GitBurstHeartbeatObserver {
  private readonly arrivalOffsetsMs: number[] = [];
  private startedAtPerfMs: number | null = null;

  constructor(private readonly socket: { on(event: string, listener: () => void): unknown }) {
    socket.on("ping", () => {
      if (this.startedAtPerfMs !== null) {
        this.arrivalOffsetsMs.push(performance.now() - this.startedAtPerfMs);
      }
    });
  }

  start(): void {
    this.startedAtPerfMs = performance.now();
  }

  window(): GitBurstHeartbeatRecord {
    const offsets = [...this.arrivalOffsetsMs];
    const gaps: number[] = [];
    for (let index = 1; index < offsets.length; index += 1) {
      gaps.push((offsets[index] ?? 0) - (offsets[index - 1] ?? 0));
    }
    return {
      pings: offsets.length,
      pingOffsetsMs: offsets.map((offset) => Math.round(offset)),
      maxObservedGapMs: gaps.length > 0 ? Math.round(Math.max(...gaps)) : null,
      note:
        offsets.length < 2
          ? "no-sample: fewer than two server liveness pings arrived in this window " +
            "(the sweep interval is 30000ms); a gap is not claimed from missing data"
          : "observed intervals between consecutive server liveness pings",
    };
  }
}

/** The measurement surfaces this real-host cell cannot honestly exercise.
 * Recorded verbatim into the run artifacts so an absent number is never
 * mistaken for a passing one (plan A0: distinguish unsupported, no samples,
 * and a measured zero). */
export function gitBurstUnsupportedMeasurements(): Record<string, unknown> {
  return {
    hostEventLoopDelay: {
      supported: false,
      reason:
        "The production headless host exposes no event-loop-delay surface: /metrics " +
        "carries process memory and admission usage only, and the node perf NDJSON " +
        "recorder exists only in the managed Electron qualification harness. " +
        "Control-request latency below is the observable effect that surface allows.",
    },
    queuedWorkCancellation: {
      supported: false,
      reason:
        "No client-facing cancellation seam for queued supervisor Git work exists: " +
        "the supervisor-side AbortSignal parameter of execGit has no caller today and " +
        "the remote procedure passthrough propagates no abort. The admission " +
        "cancellation counter is recorded as observed (expected 0 here); this cell " +
        "refuses to claim exercised pre-spawn cancellation.",
    },
    nonPosixEnvironments: {
      supported: false,
      reason:
        "windows/wsl execution environments are not configured on this reference " +
        "host; their gauges are recorded as not-exercised and carry no qualification " +
        "weight. Required Windows/WSL evidence stays a platform gate per plan B7.",
    },
  };
}

/** Latency summary re-export kept local so artifact code reads one vocabulary. */
export function summarizeBurstLatencies(
  samples: readonly number[],
): ReturnType<typeof summarizeLatencies> {
  return summarizeLatencies(samples);
}
