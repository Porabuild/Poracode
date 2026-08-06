/**
 * Readers for the on-disk state Kimi's engine writes next to a session: the
 * per-task `<taskId>.json` record and the `wire.jsonl` journal. Kept separate
 * from the polling bridge (backgroundBridge.ts) so the engine's file formats —
 * which differ between the legacy and v2 engines — can change and be tested
 * without touching the poll/emit orchestration.
 */

export interface KimiTaskRecord {
  status: string;
  endedAt?: number;
}

export interface KimiCompletedWireTurn {
  turnId: string;
  completionId: string;
  firstTime: number;
  lastTime: number;
  text: string;
  taskIds: string[];
}

/**
 * Terminal v2 task statuses: `completed | failed | killed | timed_out |
 * lost` (the v2 engine's TERMINAL_STATUSES). `cancelled` is retained for
 * older task records written by previous engines.
 */
const TERMINAL_TASK_STATUSES = new Set([
  "completed",
  "failed",
  "killed",
  "timed_out",
  "lost",
  "cancelled",
]);

export function isTerminalTaskStatus(status: string): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

/**
 * Parse a `<taskId>.json` task record. v2 writes camelCase (`endedAt`,
 * possibly `null`); legacy snake_case records (`ended_at`) can still be on
 * disk mid-migration, so both spellings are read.
 */
export function parseKimiTaskRecord(text: string | undefined): KimiTaskRecord | undefined {
  if (!text) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isPlainRecord(parsed) || typeof parsed.status !== "string") return undefined;
    const endedAt =
      typeof parsed.endedAt === "number"
        ? parsed.endedAt
        : typeof parsed.ended_at === "number"
          ? parsed.ended_at
          : undefined;
    return {
      status: parsed.status,
      ...(endedAt !== undefined ? { endedAt } : {}),
    };
  } catch {
    return undefined;
  }
}

export function parseCompletedKimiWireTurns(text: string | undefined): KimiCompletedWireTurn[] {
  if (!text) return [];
  const activeTurns = new Map<
    string,
    {
      firstTime: number;
      lastTime: number;
      textParts: string[];
      taskIds: Set<string>;
    }
  >();
  const completedTurns: KimiCompletedWireTurn[] = [];
  const pendingTaskIds = new Set<string>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isPlainRecord(record)) continue;
    if (record.type === "turn.prompt" && isPlainRecord(record.origin)) {
      if (record.origin.kind === "task" && typeof record.origin.taskId === "string") {
        pendingTaskIds.add(record.origin.taskId);
      }
      continue;
    }
    if (record.type !== "context.append_loop_event") continue;
    const event = record.event;
    if (
      !isPlainRecord(event) ||
      (typeof event.turnId !== "string" && typeof event.turnId !== "number")
    ) {
      continue;
    }
    const turnId = String(event.turnId);
    const time = typeof record.time === "number" ? record.time : 0;
    let turn = activeTurns.get(turnId);
    if (!turn) {
      // A turn's first event claims the task ids announced by the
      // `turn.prompt` records seen since the previous turn started.
      turn = { firstTime: time, lastTime: time, textParts: [], taskIds: new Set(pendingTaskIds) };
      pendingTaskIds.clear();
    }
    turn.firstTime = Math.min(turn.firstTime, time);
    turn.lastTime = Math.max(turn.lastTime, time);
    if (event.type === "content.part" && isPlainRecord(event.part)) {
      if (event.part.type === "text" && typeof event.part.text === "string") {
        turn.textParts.push(event.part.text);
      }
    }
    if (event.type === "tool.call" && isPlainRecord(event.args)) {
      const path = event.args.path;
      if (typeof path === "string") {
        const taskId = /[/\\]tasks[/\\]([^/\\]+)[/\\]output\.log$/i.exec(path)?.[1];
        if (taskId) turn.taskIds.add(taskId);
      }
      if (event.name === "TaskOutput" && typeof event.args.task_id === "string") {
        turn.taskIds.add(event.args.task_id);
      }
    }
    if (event.type === "step.end" && event.finishReason === "end_turn") {
      completedTurns.push({
        turnId,
        completionId: `${turnId}:${turn.firstTime}:${turn.lastTime}`,
        firstTime: turn.firstTime,
        lastTime: turn.lastTime,
        text: turn.textParts.join("").trim(),
        taskIds: [...turn.taskIds],
      });
      activeTurns.delete(turnId);
    } else {
      activeTurns.set(turnId, turn);
    }
  }
  return completedTurns;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
