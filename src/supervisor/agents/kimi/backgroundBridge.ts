import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import { readSessionFileText } from "../base";
import {
  createAcpSubagentCoordinator,
  type AcpSubagentCoordinator,
} from "../acp/subagentCoordinator";
import type { KimiBackgroundLaunch } from "./acpTransform";
import { resolveKimiSessionDir } from "./sessionFiles";

const POLL_INTERVAL_MS = 500;
const SESSION_DIR_TIMEOUT_MS = 30_000;
const AUTOMATIC_TURN_GRACE_MS = 15 * 60 * 1_000;
const TASK_TIMEOUT_MS = 2 * 60 * 60 * 1_000;

interface KimiTaskRecord {
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

export interface KimiBackgroundBridge {
  onBackgroundLaunch(launch: KimiBackgroundLaunch): void;
  dispose(): void;
}

interface KimiBackgroundBridgeDependencies {
  readText?: typeof readSessionFileText;
  resolveSessionDir?: typeof resolveKimiSessionDir;
  pollIntervalMs?: number;
  now?: () => number;
  subagents?: AcpSubagentCoordinator;
}

export function createKimiBackgroundBridge(
  location: ProjectLocation,
  emit: (notification: SessionNotification) => void,
  dependencies: KimiBackgroundBridgeDependencies = {},
): KimiBackgroundBridge {
  const readText = dependencies.readText ?? readSessionFileText;
  const resolveSessionDir = dependencies.resolveSessionDir ?? resolveKimiSessionDir;
  const pollIntervalMs = dependencies.pollIntervalMs ?? POLL_INTERVAL_MS;
  const now = dependencies.now ?? Date.now;
  const subagents = dependencies.subagents ?? createAcpSubagentCoordinator();
  const abortController = new AbortController();
  const claimedAutomaticTurns = new Set<string>();
  const launchedTasks = new Set<string>();

  return {
    onBackgroundLaunch(launch) {
      const launchKey = `${launch.sessionId}:${launch.taskId}`;
      if (launchedTasks.has(launchKey)) return;
      launchedTasks.add(launchKey);
      void monitorBackgroundLaunch({
        location,
        launch,
        emit,
        readText,
        resolveSessionDir,
        pollIntervalMs,
        now,
        signal: abortController.signal,
        claimedAutomaticTurns,
        subagents,
      });
    },
    dispose() {
      abortController.abort();
    },
  };
}

interface MonitorBackgroundLaunchInput {
  location: ProjectLocation;
  launch: KimiBackgroundLaunch;
  emit: (notification: SessionNotification) => void;
  readText: typeof readSessionFileText;
  resolveSessionDir: typeof resolveKimiSessionDir;
  pollIntervalMs: number;
  now: () => number;
  signal: AbortSignal;
  claimedAutomaticTurns: Set<string>;
  subagents: AcpSubagentCoordinator;
}

async function monitorBackgroundLaunch(input: MonitorBackgroundLaunchInput): Promise<void> {
  const startedAt = input.now();
  const sessionDir = await waitForSessionDir(input, startedAt);
  if (!sessionDir || input.signal.aborted) return;

  const wirePath = `${sessionDir}/agents/main/wire.jsonl`;
  const initialWire = await input.readText(input.location, wirePath, 8_000_000);
  const launchTurnId = findLatestKimiWireTurnId(initialWire);
  const taskPath = `${sessionDir}/agents/main/tasks/${input.launch.taskId}`;

  while (!input.signal.aborted && input.now() - startedAt < TASK_TIMEOUT_MS) {
    const task = parseKimiTaskRecord(
      await input.readText(input.location, `${taskPath}.json`, 256_000),
    );
    if (!task || !isTerminalTaskStatus(task.status)) {
      if (!(await waitForNextPoll(input.signal, input.pollIntervalMs))) return;
      continue;
    }

    const output = (
      await input.readText(input.location, `${taskPath}/output.log`, 4_000_000)
    )?.trim();
    const automaticTurn = await waitForAutomaticTurn(input, wirePath, launchTurnId, task.endedAt);
    const emitAutomaticReply =
      automaticTurn !== undefined && !input.claimedAutomaticTurns.has(automaticTurn.completionId);
    if (automaticTurn) input.claimedAutomaticTurns.add(automaticTurn.completionId);
    emitBackgroundCompletion(
      input.emit,
      input.subagents,
      input.launch,
      task.status,
      output,
      emitAutomaticReply ? automaticTurn.text : undefined,
    );
    return;
  }
}

async function waitForSessionDir(
  input: MonitorBackgroundLaunchInput,
  startedAt: number,
): Promise<string | undefined> {
  while (!input.signal.aborted && input.now() - startedAt < SESSION_DIR_TIMEOUT_MS) {
    const sessionDir = await input.resolveSessionDir(input.location, input.launch.sessionId);
    if (sessionDir) return sessionDir;
    if (!(await waitForNextPoll(input.signal, input.pollIntervalMs))) return undefined;
  }
  return undefined;
}

async function waitForAutomaticTurn(
  input: MonitorBackgroundLaunchInput,
  wirePath: string,
  launchTurnId: string | undefined,
  taskEndedAt: number | undefined,
): Promise<KimiCompletedWireTurn | undefined> {
  const startedAt = input.now();
  while (!input.signal.aborted && input.now() - startedAt < AUTOMATIC_TURN_GRACE_MS) {
    const wire = await input.readText(input.location, wirePath, 8_000_000);
    const candidate = parseCompletedKimiWireTurns(wire)
      .filter(
        (turn) =>
          turn.turnId !== launchTurnId &&
          turn.taskIds.includes(input.launch.taskId) &&
          (taskEndedAt === undefined || turn.lastTime >= taskEndedAt),
      )
      .sort((left, right) => left.firstTime - right.firstTime)[0];
    if (candidate) return candidate;
    if (!(await waitForNextPoll(input.signal, input.pollIntervalMs))) return undefined;
  }
  return undefined;
}

function emitBackgroundCompletion(
  emit: (notification: SessionNotification) => void,
  subagents: AcpSubagentCoordinator,
  launch: KimiBackgroundLaunch,
  taskStatus: string,
  output: string | undefined,
  automaticText: string | undefined,
): void {
  const finalText = automaticText?.trim();
  for (const notification of subagents.complete({
    sessionId: launch.sessionId,
    toolCallId: launch.toolCallId,
    status: taskStatus === "completed" ? "completed" : "failed",
    ...(output ? { result: output, childOutput: output } : {}),
    ...(finalText && finalText !== output ? { parentReply: finalText } : {}),
  })) {
    emit(notification);
  }
}

export function parseKimiTaskRecord(text: string | undefined): KimiTaskRecord | undefined {
  if (!text) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isPlainRecord(parsed) || typeof parsed.status !== "string") return undefined;
    return {
      status: parsed.status,
      ...(typeof parsed.endedAt === "number" ? { endedAt: parsed.endedAt } : {}),
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
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isPlainRecord(record) || record.type !== "context.append_loop_event") continue;
    const event = record.event;
    if (!isPlainRecord(event) || typeof event.turnId !== "string") continue;
    const time = typeof record.time === "number" ? record.time : 0;
    const turn = activeTurns.get(event.turnId) ?? {
      firstTime: time,
      lastTime: time,
      textParts: [],
      taskIds: new Set<string>(),
    };
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
        turnId: event.turnId,
        completionId: `${event.turnId}:${turn.firstTime}:${turn.lastTime}`,
        firstTime: turn.firstTime,
        lastTime: turn.lastTime,
        text: turn.textParts.join("").trim(),
        taskIds: [...turn.taskIds],
      });
      activeTurns.delete(event.turnId);
    } else {
      activeTurns.set(event.turnId, turn);
    }
  }
  return completedTurns;
}

function findLatestKimiWireTurnId(text: string | undefined): string | undefined {
  return parseKimiWireTurnIds(text).at(-1);
}

function parseKimiWireTurnIds(text: string | undefined): string[] {
  if (!text) return [];
  const turnIds: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const record: unknown = JSON.parse(line);
      if (!isPlainRecord(record) || !isPlainRecord(record.event)) continue;
      const turnId = record.event.turnId;
      if (typeof turnId === "string" && turnIds.at(-1) !== turnId) turnIds.push(turnId);
    } catch {
      // A partial last line is expected while Kimi is appending to the wire.
    }
  }
  return turnIds;
}

function isTerminalTaskStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function waitForNextPoll(signal: AbortSignal, timeoutMs: number): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, timeoutMs);
    const onAbort = () => {
      clearTimeout(timeout);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
