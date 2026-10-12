/**
 * Reusable deterministic structured-provider workload for v2 A0/A1/A3
 * qualification.
 *
 * The fixture (`../fixtures/structured-load-agent.mjs`) is an ACP-speaking
 * child process. This module drives it through the REAL production generic
 * driver (`createAcpGenericAdapter` → `createStructuredSession` →
 * `AcpStructuredSession` + shared canonical mapping) — never through fake event
 * injection — and checks the normalized runtime events.
 *
 * Scope / evidence limits:
 *  - This is adapter-level proof: it exercises the real child process, the real
 *    ACP transport, the real generic instance config shape, and the shared
 *    normalization. It does NOT exercise Electron, the supervisor runtime, the
 *    host, or the remote WS pipeline. The full-supervisor qualification is the
 *    preflight owner's integration (see
 *    `tmp/v2-production/structured-workload-fixture.md`).
 *  - The fixture must run in a real (non-mock) supervisor session: the mock
 *    smoke profile refuses every structured child at the `agentLaunchGuard`
 *    boundary. Never weaken that guard to run this fixture.
 *  - No SQLite writes and no settings writes happen here. The generic instance
 *    is prepared as a normal persisted-schema object (`buildStructuredWorkloadInstance`,
 *    `buildStructuredWorkloadOfflineSeed`) for the launcher owner to seed into
 *    the isolated profile's `settings.json` BEFORE the host starts.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TERMINAL_SIZE } from "@/shared/contracts";
import type {
  AgentInstanceConfig,
  AcpGenericInstanceConfig,
} from "@/shared/contracts/agentInstance";
import { acpGenericKind, parseAcpGenericInstanceConfig } from "@/shared/contracts/agentInstance";
import type { ProjectLocation, RuntimeEvent, Thread, ThreadConfig } from "@/shared/contracts";
import { normalizeSharedSettings, type SharedSettings } from "@/shared/settings";
import { createAcpGenericAdapter } from "@/supervisor/agents/acp-generic";
import { extractRuntimeEvents } from "./frameClassification.ts";
import type {
  StructuredSessionHandle,
  StructuredSessionListener,
  StructuredSessionUpdate,
} from "@/supervisor/agents/base/types";
import type { ManagedCdpClient } from "./managedAppSession.ts";

export const STRUCTURED_WORKLOAD_FIXTURE_PATH = fileURLToPath(
  new URL("../fixtures/structured-load-agent.mjs", import.meta.url),
);

export const STRUCTURED_WORKLOAD_DEFAULT_INSTANCE_ID = "structured-load-fixture";

export const STRUCTURED_WORKLOAD_THREAD_CONFIG: ThreadConfig = {
  model: "structured-load-model",
};

export interface StructuredWorkloadParams {
  /** Marker prefix for every id and payload the fixture emits. */
  readonly marker: string;
  /** Deterministic ACP session id returned by `session/new`. */
  readonly sessionId: string;
  readonly thoughtChunks: number;
  /** Total assistant text chunks per turn; the last one carries the done marker. */
  readonly textChunks: number;
  readonly toolCalls: number;
  /** Exact text length of every emitted chunk. */
  readonly chunkBytes: number;
  /** Max `session/update` frames per second (0 = stdout-drain bound). */
  readonly ratePerSec: number;
  /** Per-prompt wall-clock streaming cap; truncation shows as a missing done marker. */
  readonly durationMs: number;
  readonly selfDestructMs: number;
  readonly resumeCapability: boolean;
  readonly models: readonly string[];
  readonly promptMarkerPath?: string;
  readonly cancelMarkerPath?: string;
  readonly readyMarkerPath?: string;
  readonly exitMarkerPath?: string;
  readonly stderrText?: string;
}

export const DEFAULT_STRUCTURED_WORKLOAD_PARAMS: StructuredWorkloadParams = {
  marker: "slw",
  sessionId: "structured-load-session-1",
  thoughtChunks: 4,
  textChunks: 8,
  toolCalls: 2,
  chunkBytes: 64,
  ratePerSec: 25,
  durationMs: 10_000,
  selfDestructMs: 0,
  resumeCapability: true,
  models: [],
};

export function resolveStructuredWorkloadParams(
  overrides: Partial<StructuredWorkloadParams> = {},
): StructuredWorkloadParams {
  const params: StructuredWorkloadParams = {
    ...DEFAULT_STRUCTURED_WORKLOAD_PARAMS,
    ...overrides,
  };
  assertInteger(params.thoughtChunks, 0, "thoughtChunks");
  assertInteger(params.textChunks, 1, "textChunks");
  assertInteger(params.toolCalls, 0, "toolCalls");
  assertInteger(params.chunkBytes, 32, "chunkBytes");
  if (params.chunkBytes < params.marker.length + 32) {
    throw new Error("chunkBytes is too small for the marker prefix");
  }
  if (!(params.ratePerSec >= 0) || !Number.isFinite(params.ratePerSec)) {
    throw new Error("ratePerSec must be a finite number >= 0");
  }
  assertInteger(params.durationMs, 1, "durationMs");
  assertInteger(params.selfDestructMs, 0, "selfDestructMs");
  if (!/^[a-z0-9][a-z0-9_\-:.]*$/i.test(params.marker)) {
    throw new Error(`marker must be a simple slug: ${params.marker}`);
  }
  return params;
}

function assertInteger(value: number, min: number, label: string): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${label} must be an integer >= ${String(min)} (got ${String(value)})`);
  }
}

export function structuredWorkloadFixtureSha256(): string {
  return createHash("sha256").update(readFileSync(STRUCTURED_WORKLOAD_FIXTURE_PATH)).digest("hex");
}

export function structuredWorkloadHash(params: StructuredWorkloadParams): string {
  const canonical = {
    marker: params.marker,
    sessionId: params.sessionId,
    thoughtChunks: params.thoughtChunks,
    textChunks: params.textChunks,
    toolCalls: params.toolCalls,
    chunkBytes: params.chunkBytes,
    ratePerSec: params.ratePerSec,
    durationMs: params.durationMs,
    selfDestructMs: params.selfDestructMs,
    resumeCapability: params.resumeCapability,
    models: [...params.models],
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

// ── Workload plan (mirrors the fixture's `buildPlan`) ───────────────────────

export type StructuredWorkloadStep =
  | { readonly kind: "thought"; readonly index: number }
  | { readonly kind: "text"; readonly index: number; readonly final: boolean }
  | { readonly kind: "tool_call"; readonly index: number; readonly toolCallId: string }
  | { readonly kind: "tool_update"; readonly index: number; readonly toolCallId: string };

function padIndex(index: number): string {
  return String(index).padStart(4, "0");
}

export function structuredWorkloadChunkText(
  params: StructuredWorkloadParams,
  turn: number,
  kind: "text" | "thought",
  index: number,
  final: boolean,
): string {
  const prefix = `[${params.marker}-t${turn}-${kind}-${padIndex(index)}]`;
  const suffix = final ? ` [${params.marker}-t${turn}-done]` : "";
  const body = `${prefix}${suffix} `;
  return `${body}${"x".repeat(Math.max(0, params.chunkBytes - body.length))}`;
}

export function structuredWorkloadToolCallId(
  params: StructuredWorkloadParams,
  turn: number,
  index: number,
): string {
  return `${params.marker}-t${turn}-tool-${padIndex(index)}`;
}

export function buildStructuredWorkloadPlan(
  params: StructuredWorkloadParams,
  turn: number,
): StructuredWorkloadStep[] {
  const steps: StructuredWorkloadStep[] = [];
  for (let index = 0; index < params.thoughtChunks; index += 1) {
    steps.push({ kind: "thought", index });
  }
  let textIndex = 0;
  let textBudget = Math.max(0, params.textChunks - 1);
  for (let index = 0; index < params.toolCalls; index += 1) {
    if (textBudget > 0) {
      steps.push({ kind: "text", index: textIndex, final: false });
      textIndex += 1;
      textBudget -= 1;
    }
    const toolCallId = structuredWorkloadToolCallId(params, turn, index);
    steps.push({ kind: "tool_call", index, toolCallId });
    if (textBudget > 0) {
      steps.push({ kind: "text", index: textIndex, final: false });
      textIndex += 1;
      textBudget -= 1;
    }
    steps.push({ kind: "tool_update", index, toolCallId });
  }
  while (textBudget > 0) {
    steps.push({ kind: "text", index: textIndex, final: false });
    textIndex += 1;
    textBudget -= 1;
  }
  steps.push({ kind: "text", index: textIndex, final: true });
  return steps;
}

export interface StructuredWorkloadTurnExpectation {
  readonly textMarkers: readonly string[];
  readonly thoughtMarkers: readonly string[];
  readonly toolCallIds: readonly string[];
  readonly assistantRuns: number;
  readonly reasoningRuns: number;
  readonly commandExecutions: number;
}

/** Predicts the canonical item boundaries for a plan (mapper state machine). */
export function describeStructuredWorkloadTurn(
  params: StructuredWorkloadParams,
  turn: number,
): StructuredWorkloadTurnExpectation {
  return describeStructuredWorkloadSteps(
    buildStructuredWorkloadPlan(params, turn),
    params.marker,
    turn,
  );
}

export function describeStructuredWorkloadSteps(
  plan: readonly StructuredWorkloadStep[],
  marker: string,
  turn: number,
): StructuredWorkloadTurnExpectation {
  const textMarkers: string[] = [];
  const thoughtMarkers: string[] = [];
  const toolCallIds: string[] = [];
  let assistantRuns = 0;
  let reasoningRuns = 0;
  let commandExecutions = 0;
  let open: "assistant" | "reasoning" | undefined;
  for (const step of plan) {
    if (step.kind === "thought") {
      thoughtMarkers.push(`${marker}-t${turn}-thought-${padIndex(step.index)}`);
      if (open !== "reasoning") {
        reasoningRuns += 1;
        open = "reasoning";
      }
    } else if (step.kind === "text") {
      textMarkers.push(`${marker}-t${turn}-text-${padIndex(step.index)}`);
      if (open !== "assistant") {
        assistantRuns += 1;
        open = "assistant";
      }
    } else if (step.kind === "tool_call") {
      toolCallIds.push(step.toolCallId);
      commandExecutions += 1;
      open = undefined;
    }
  }
  return {
    textMarkers,
    thoughtMarkers,
    toolCallIds,
    assistantRuns,
    reasoningRuns,
    commandExecutions,
  };
}

// ── Instance config + offline seed (no IO) ──────────────────────────────────

export function buildStructuredWorkloadEnv(
  params: StructuredWorkloadParams,
): Record<string, string> {
  const env: Record<string, string> = {
    STRUCTURED_LOAD_MARKER: params.marker,
    STRUCTURED_LOAD_SESSION_ID: params.sessionId,
    STRUCTURED_LOAD_THOUGHT_CHUNKS: String(params.thoughtChunks),
    STRUCTURED_LOAD_TEXT_CHUNKS: String(params.textChunks),
    STRUCTURED_LOAD_TOOL_CALLS: String(params.toolCalls),
    STRUCTURED_LOAD_CHUNK_BYTES: String(params.chunkBytes),
    STRUCTURED_LOAD_RATE_PER_SEC: String(params.ratePerSec),
    STRUCTURED_LOAD_DURATION_MS: String(params.durationMs),
    STRUCTURED_LOAD_SELF_DESTRUCT_MS: String(params.selfDestructMs),
    STRUCTURED_LOAD_RESUME: params.resumeCapability ? "1" : "0",
  };
  if (params.models.length > 0) env.STRUCTURED_LOAD_MODELS = params.models.join(",");
  if (params.promptMarkerPath) env.STRUCTURED_LOAD_PROMPT_MARKER = params.promptMarkerPath;
  if (params.cancelMarkerPath) env.STRUCTURED_LOAD_CANCEL_MARKER = params.cancelMarkerPath;
  if (params.readyMarkerPath) env.STRUCTURED_LOAD_READY_MARKER = params.readyMarkerPath;
  if (params.exitMarkerPath) env.STRUCTURED_LOAD_EXIT_MARKER = params.exitMarkerPath;
  if (params.stderrText) env.STRUCTURED_LOAD_STDERR_TEXT = params.stderrText;
  return env;
}

export function buildStructuredWorkloadInstance(
  params: StructuredWorkloadParams,
  instanceId: string = STRUCTURED_WORKLOAD_DEFAULT_INSTANCE_ID,
): AgentInstanceConfig {
  const config: AcpGenericInstanceConfig = {
    binary: process.execPath,
    args: [STRUCTURED_WORKLOAD_FIXTURE_PATH],
    env: buildStructuredWorkloadEnv(params),
    cwd: "project",
    authMode: "none",
  };
  return {
    id: instanceId,
    driver: "acp-generic",
    displayName: "Structured Load (fixture)",
    enabled: true,
    config,
  };
}

/**
 * Normal persisted-settings shape for one fixture instance, merged over the
 * supplied base settings. Pure: it writes nothing. The launcher owner must
 * write the result to the isolated profile's `settings.json` before the host
 * starts, while no settings writer is running.
 */
export function buildStructuredWorkloadOfflineSeed(input: {
  readonly instance: AgentInstanceConfig;
  readonly baseSettings?: unknown;
}): SharedSettings {
  const base = normalizeSharedSettings(input.baseSettings ?? {});
  return normalizeSharedSettings({
    ...base,
    agentInstances: { ...base.agentInstances, [input.instance.id]: input.instance },
  });
}

export function structuredWorkloadAgentKind(
  instanceId: string = STRUCTURED_WORKLOAD_DEFAULT_INSTANCE_ID,
): string {
  return acpGenericKind(instanceId);
}

// ── Session driver (real generic ACP adapter) ───────────────────────────────

export interface StructuredWorkloadSession {
  readonly handle: StructuredSessionHandle;
  readonly instance: AgentInstanceConfig;
  readonly adapterKind: string;
  readonly fixtureSha256: string;
  readonly paramsHash: string;
}

export async function createStructuredWorkloadSession(options: {
  readonly params: StructuredWorkloadParams;
  readonly projectLocation: ProjectLocation;
  readonly threadId: string;
  readonly instanceId?: string;
  readonly config?: ThreadConfig;
}): Promise<StructuredWorkloadSession> {
  const instanceId = options.instanceId ?? STRUCTURED_WORKLOAD_DEFAULT_INSTANCE_ID;
  const instance = buildStructuredWorkloadInstance(options.params, instanceId);
  const adapter = createAcpGenericAdapter(instance);
  if (!adapter.createStructuredSession) {
    throw new Error("acp-generic adapter is missing createStructuredSession");
  }
  const handle = await adapter.createStructuredSession({
    threadId: options.threadId,
    projectLocation: options.projectLocation,
    config: options.config ?? STRUCTURED_WORKLOAD_THREAD_CONFIG,
    presentationMode: "gui",
  });
  if (!handle) {
    throw new Error("acp-generic adapter did not create a structured session");
  }
  return {
    handle,
    instance,
    adapterKind: adapter.kind,
    fixtureSha256: structuredWorkloadFixtureSha256(),
    paramsHash: structuredWorkloadHash(options.params),
  };
}

export class StructuredWorkloadRecorder implements StructuredSessionListener {
  readonly events: RuntimeEvent[] = [];
  readonly updates: StructuredSessionUpdate[] = [];
  readonly errors: string[] = [];
  closed = false;

  onRuntimeEvent(event: RuntimeEvent): void {
    this.events.push(event);
  }

  onUpdate(update: StructuredSessionUpdate): void {
    this.updates.push(update);
  }

  onError(errorMessage: string): void {
    this.errors.push(errorMessage);
  }

  onClose(): void {
    this.closed = true;
  }

  eventsOfType<T extends RuntimeEvent["type"]>(type: T): Extract<RuntimeEvent, { type: T }>[] {
    return this.events.filter(
      (event): event is Extract<RuntimeEvent, { type: T }> => event.type === type,
    );
  }

  snapshot(): StructuredWorkloadRecorderSnapshot {
    return summarizeStructuredWorkloadEvents(this.events, {
      errors: this.errors,
      closed: this.closed,
      updates: this.updates,
    });
  }
}

export interface StructuredWorkloadRecorderSnapshot {
  readonly eventCounts: Readonly<Record<string, number>>;
  readonly itemStartedByType: Readonly<Record<string, number>>;
  readonly itemCompletedByType: Readonly<Record<string, number>>;
  readonly deltaByStream: Readonly<Record<string, number>>;
  readonly turnCompletedStates: readonly string[];
  readonly statusTransitions: readonly string[];
  readonly errors: readonly string[];
  readonly closed: boolean;
}

export function summarizeStructuredWorkloadEvents(
  events: readonly RuntimeEvent[],
  extra?: {
    readonly errors?: readonly string[];
    readonly closed?: boolean;
    readonly updates?: readonly StructuredSessionUpdate[];
  },
): StructuredWorkloadRecorderSnapshot {
  const eventCounts: Record<string, number> = {};
  const itemStartedByType: Record<string, number> = {};
  const itemCompletedByType: Record<string, number> = {};
  const deltaByStream: Record<string, number> = {};
  const turnCompletedStates: string[] = [];
  const itemTypes = new Map<string, string>();
  for (const event of events) {
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    if (event.type === "item.started") {
      itemTypes.set(event.itemId, event.itemType);
      itemStartedByType[event.itemType] = (itemStartedByType[event.itemType] ?? 0) + 1;
    } else if (event.type === "item.completed") {
      const itemType = itemTypes.get(event.itemId) ?? "unknown";
      itemCompletedByType[itemType] = (itemCompletedByType[itemType] ?? 0) + 1;
    } else if (event.type === "content.delta") {
      deltaByStream[event.stream] = (deltaByStream[event.stream] ?? 0) + 1;
    } else if (event.type === "turn.completed") {
      turnCompletedStates.push(event.state);
    }
  }
  return {
    eventCounts,
    itemStartedByType,
    itemCompletedByType,
    deltaByStream,
    turnCompletedStates,
    statusTransitions: (extra?.updates ?? []).map((update) => update.status),
    errors: extra?.errors ?? [],
    closed: extra?.closed ?? false,
  };
}

export interface StructuredWorkloadTurnStart {
  readonly startedAtMs: number;
  readonly done: Promise<StructuredWorkloadTurnOutcome>;
}

export interface StructuredWorkloadTurnOutcome {
  readonly turnId: string;
  readonly state: string;
  readonly elapsedMs: number;
}

export async function openStructuredWorkload(options: {
  readonly session: StructuredWorkloadSession;
  readonly recorder: StructuredWorkloadRecorder;
  readonly config?: ThreadConfig;
}): Promise<string> {
  const config = options.config ?? STRUCTURED_WORKLOAD_THREAD_CONFIG;
  options.session.handle.setListener(options.recorder);
  if (!options.session.handle.activate) throw new Error("structured session has no activate()");
  await options.session.handle.activate();
  if (!options.session.handle.openThread) throw new Error("structured session has no openThread()");
  return options.session.handle.openThread(config);
}

export function startStructuredWorkloadTurn(options: {
  readonly session: StructuredWorkloadSession;
  readonly recorder: StructuredWorkloadRecorder;
  readonly prompt: string;
  readonly config?: ThreadConfig;
}): StructuredWorkloadTurnStart {
  const startedAtMs = Date.now();
  const config = options.config ?? STRUCTURED_WORKLOAD_THREAD_CONFIG;
  const handle = options.session.handle;
  const startTurn = handle.startTurn?.bind(handle);
  if (!startTurn) throw new Error("structured session has no startTurn()");
  const done = (async (): Promise<StructuredWorkloadTurnOutcome> => {
    await startTurn(options.prompt, config);
    const completion = [...options.recorder.events]
      .reverse()
      .find((event) => event.type === "turn.completed");
    if (!completion || completion.type !== "turn.completed") {
      throw new Error("turn settled without a turn.completed event");
    }
    return {
      turnId: completion.turnId,
      state: completion.state,
      elapsedMs: Date.now() - startedAtMs,
    };
  })();
  return { startedAtMs, done };
}

export async function waitForStructuredWorkloadCondition(
  predicate: () => boolean,
  options: { readonly label: string; readonly timeoutMs?: number },
): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 5_000);
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${options.label}`);
}

export async function disposeStructuredWorkload(session: StructuredWorkloadSession): Promise<void> {
  await session.handle.dispose();
}

/**
 * Pid the fixture wrote to its ready marker at startup. Production teardown
 * SIGKILLs the owned process group, so a clean exit marker is not available
 * there — liveness of this pid is the teardown evidence.
 */
export function readStructuredWorkloadPid(readyMarkerPath: string): number {
  const raw = readFileSync(readyMarkerPath, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`invalid structured workload pid marker: ${raw}`);
  }
  return pid;
}

export function isStructuredWorkloadProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

// ── Turn verification ───────────────────────────────────────────────────────

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMarkers(
  events: readonly RuntimeEvent[],
  stream: string,
  markerPattern: RegExp,
): string[] {
  const markers: string[] = [];
  for (const event of events) {
    if (event.type !== "content.delta" || event.stream !== stream) continue;
    for (const match of event.delta.matchAll(markerPattern)) {
      const token = match[0];
      if (token) markers.push(token.slice(1, -1));
    }
  }
  return markers;
}

export interface StructuredWorkloadTurnCheck {
  readonly turn: number;
  readonly params: StructuredWorkloadParams;
  readonly events: readonly RuntimeEvent[];
  /**
   * True when the turn was deliberately cut short (cancellation or duration
   * cap): the emitted steps must be a correct prefix of the plan instead of
   * the complete plan.
   */
  readonly truncated?: boolean;
  /** Require the final done marker (default: required unless truncated). */
  readonly requireDone?: boolean;
}

/**
 * Returns a list of concrete problems; empty means the turn normalized as
 * planned. Ordering, counts, marker identity, item lifecycle, and turn
 * completion are all checked against the same plan the fixture executes.
 */
export function checkStructuredWorkloadTurn(input: StructuredWorkloadTurnCheck): string[] {
  const { params, turn, events } = input;
  const problems: string[] = [];
  const plan = buildStructuredWorkloadPlan(params, turn);

  const turnStarted = events.filter((event) => event.type === "turn.started");
  const turnCompleted = events.filter((event) => event.type === "turn.completed");
  if (turnStarted.length !== 1)
    problems.push(`expected 1 turn.started, saw ${String(turnStarted.length)}`);
  if (turnCompleted.length !== 1) {
    problems.push(`expected 1 turn.completed, saw ${String(turnCompleted.length)}`);
  }
  if (turnCompleted.length === 1 && events[events.length - 1]?.type !== "turn.completed") {
    problems.push("turn.completed is not the final runtime event");
  }

  // Reconstruct the emitted step sequence from canonical events. Each
  // thought/text step yields exactly one delta; each tool_call step yields one
  // command_execution item start. The sequence must be an exact prefix of the
  // fixture's plan, which proves global ordering across item kinds.
  const observedKinds: Array<StructuredWorkloadStep["kind"]> = [];
  for (const event of events) {
    if (event.type === "content.delta" && event.stream === "assistant_text") {
      observedKinds.push("text");
    } else if (event.type === "content.delta" && event.stream === "reasoning_text") {
      observedKinds.push("thought");
    } else if (event.type === "item.started" && event.itemType === "command_execution") {
      observedKinds.push("tool_call");
    }
  }
  // `tool_update` steps produce no canonical item boundary of their own.
  const eventSteps = plan.filter((step) => step.kind !== "tool_update");
  const expectedKinds = eventSteps.slice(0, observedKinds.length).map((step) => step.kind);
  if (observedKinds.join(",") !== expectedKinds.join(",")) {
    problems.push(
      `step order mismatch: observed [${observedKinds.join(",")}] vs planned [${expectedKinds.join(",")}]`,
    );
  }
  const truncated = input.truncated ?? false;
  if (!truncated && observedKinds.length !== eventSteps.length) {
    problems.push(
      `incomplete turn: ${String(observedKinds.length)}/${String(eventSteps.length)} steps emitted`,
    );
  }

  const emittedPlan = eventSteps.slice(0, observedKinds.length);
  const expectation = describeStructuredWorkloadSteps(emittedPlan, params.marker, turn);
  const expectedText = expectation.textMarkers.length;
  const expectedThought = expectation.thoughtMarkers.length;

  const deltaStreams: Record<string, number> = { assistant_text: 0, reasoning_text: 0 };
  for (const event of events) {
    if (event.type === "content.delta") {
      deltaStreams[event.stream] = (deltaStreams[event.stream] ?? 0) + 1;
    }
  }
  if (deltaStreams.assistant_text !== expectedText) {
    problems.push(
      `assistant_text deltas: expected ${String(expectedText)}, saw ${String(deltaStreams.assistant_text)}`,
    );
  }
  if (deltaStreams.reasoning_text !== expectedThought) {
    problems.push(
      `reasoning_text deltas: expected ${String(expectedThought)}, saw ${String(deltaStreams.reasoning_text)}`,
    );
  }

  const markerPrefix = escapeRegExp(params.marker);
  const textMarkers = extractMarkers(
    events,
    "assistant_text",
    new RegExp(`\\[${markerPrefix}-t${turn}-text-\\d+\\]`, "g"),
  );
  const thoughtMarkers = extractMarkers(
    events,
    "reasoning_text",
    new RegExp(`\\[${markerPrefix}-t${turn}-thought-\\d+\\]`, "g"),
  );
  if (textMarkers.join(",") !== expectation.textMarkers.join(",")) {
    problems.push(`assistant text marker order mismatch: ${textMarkers.join(",")}`);
  }
  if (thoughtMarkers.join(",") !== expectation.thoughtMarkers.join(",")) {
    problems.push(`reasoning marker order mismatch: ${thoughtMarkers.join(",")}`);
  }

  const startedByType = new Map<string, number>();
  const itemStartedIndex = new Map<string, number>();
  const lifecycleProblems: string[] = [];
  events.forEach((event, index) => {
    if (event.type === "item.started") {
      startedByType.set(event.itemType, (startedByType.get(event.itemType) ?? 0) + 1);
      itemStartedIndex.set(event.itemId, index);
    } else if (event.type === "content.delta") {
      const startedAt = itemStartedIndex.get(event.itemId);
      if (startedAt === undefined)
        lifecycleProblems.push(`delta before item start: ${event.itemId}`);
      else if (startedAt > index)
        lifecycleProblems.push(`delta precedes item start: ${event.itemId}`);
    }
  });
  for (const [itemId, startedAt] of itemStartedIndex) {
    const completedAt = events.findIndex(
      (event) => event.type === "item.completed" && event.itemId === itemId,
    );
    if (completedAt === -1) lifecycleProblems.push(`item never completed: ${itemId}`);
    else if (completedAt < startedAt)
      lifecycleProblems.push(`item completed before start: ${itemId}`);
  }
  problems.push(...lifecycleProblems);

  const expectedStarted: Record<string, number> = {
    user_message: 1,
    reasoning: expectation.reasoningRuns,
    assistant_message: expectation.assistantRuns,
    command_execution: expectation.commandExecutions,
  };
  for (const [itemType, expected] of Object.entries(expectedStarted)) {
    const actual = startedByType.get(itemType) ?? 0;
    if (actual !== expected) {
      problems.push(
        `item.started ${itemType}: expected ${String(expected)}, saw ${String(actual)}`,
      );
    }
  }
  for (const itemType of startedByType.keys()) {
    if (!(itemType in expectedStarted)) {
      problems.push(`unexpected item.started type: ${itemType}`);
    }
  }

  const toolMarkers: string[] = [];
  for (const event of events) {
    if (event.type !== "item.started" || event.itemType !== "command_execution") continue;
    const payload = event.payload as { args?: { marker?: unknown } } | undefined;
    const marker = payload?.args?.marker;
    if (typeof marker === "string") toolMarkers.push(marker);
  }
  if (toolMarkers.join(",") !== expectation.toolCallIds.join(",")) {
    problems.push(`tool call order mismatch: ${toolMarkers.join(",")}`);
  }
  for (const toolCallId of expectation.toolCallIds) {
    const completed = events.find(
      (event) =>
        event.type === "item.completed" &&
        JSON.stringify(event.payload ?? null).includes(toolCallId),
    );
    if (!completed) problems.push(`no completed tool payload for ${toolCallId}`);
  }

  const assistantText = events
    .filter(
      (event): event is Extract<RuntimeEvent, { type: "content.delta" }> =>
        event.type === "content.delta" && event.stream === "assistant_text",
    )
    .map((event) => event.delta)
    .join("");
  const doneMarker = `${params.marker}-t${turn}-done`;
  const hasDone = assistantText.includes(doneMarker);
  if (!truncated && (input.requireDone ?? true) && !hasDone) {
    problems.push(`missing completion marker ${doneMarker} (duration cap or truncation)`);
  }

  return problems;
}

// ── Managed-cell integration (offline seed + normal supervisor launch) ──────
//
// The managed preflight cell runs this fixture as an ordinary GUI thread:
// the deterministic ACP instance is seeded into the isolated profile's
// `settings.json` BEFORE the host starts (the managed settings merge preserves
// on-disk `acp-generic` instances and filters renderer-originated ones), the
// thread row is seeded through the app's own bridge, and the session is started
// through the production `startThread` supervisor procedure. Stop, disposal and
// child join use the production `interruptThread` / `closeThread` procedures.
// No mock guard is weakened: the cell runs in a real-mode isolated profile and
// the fixture is the only binary any structured thread can reach.

/** Cell spec block that turns a qualification cell into a structured-workload cell. */
export interface StructuredWorkloadCellSpec {
  /** Instance id in the isolated profile's settings (default `structured-load-fixture`). */
  readonly instanceId: string;
  /** Thread id for the seeded GUI row. */
  readonly threadId: string;
  readonly prompt: string;
  /** Minimum canonical GUI frames the cell must observe before Stop (>= 1). */
  readonly minCanonicalFrames: number;
  /** Per-run fixture parameter overrides; hashed as the workload identity. */
  readonly params: Partial<StructuredWorkloadParams>;
}

export const DEFAULT_STRUCTURED_WORKLOAD_CELL_SPEC: Omit<StructuredWorkloadCellSpec, "params"> = {
  instanceId: STRUCTURED_WORKLOAD_DEFAULT_INSTANCE_ID,
  threadId: "v2q-slw-01",
  prompt: "v2q structured workload",
  minCanonicalFrames: 25,
};

/**
 * The smoke launcher's isolated profile data dir is `<sessionRoot>/data` and the
 * app's (and supervisor's) settings file is `<baseDir>/settings.json`; seed it
 * before spawning the launcher, while no settings writer can be running.
 */
export const STRUCTURED_WORKLOAD_PROFILE_DATA_DIR = "data";

export function structuredWorkloadSettingsPath(sessionRoot: string): string {
  return join(sessionRoot, STRUCTURED_WORKLOAD_PROFILE_DATA_DIR, "settings.json");
}

export interface StructuredWorkloadMarkers {
  readonly directory: string;
  readonly promptMarkerPath: string;
  readonly cancelMarkerPath: string;
  readonly readyMarkerPath: string;
  readonly exitMarkerPath: string;
}

/** Creates the (absolute) marker directory the fixture writes pid/cancel evidence into. */
export function prepareStructuredWorkloadMarkers(sessionRoot: string): StructuredWorkloadMarkers {
  const directory = join(sessionRoot, "structured-workload");
  mkdirSync(directory, { recursive: true });
  return {
    directory,
    promptMarkerPath: join(directory, "prompt.marker"),
    cancelMarkerPath: join(directory, "cancel.marker"),
    readyMarkerPath: join(directory, "ready.marker"),
    exitMarkerPath: join(directory, "exit.marker"),
  };
}

/**
 * Writes the normalized persisted-settings shape (defaults + the one fixture
 * instance) to the isolated profile's `settings.json`. Must run before the host
 * starts; the caller re-reads the file after launch to prove the instance
 * survived every settings merge on the way up.
 */
export function writeStructuredWorkloadSettingsSeed(input: {
  readonly settingsPath: string;
  readonly instance: AgentInstanceConfig;
  readonly baseSettings?: unknown;
}): SharedSettings {
  const settings = buildStructuredWorkloadOfflineSeed(input);
  mkdirSync(dirname(input.settingsPath), { recursive: true });
  writeFileSync(input.settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  return settings;
}

/** Reads the fixture instance back from the isolated profile's settings file. */
export function readSeededStructuredWorkloadInstance(input: {
  readonly settingsPath: string;
  readonly instanceId: string;
}): AgentInstanceConfig {
  let parsed: { agentInstances?: Record<string, AgentInstanceConfig> };
  try {
    parsed = JSON.parse(readFileSync(input.settingsPath, "utf8")) as typeof parsed;
  } catch (error) {
    throw new Error(
      `structured workload settings seed is unreadable at ${input.settingsPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  const instance = parsed.agentInstances?.[input.instanceId];
  if (!instance) {
    throw new Error(
      `structured workload instance ${input.instanceId} is absent from ${input.settingsPath}; ` +
        "the offline seed did not survive host startup",
    );
  }
  if (instance.driver !== "acp-generic") {
    throw new Error(
      `structured workload instance ${input.instanceId} has driver ${instance.driver}, expected acp-generic`,
    );
  }
  parseAcpGenericInstanceConfig(instance.config);
  return instance;
}

/** Schema-shaped GUI thread row for the fixture instance (seeded via dbUpsertThread). */
export function buildStructuredWorkloadThreadRow(input: {
  readonly projectId: string;
  readonly threadId: string;
  readonly instanceId: string;
  readonly now?: string;
}): Thread {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.threadId,
    projectId: input.projectId,
    title: "V2Q structured workload producer",
    agentKind: acpGenericKind(input.instanceId),
    agentInstanceId: input.instanceId,
    config: { ...STRUCTURED_WORKLOAD_THREAD_CONFIG },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: now,
    updatedAt: now,
  };
}

export async function seedStructuredWorkloadThreadRow(input: {
  readonly cdp: ManagedCdpClient;
  readonly row: Thread;
}): Promise<void> {
  await input.cdp.invokeProcedure("dbUpsertThread", input.row);
}

export interface StructuredWorkloadLaunchEvidence {
  readonly threadId: string;
  readonly startedAtMs: number;
  readonly result: unknown;
}

/**
 * Starts the fixture through the production supervisor procedure the app's own
 * bridge calls (`startThread`), with the seeded `acp-generic` instance and GUI
 * presentation. No in-process seam and no fake event injection.
 */
export async function launchStructuredWorkloadThread(input: {
  readonly cdp: ManagedCdpClient;
  readonly projectLocation: ProjectLocation;
  readonly spec: StructuredWorkloadCellSpec;
}): Promise<StructuredWorkloadLaunchEvidence> {
  const startedAtMs = Date.now();
  const result = await input.cdp.invokeProcedure("startThread", {
    threadId: input.spec.threadId,
    projectLocation: input.projectLocation,
    agentKind: acpGenericKind(input.spec.instanceId),
    agentInstanceId: input.spec.instanceId,
    config: { ...STRUCTURED_WORKLOAD_THREAD_CONFIG },
    prompt: input.spec.prompt,
    initialSize: DEFAULT_TERMINAL_SIZE,
    presentationMode: "gui",
  });
  return { threadId: input.spec.threadId, startedAtMs, result };
}

/** The app's normal Stop path: composer Stop calls exactly this procedure. */
export async function interruptStructuredWorkloadThread(input: {
  readonly cdp: ManagedCdpClient;
  readonly threadId: string;
}): Promise<void> {
  await input.cdp.invokeProcedure("interruptThread", { threadId: input.threadId });
}

/**
 * Disposes the structured session through the production `closeThread`
 * procedure; the supervisor waits for the owned process group to exit.
 */
export async function closeStructuredWorkloadThread(input: {
  readonly cdp: ManagedCdpClient;
  readonly threadId: string;
}): Promise<void> {
  await input.cdp.invokeProcedure("closeThread", { threadId: input.threadId });
}

export interface StructuredWorkloadThreadStatus {
  readonly present: boolean;
  readonly status: string | null;
  readonly attention: string | null;
  readonly errorMessage: string | null;
}

/** Reads the renderer store's live row for the fixture thread. */
export function readStructuredWorkloadThreadStatus(input: {
  readonly cdp: ManagedCdpClient;
  readonly threadId: string;
}): Promise<StructuredWorkloadThreadStatus> {
  return input.cdp.evaluate<StructuredWorkloadThreadStatus>(
    `(() => {` +
      ` const store = window.__poracodeDev?.stores?.app;` +
      ` if (!store) return { present: false, status: null, attention: null, errorMessage: null };` +
      ` const thread = store.getState().threads.find((row) => row.id === ${JSON.stringify(input.threadId)});` +
      ` if (!thread) return { present: false, status: null, attention: null, errorMessage: null };` +
      ` return { present: true, status: thread.status ?? null, attention: thread.attention ?? null,` +
      ` errorMessage: thread.errorMessage ?? null }; })()`,
  );
}

export interface StructuredWorkloadStatusEvidence {
  readonly accepted: StructuredWorkloadThreadStatus;
  readonly waitedMs: number;
  readonly observed: readonly string[];
}

export async function waitForStructuredWorkloadThreadStatus(input: {
  readonly cdp: ManagedCdpClient;
  readonly threadId: string;
  readonly label: string;
  readonly accept: (status: StructuredWorkloadThreadStatus) => boolean;
  readonly timeoutMs?: number;
}): Promise<StructuredWorkloadStatusEvidence> {
  const timeoutMs = input.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  const observed: string[] = [];
  let last: StructuredWorkloadThreadStatus = {
    present: false,
    status: null,
    attention: null,
    errorMessage: null,
  };
  for (;;) {
    last = await readStructuredWorkloadThreadStatus({
      cdp: input.cdp,
      threadId: input.threadId,
    });
    const token = last.present ? `${last.status ?? "null"}/${last.attention ?? "null"}` : "absent";
    if (observed[observed.length - 1] !== token) observed.push(token);
    if (input.accept(last)) {
      return { accepted: last, waitedMs: Date.now() - startedAt, observed };
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `structured workload thread ${input.threadId} did not reach ${input.label} within ${String(
      timeoutMs,
    )}ms (last=${JSON.stringify(last)}, observed=${observed.join(" -> ")})`,
  );
}

// ── Authoritative wire status (host → interested WS client) ─────────────────
//
// The renderer store is an interest-filtered UI surface; the authoritative
// provider status is the `thread-state` event the host emits to a subscribed
// WS client that declared interest in the thread. The qualification cell gates
// the provider status on this wire evidence and records the renderer store row
// alongside it.

export interface StructuredWorkloadWireStatus {
  readonly present: boolean;
  readonly status: string | null;
  readonly attention: string | null;
  readonly errorMessage: string | null;
  /** `thread-state` events observed for this thread across all sources. */
  readonly eventCount: number;
  /** Distinct status/attention transitions in arrival order. */
  readonly observed: readonly string[];
  readonly sourceLabels: readonly string[];
}

export function collectStructuredWorkloadWireStatus(
  sources: readonly StructuredWorkloadFrameSource[],
  threadId: string,
): StructuredWorkloadWireStatus {
  let present = false;
  let status: string | null = null;
  let attention: string | null = null;
  let errorMessage: string | null = null;
  let eventCount = 0;
  const observed: string[] = [];
  const sourceLabels: string[] = [];
  for (const source of sources) {
    let sourceCount = 0;
    for (const entry of source.receivedEvents()) {
      if (entry.type !== "thread-state" || entry.event.threadId !== threadId) continue;
      sourceCount += 1;
      eventCount += 1;
      present = true;
      status = typeof entry.event.status === "string" ? entry.event.status : status;
      attention = typeof entry.event.attention === "string" ? entry.event.attention : attention;
      errorMessage =
        typeof entry.event.errorMessage === "string" ? entry.event.errorMessage : errorMessage;
      const token = `${status ?? "null"}/${attention ?? "null"}`;
      if (observed[observed.length - 1] !== token) observed.push(token);
    }
    if (sourceCount > 0) sourceLabels.push(source.label);
  }
  return { present, status, attention, errorMessage, eventCount, observed, sourceLabels };
}

export async function waitForStructuredWorkloadWireStatus(input: {
  readonly sources: readonly StructuredWorkloadFrameSource[];
  readonly threadId: string;
  readonly label: string;
  readonly accept: (status: StructuredWorkloadWireStatus) => boolean;
  readonly timeoutMs?: number;
}): Promise<{ readonly accepted: StructuredWorkloadWireStatus; readonly waitedMs: number }> {
  const timeoutMs = input.timeoutMs ?? 60_000;
  const startedAt = Date.now();
  for (;;) {
    const status = collectStructuredWorkloadWireStatus(input.sources, input.threadId);
    if (input.accept(status)) return { accepted: status, waitedMs: Date.now() - startedAt };
    if (Date.now() - startedAt >= timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const last = collectStructuredWorkloadWireStatus(input.sources, input.threadId);
  throw new Error(
    `structured workload thread ${input.threadId} did not reach wire status ${input.label} ` +
      `within ${String(timeoutMs)}ms (last=${JSON.stringify(last)})`,
  );
}

/** Bounded wait for the fixture's ready marker (written on process start). */
export async function waitForStructuredWorkloadPid(input: {
  readonly markerPath: string;
  readonly timeoutMs?: number;
  readonly readMarker?: (path: string) => string | null;
}): Promise<number> {
  const timeoutMs = input.timeoutMs ?? 15_000;
  const readMarker = input.readMarker ?? readStructuredWorkloadMarker;
  const startedAt = Date.now();
  for (;;) {
    const raw = readMarker(input.markerPath);
    if (raw !== null) {
      const pid = Number.parseInt(raw, 10);
      if (Number.isInteger(pid) && pid > 0) return pid;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(
        `structured workload ready marker ${input.markerPath} carried no pid within ${String(
          timeoutMs,
        )}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Canonical GUI runtime event types: the same bulk set the client frame
 * classifier counts (`frameClassification.ts`), mirrored here so the producer
 * count is computed per thread without conflating PTY terminal frames or
 * inactive catalog rows.
 */
export const CANONICAL_GUI_BULK_EVENT_TYPES = [
  "content.delta",
  "item.started",
  "item.updated",
  "item.completed",
] as const;

const CANONICAL_GUI_BULK_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  CANONICAL_GUI_BULK_EVENT_TYPES,
);

export interface StructuredWorkloadRuntimeEvent {
  readonly type: string;
  readonly event: Record<string, unknown>;
}

/** The subset of `ProfileClient` the frame accounting needs. */
export interface StructuredWorkloadFrameSource {
  readonly label: string;
  receivedEvents(): readonly StructuredWorkloadRuntimeEvent[];
}

export interface CanonicalGuiFrameCount {
  readonly total: number;
  readonly byType: Readonly<Record<string, number>>;
}

/**
 * Counts canonical GUI bulk events attributed to `threadId`, unwrapping the
 * real host transport shapes (`thread-runtime-event`, `thread-runtime-events`,
 * `thread-runtime-events-multi`) through the same extractor the frame
 * classifier uses, so a batched frame counts per event/thread instead of being
 * invisible to a top-level `threadId` check.
 */
export function canonicalGuiEventCounts(
  events: readonly StructuredWorkloadRuntimeEvent[],
  threadId: string,
): CanonicalGuiFrameCount {
  const byType: Record<string, number> = {};
  let total = 0;
  for (const entry of events) {
    for (const ref of extractRuntimeEvents(entry.event)) {
      if (ref.threadId !== threadId) continue;
      const type = typeof ref.event.type === "string" ? ref.event.type : "unknown";
      if (!CANONICAL_GUI_BULK_EVENT_TYPE_SET.has(type)) continue;
      total += 1;
      byType[type] = (byType[type] ?? 0) + 1;
    }
  }
  return { total, byType };
}

export interface CanonicalGuiFrameEvidence {
  readonly threadId: string;
  readonly total: number;
  readonly byType: Readonly<Record<string, number>>;
  readonly sources: ReadonlyArray<{
    readonly label: string;
    readonly total: number;
    readonly byType: Readonly<Record<string, number>>;
  }>;
}

export function collectCanonicalGuiFrameEvidence(
  sources: readonly StructuredWorkloadFrameSource[],
  threadId: string,
): CanonicalGuiFrameEvidence {
  const byType: Record<string, number> = {};
  let total = 0;
  const sourceEvidence: CanonicalGuiFrameEvidence["sources"][number][] = [];
  for (const source of sources) {
    const counts = canonicalGuiEventCounts(source.receivedEvents(), threadId);
    total += counts.total;
    for (const [type, count] of Object.entries(counts.byType)) {
      byType[type] = (byType[type] ?? 0) + count;
    }
    sourceEvidence.push({ label: source.label, total: counts.total, byType: counts.byType });
  }
  return { threadId, total, byType, sources: sourceEvidence };
}

/**
 * Waits until the connected clients observed at least `minTotal` canonical GUI
 * frames for the structured producer. PTY terminal-output frames and fixture
 * catalog rows never satisfy this gate: only `content.delta` / `item.*` events
 * attributed to the structured thread id count.
 */
export async function waitForCanonicalGuiFrames(input: {
  readonly sources: readonly StructuredWorkloadFrameSource[];
  readonly threadId: string;
  readonly minTotal: number;
  readonly label: string;
  readonly timeoutMs?: number;
}): Promise<CanonicalGuiFrameEvidence> {
  const timeoutMs = input.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;
  let last = collectCanonicalGuiFrameEvidence(input.sources, input.threadId);
  for (;;) {
    if (last.total >= input.minTotal) return last;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
    last = collectCanonicalGuiFrameEvidence(input.sources, input.threadId);
  }
  throw new Error(
    `structured workload ${input.threadId} produced ${String(last.total)} canonical GUI frames ` +
      `(wanted >= ${String(input.minTotal)} for ${input.label}); ` +
      "inactive catalog rows and PTY terminal frames do not count as structured load",
  );
}

/** Reads a fixture marker file; null when the file is absent or unreadable. */
export function readStructuredWorkloadMarker(path: string): string | null {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

/**
 * Joins the fixture child: waits for the pid recorded in the ready marker to
 * stop being alive. `isAlive` is injectable for unit tests; production calls
 * use the real pid liveness probe.
 */
export async function waitForStructuredWorkloadExit(input: {
  readonly pid: number;
  readonly timeoutMs?: number;
  readonly isAlive?: (pid: number) => boolean;
}): Promise<{ readonly pid: number; readonly waitedMs: number; readonly exited: true }> {
  const timeoutMs = input.timeoutMs ?? 30_000;
  const isAlive = input.isAlive ?? isStructuredWorkloadProcessAlive;
  const startedAt = Date.now();
  for (;;) {
    if (!isAlive(input.pid)) {
      return { pid: input.pid, waitedMs: Date.now() - startedAt, exited: true };
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(
        `structured workload child pid ${String(input.pid)} did not exit within ${String(
          timeoutMs,
        )}ms after thread disposal`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
