import type { DirtySetSnapshot } from "../git/dirtySetSnapshot";

/** Work besides the lead that could change the lead's worktree. */
export interface MemberRunActivity {
  /** Work in progress now: member runs, sub-agent items, other sessions. */
  readonly active: number;
  /** Work ever started; grows with every start. */
  readonly started: number;
}

export interface ShellEditTrackerDeps {
  /** Undefined when the worktree is not a git worktree or the read failed. */
  readSnapshot(): Promise<DirtySetSnapshot | undefined>;
  memberActivity(): MemberRunActivity;
  /** The worktree changed while only the lead could have changed it. */
  onLeadEdit(): void;
}

/** Snapshots start at most this often; completions inside the window share one trailing snapshot. */
export const SHELL_SNAPSHOT_INTERVAL_MS = 2_000;

interface Baseline {
  readonly snapshot: DirtySetSnapshot;
  /** `MemberRunActivity.started` when this snapshot started reading, all idle. */
  readonly started: number;
}

/**
 * Notices files the lead changed through shell commands (sed, scripts,
 * generators), which no `file_change` item reports, by checking the worktree
 * rather than guessing from command text. One tracker serves one lead turn:
 * `start` takes the baseline, `commandCompleted` follows each of the lead's
 * own commands, and the tracker compares the dirty set with the previous
 * snapshot, reporting a lead edit when a path became dirty or a dirty path's
 * size or mtime changed. Formatter and codegen commands the lead runs count
 * too, which is acceptable: the lead still did hands-on work a helper could
 * have done.
 *
 * Removals (commits, stash, checkout) never count. Neither does an interval in
 * which other work was active at any point: the activity counters are read
 * before each snapshot and after the next, so work that started and finished
 * in between still disqualifies it, and no snapshot is taken while work is
 * active at its start. Snapshots are single-flight and start at most once per
 * `SHELL_SNAPSHOT_INTERVAL_MS`; completions that land meanwhile coalesce into
 * one follow-up. A failed or unavailable snapshot, a reported edit, or `stop`
 * ends tracking for good.
 */
export class ShellEditTracker {
  private baseline: Baseline | undefined;
  private stopped = false;
  private inFlight = false;
  private rerun = false;
  private lastStartAt = Number.NEGATIVE_INFINITY;
  private trailing: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: ShellEditTrackerDeps) {}

  /** Takes the baseline every later command is compared with. */
  start(): void {
    this.schedule();
  }

  /** One of the lead's own commands finished. */
  commandCompleted(): void {
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    this.baseline = undefined;
    this.rerun = false;
    clearTimeout(this.trailing);
    this.trailing = undefined;
  }

  private schedule(): void {
    if (this.stopped || this.trailing) return;
    if (this.inFlight) {
      this.rerun = true;
      return;
    }
    const wait = this.lastStartAt + SHELL_SNAPSHOT_INTERVAL_MS - Date.now();
    if (wait > 0) {
      this.trailing = setTimeout(() => {
        this.trailing = undefined;
        this.schedule();
      }, wait);
      return;
    }
    this.lastStartAt = Date.now();
    this.inFlight = true;
    void this.snapshotAndCompare()
      .catch(() => this.stop())
      .finally(() => {
        this.inFlight = false;
        if (!this.rerun) return;
        this.rerun = false;
        this.schedule();
      });
  }

  private async snapshotAndCompare(): Promise<void> {
    const activity = this.deps.memberActivity();
    if (activity.active > 0) {
      // No interval that starts or ends here could count: save the read.
      this.baseline = undefined;
      return;
    }
    const snapshot = await this.deps.readSnapshot();
    if (this.stopped) return;
    if (!snapshot) {
      this.stop();
      return;
    }
    const after = this.deps.memberActivity();
    const previous = this.baseline;
    this.baseline = { snapshot, started: activity.started };
    // Idle at the previous start, and still idle with nothing started since.
    if (!previous || after.active > 0 || after.started !== previous.started) return;
    if (!hasNewOrChangedPath(previous.snapshot, snapshot)) return;
    this.stop();
    this.deps.onLeadEdit();
  }
}

/** A path that became dirty or whose fingerprint changed; removals are ignored. */
function hasNewOrChangedPath(previous: DirtySetSnapshot, next: DirtySetSnapshot): boolean {
  for (const [path, fingerprint] of next) {
    if (previous.get(path) !== fingerprint) return true;
  }
  return false;
}
