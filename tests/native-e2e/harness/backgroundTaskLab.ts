import { readFileSync } from "node:fs";
import { nativeE2EFixturePath } from "./paths.ts";

/**
 * Shared NATIVE background-task fixture.
 *
 * One neutral fixture backs the three device-journey surfaces: the authoritative
 * thread snapshot (`history.backgroundTasks`), the live
 * `background_tasks.changed` replayable event, and the opaque session actions
 * (`listThreadSessionActions` / `invokeThreadSessionAction`). The provider is
 * never started, and the payload values (`runKey`, `handle`) are deliberately
 * opaque to clients: the fixture never assumes a token, task id, or provider
 * format beyond the public `BackgroundTask` contract.
 */

export const BACKGROUND_TASK_STAGES = ["initial", "progress", "category-command", "drain"] as const;

export type BackgroundTaskStage = (typeof BACKGROUND_TASK_STAGES)[number];

export interface BackgroundTaskFixtureTask {
  readonly taskId: string;
  readonly kind: "command" | "other";
  readonly category?: "command" | "monitor" | "tool" | "agent" | "workflow" | "other";
  readonly description: string;
  readonly command?: string;
  readonly startedAt?: number;
  readonly lastProgressAt?: number;
  readonly progress?: string;
  readonly stopAction?: {
    readonly id: string;
    readonly payload: Readonly<Record<string, string>>;
  };
  readonly outputAction?: {
    readonly id: string;
    readonly payload: Readonly<Record<string, string>>;
  };
}

interface BackgroundTaskFixture {
  readonly threadId: string;
  readonly actions: { readonly output: string; readonly stop: string };
  readonly output: {
    readonly prefix: string;
    readonly emptyRunKey: string;
    readonly truncatedRunKey: string;
    readonly truncatedTailLength: number;
    readonly truncatedTotalBytes: number;
  };
  readonly stages: {
    readonly initial: { readonly tasks: readonly BackgroundTaskFixtureTask[] };
    readonly progress: { readonly tasks: readonly BackgroundTaskFixtureTask[] };
    readonly categoryCommand: { readonly tasks: readonly BackgroundTaskFixtureTask[] };
    readonly stopped: { readonly tasks: readonly BackgroundTaskFixtureTask[] };
    readonly drained: { readonly tasks: readonly BackgroundTaskFixtureTask[] };
  };
}

export interface BackgroundTaskOutputResult {
  readonly output: string;
  readonly totalBytes: number;
  readonly truncated: boolean;
}

export interface BackgroundTaskLabSnapshot {
  readonly stage: BackgroundTaskStage | "stopped";
  readonly taskIds: readonly string[];
  readonly outputReads: number;
  readonly outputDelivered: number;
  readonly stops: number;
}

const STAGE_FIXTURE_KEYS: Record<BackgroundTaskStage, keyof BackgroundTaskFixture["stages"]> = {
  initial: "initial",
  progress: "progress",
  "category-command": "categoryCommand",
  drain: "drained",
};

let cachedFixture: BackgroundTaskFixture | null = null;

export function loadBackgroundTaskFixture(): BackgroundTaskFixture {
  if (!cachedFixture) {
    cachedFixture = JSON.parse(
      readFileSync(nativeE2EFixturePath("background-tasks.json"), "utf8"),
    ) as BackgroundTaskFixture;
  }
  return cachedFixture;
}

/** Authoritative initial roster installed in the thread snapshot on reset. */
export function initialBackgroundTasks(): readonly BackgroundTaskFixtureTask[] {
  return structuredClone(loadBackgroundTaskFixture().stages.initial.tasks);
}

function cloneTasks(tasks: readonly BackgroundTaskFixtureTask[]): BackgroundTaskFixtureTask[] {
  return structuredClone(tasks) as BackgroundTaskFixtureTask[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function handleOf(action: unknown): string | undefined {
  if (!isRecord(action) || !isRecord(action.payload)) return undefined;
  const handle = action.payload.handle;
  return typeof handle === "string" ? handle : undefined;
}

export class BackgroundTaskLab {
  private readonly fixture = loadBackgroundTaskFixture();
  private stageKey: keyof BackgroundTaskFixture["stages"] = "initial";
  private tasks = cloneTasks(this.fixture.stages.initial.tasks);
  private outputReadsValue = 0;
  private outputDeliveredValue = 0;
  private stopCount = 0;
  private delayNextReadMsValue = 0;

  /** WireLab installs this so a roster change updates the authoritative
   * snapshot and publishes exactly one `background_tasks.changed` event. */
  onChanged: ((tasks: readonly BackgroundTaskFixtureTask[]) => void) | null = null;

  get threadId(): string {
    return this.fixture.threadId;
  }

  get outputActionId(): string {
    return this.fixture.actions.output;
  }

  get stopActionId(): string {
    return this.fixture.actions.stop;
  }

  reset(): void {
    this.stageKey = "initial";
    this.tasks = cloneTasks(this.fixture.stages.initial.tasks);
    this.outputReadsValue = 0;
    this.outputDeliveredValue = 0;
    this.stopCount = 0;
    this.delayNextReadMsValue = 0;
  }

  /** Selects one authoritative stage and returns its task list. The caller
   * publishes the replacement; this method never emits by itself. */
  setStage(stage: BackgroundTaskStage): readonly BackgroundTaskFixtureTask[] {
    this.stageKey = STAGE_FIXTURE_KEYS[stage];
    this.tasks = cloneTasks(this.fixture.stages[this.stageKey].tasks);
    return this.list();
  }

  list(): readonly BackgroundTaskFixtureTask[] {
    return cloneTasks(this.tasks);
  }

  /** The fixture actions an SDK inventory would advertise for the live roster. */
  actions(): readonly { readonly id: string }[] {
    return [{ id: this.fixture.actions.output }, { id: this.fixture.actions.stop }];
  }

  delayNextRead(delayMs: number): void {
    this.delayNextReadMsValue = delayMs;
  }

  snapshot(): BackgroundTaskLabSnapshot {
    return {
      stage: stageForFixtureKey(this.stageKey),
      taskIds: this.tasks.map((task) => task.taskId),
      outputReads: this.outputReadsValue,
      outputDelivered: this.outputDeliveredValue,
      stops: this.stopCount,
    };
  }

  /**
   * Fake `invokeSessionAction` handler. Output reads answer with the latest
   * bounded tail; Stop records the request and confirms it by replacing the
   * roster (never starting a model turn). Payloads are opaque.
   */
  invoke(payload: unknown): unknown {
    const envelope = isRecord(payload) ? payload : {};
    const actionId = typeof envelope.actionId === "string" ? envelope.actionId : "";
    const data = isRecord(envelope.payload) ? envelope.payload : {};
    if (actionId === this.fixture.actions.output) return this.readOutput(data);
    if (actionId === this.fixture.actions.stop) return this.stop(data);
    // Opaque actions this fake SDK does not advertise are benign no-ops; the
    // generic contract-coverage request must not start a turn or invent work.
    return {};
  }

  private readOutput(payload: Record<string, unknown>): unknown {
    this.outputReadsValue += 1;
    const ordinal = this.outputReadsValue;
    const result = this.outputFor(payload, ordinal);
    const delay = this.delayNextReadMsValue;
    this.delayNextReadMsValue = 0;
    if (delay <= 0) {
      this.outputDeliveredValue += 1;
      return result;
    }
    return new Promise<BackgroundTaskOutputResult>((resolve) => {
      const timer = setTimeout(() => {
        this.outputDeliveredValue += 1;
        resolve(result);
      }, delay);
      timer.unref?.();
    });
  }

  private outputFor(payload: Record<string, unknown>, ordinal: number): BackgroundTaskOutputResult {
    const runKey = typeof payload.runKey === "string" ? payload.runKey : "";
    if (runKey === this.fixture.output.emptyRunKey) {
      return { output: "", totalBytes: 0, truncated: false };
    }
    const handle = typeof payload.handle === "string" ? payload.handle : "handle";
    const progress = this.progressForHandle(handle);
    if (runKey === this.fixture.output.truncatedRunKey) {
      const prefix = `${this.fixture.output.prefix}\n${handle}: read ${ordinal}\n`;
      const output = `${prefix}${"tail-".repeat(
        Math.ceil(this.fixture.output.truncatedTailLength / 5),
      )}`.slice(0, this.fixture.output.truncatedTailLength);
      return {
        output,
        totalBytes: this.fixture.output.truncatedTotalBytes,
        truncated: true,
      };
    }
    // Changing, bounded output: every read carries the ordinal it was issued
    // for, so a stale reply can never be mistaken for the latest read.
    const output = `${this.fixture.output.prefix}\n${handle}: read ${ordinal}\nprogress: ${progress}\n`;
    return { output, totalBytes: Buffer.byteLength(output, "utf8"), truncated: false };
  }

  private progressForHandle(handle: string): string {
    const task = this.tasks.find(
      (candidate) =>
        handleOf(candidate.outputAction) === handle || handleOf(candidate.stopAction) === handle,
    );
    const progress = task?.progress;
    return typeof progress === "string" ? progress : "no progress reported";
  }

  private stop(payload: Record<string, unknown>): Record<string, never> {
    this.stopCount += 1;
    const handle = typeof payload.handle === "string" ? payload.handle : "";
    const remaining = this.tasks.filter((task) => handleOf(task.stopAction) !== handle);
    if (remaining.length !== this.tasks.length) {
      this.tasks = cloneTasks(remaining);
      this.stageKey = "stopped";
      this.onChanged?.(this.list());
    }
    return {};
  }
}

function stageForFixtureKey(
  key: keyof BackgroundTaskFixture["stages"],
): BackgroundTaskStage | "stopped" {
  switch (key) {
    case "initial":
      return "initial";
    case "progress":
      return "progress";
    case "categoryCommand":
      return "category-command";
    case "drained":
      return "drain";
    case "stopped":
      return "stopped";
  }
}
