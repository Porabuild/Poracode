import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import { readSessionFileText } from "../base";
import {
  createAcpSubagentCoordinator,
  type AcpSubagentCoordinator,
} from "../acp/subagentCoordinator";
import type { KimiBackgroundLaunch } from "./acpTransform";
import {
  isTerminalTaskStatus,
  parseCompletedKimiWireTurns,
  parseKimiTaskRecord,
  type KimiCompletedWireTurn,
} from "./kimiWireJournal";
import { resolveKimiSessionDir } from "./sessionFiles";

const POLL_INTERVAL_MS = 500;
const SESSION_DIR_TIMEOUT_MS = 30_000;
/**
 * How long to poll the session's wire journal for the model's follow-up
 * reply turn after the task file reports a terminal status.
 *
 * With the v2 engine (0.33.0+) a detached task settling while the session
 * is idle makes the engine start a spontaneous notification turn — but the
 * acp-server forwards events of client-initiated turns ONLY, so that turn
 * never reaches us over ACP. The on-disk wire journal is the sole place it
 * can be observed, and disk polling is the only completion signal. When no
 * turn references the task within this window (e.g. the model acknowledges
 * a killed task without calling TaskOutput), the completion is emitted
 * without a parent reply.
 */
const AUTOMATIC_TURN_GRACE_MS = 15 * 60 * 1_000;
const TASK_TIMEOUT_MS = 2 * 60 * 60 * 1_000;

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
    const automaticTurn = await waitForAutomaticTurn(input, wirePath, task.endedAt);
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
  taskEndedAt: number | undefined,
): Promise<KimiCompletedWireTurn | undefined> {
  const startedAt = input.now();
  while (!input.signal.aborted && input.now() - startedAt < AUTOMATIC_TURN_GRACE_MS) {
    const wire = await input.readText(input.location, wirePath, 8_000_000);
    const candidate = parseCompletedKimiWireTurns(wire)
      .filter(
        (turn) =>
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
  // Only `completed` is a success; `failed`, `killed`, `timed_out`, `lost`
  // (and legacy `cancelled`) all surface the subagent card as failed.
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
