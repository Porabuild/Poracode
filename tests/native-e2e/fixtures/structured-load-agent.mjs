#!/usr/bin/env node
/**
 * Deterministic structured-provider workload agent for v2 production-plan
 * A0/A1/A3 qualification. Fixture-only: not production code, no network, no
 * credentials, no real provider binary.
 *
 * It speaks newline-delimited JSON-RPC ACP over stdio well enough to be driven
 * by the real `AcpStructuredSession` (via the generic `acp-generic` driver) and
 * emits a fixed, marker-tagged text/thought/tool schedule at a calibrated rate.
 * The same byte-identical schedule is produced on any arm, so R0 and a
 * candidate arm run one unchanged workload.
 *
 * Environment contract (all optional):
 *   STRUCTURED_LOAD_MARKER            marker prefix for every id/payload ("slw")
 *   STRUCTURED_LOAD_SESSION_ID        deterministic ACP session id
 *   STRUCTURED_LOAD_THOUGHT_CHUNKS    agent_thought_chunk frames per turn (4)
 *   STRUCTURED_LOAD_TEXT_CHUNKS       agent_message_chunk frames per turn, the
 *                                     last one carrying the `done` marker (8)
 *   STRUCTURED_LOAD_TOOL_CALLS        tool_call/tool_call_update pairs (2)
 *   STRUCTURED_LOAD_CHUNK_BYTES       exact text length of every chunk (64, min 32)
 *   STRUCTURED_LOAD_RATE_PER_SEC      max session/update frames per second
 *                                     (25; 0 = as fast as stdout drain allows)
 *   STRUCTURED_LOAD_DURATION_MS       per-prompt wall-clock streaming cap
 *                                     (10000; truncation is visible as a
 *                                     missing `done` marker)
 *   STRUCTURED_LOAD_SELF_DESTRUCT_MS  hard process lifetime cap (0 = disabled)
 *   STRUCTURED_LOAD_RESUME            "0" disables loadSession/resume advertisement
 *   STRUCTURED_LOAD_MODELS            comma ids -> model configOptions
 *   STRUCTURED_LOAD_PROMPT_MARKER     file written with the turn number on prompt
 *   STRUCTURED_LOAD_CANCEL_MARKER     file written with the turn number on cancel
 *   STRUCTURED_LOAD_READY_MARKER      file written with the pid once started
 *   STRUCTURED_LOAD_EXIT_MARKER       file written with the pid on process exit
 *   STRUCTURED_LOAD_STDERR_TEXT       one diagnostic stderr line at startup
 *
 * Bounded producer: exactly one stdout write is in flight at a time and the
 * next frame is scheduled only from that write's completion callback, so a slow
 * or paused reader slows the schedule instead of growing an internal buffer.
 * The process exits on stdin EOF (parent teardown) and on SIGTERM/SIGINT.
 */
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const env = process.env;
const MARKER = env.STRUCTURED_LOAD_MARKER?.trim() || "slw";
const SESSION_ID = env.STRUCTURED_LOAD_SESSION_ID?.trim() || "structured-load-session-1";
const THOUGHT_CHUNKS = readInt("STRUCTURED_LOAD_THOUGHT_CHUNKS", 4, 0);
const TEXT_CHUNKS = readInt("STRUCTURED_LOAD_TEXT_CHUNKS", 8, 1);
const TOOL_CALLS = readInt("STRUCTURED_LOAD_TOOL_CALLS", 2, 0);
const CHUNK_BYTES = readInt("STRUCTURED_LOAD_CHUNK_BYTES", 64, 32);
const RATE_PER_SEC = readFloat("STRUCTURED_LOAD_RATE_PER_SEC", 25, 0);
const DURATION_MS = readInt("STRUCTURED_LOAD_DURATION_MS", 10_000, 1);
const SELF_DESTRUCT_MS = readInt("STRUCTURED_LOAD_SELF_DESTRUCT_MS", 0, 0);
const RESUME = env.STRUCTURED_LOAD_RESUME !== "0";
const MODELS = (env.STRUCTURED_LOAD_MODELS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const PROMPT_MARKER = env.STRUCTURED_LOAD_PROMPT_MARKER;
const CANCEL_MARKER = env.STRUCTURED_LOAD_CANCEL_MARKER;
const READY_MARKER = env.STRUCTURED_LOAD_READY_MARKER;
const EXIT_MARKER = env.STRUCTURED_LOAD_EXIT_MARKER;
const STDERR_TEXT = env.STRUCTURED_LOAD_STDERR_TEXT;

if (CHUNK_BYTES < MARKER.length + 32) {
  process.stderr.write(
    `[structured-load] STRUCTURED_LOAD_CHUNK_BYTES=${CHUNK_BYTES} is too small for marker "${MARKER}"\n`,
  );
  process.exit(2);
}

if (STDERR_TEXT) process.stderr.write(`${STDERR_TEXT}\n`);

if (SELF_DESTRUCT_MS > 0) {
  const timer = setTimeout(() => process.exit(0), SELF_DESTRUCT_MS);
  timer.unref?.();
}

function readInt(name, fallback, min) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function readFloat(name, fallback, min) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function writeMarker(path, value) {
  if (!path) return;
  try {
    writeFileSync(path, String(value));
  } catch {
    // Marker files are diagnostics only; never fail the workload over them.
  }
}

process.on("exit", () => writeMarker(EXIT_MARKER, process.pid));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
process.stdout.on("error", () => process.exit(0));

writeMarker(READY_MARKER, process.pid);

// ── Workload plan (mirrors tests/native-e2e/helpers/structuredWorkload.ts) ──

function pad(index) {
  return String(index).padStart(4, "0");
}

function chunkText(turn, kind, index, final) {
  const prefix = `[${MARKER}-t${turn}-${kind}-${pad(index)}]`;
  const suffix = final ? ` [${MARKER}-t${turn}-done]` : "";
  const body = `${prefix}${suffix} `;
  const filler = "x".repeat(Math.max(0, CHUNK_BYTES - body.length));
  return `${body}${filler}`;
}

function toolCallId(turn, index) {
  return `${MARKER}-t${turn}-tool-${pad(index)}`;
}

function buildPlan(turn) {
  const steps = [];
  for (let index = 0; index < THOUGHT_CHUNKS; index += 1) {
    steps.push({ kind: "thought", index });
  }
  let textIndex = 0;
  let textBudget = Math.max(0, TEXT_CHUNKS - 1);
  for (let index = 0; index < TOOL_CALLS; index += 1) {
    if (textBudget > 0) {
      steps.push({ kind: "text", index: textIndex, final: false });
      textIndex += 1;
      textBudget -= 1;
    }
    steps.push({ kind: "tool_call", index, toolCallId: toolCallId(turn, index) });
    if (textBudget > 0) {
      steps.push({ kind: "text", index: textIndex, final: false });
      textIndex += 1;
      textBudget -= 1;
    }
    steps.push({ kind: "tool_update", index, toolCallId: toolCallId(turn, index) });
  }
  while (textBudget > 0) {
    steps.push({ kind: "text", index: textIndex, final: false });
    textIndex += 1;
    textBudget -= 1;
  }
  steps.push({ kind: "text", index: textIndex, final: true });
  return steps;
}

function updateFor(step, turn) {
  switch (step.kind) {
    case "thought":
      return {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: chunkText(turn, "thought", step.index, false) },
      };
    case "text":
      return {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: chunkText(turn, "text", step.index, step.final) },
      };
    case "tool_call":
      return {
        sessionUpdate: "tool_call",
        toolCallId: step.toolCallId,
        title: `echo ${step.toolCallId}`,
        kind: "execute",
        status: "in_progress",
        rawInput: { command: `echo ${step.toolCallId}`, marker: step.toolCallId },
      };
    case "tool_update":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId: step.toolCallId,
        status: "completed",
        rawOutput: { exitCode: 0, output: `[${step.toolCallId}-ok]\n` },
      };
    default:
      throw new Error(`unknown step kind: ${String(step.kind)}`);
  }
}

// ── Stdio transport (one write in flight) ───────────────────────────────────

let writeChain = Promise.resolve();

function writeLine(line) {
  const write = writeChain.then(
    () =>
      new Promise((resolve, reject) => {
        process.stdout.write(line, (error) => (error ? reject(error) : resolve()));
      }),
  );
  // Keep the chain usable after a failed write; callers still see the rejection.
  writeChain = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}

function send(message) {
  return writeLine(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  return send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  return send({ jsonrpc: "2.0", id, error: { code, message } });
}

/** Fire-and-forget reply for the synchronous dispatch switch. */
function reply(id, result) {
  respond(id, result).catch(() => process.exit(0));
}

function replyError(id, code, message) {
  respondError(id, code, message).catch(() => process.exit(0));
}

function notifySessionUpdate(update) {
  return send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
}

// ── State ───────────────────────────────────────────────────────────────────

let sessionId = SESSION_ID;
let currentModel = MODELS[0];
let turn = 0;
let activeTurn = null;

function configOptions() {
  if (MODELS.length === 0) return undefined;
  return [
    {
      type: "select",
      id: "model",
      name: "Model",
      category: "model",
      currentValue: currentModel,
      options: MODELS.map((value) => ({ value, name: value })),
    },
  ];
}

function finishTurn(state, stopReason) {
  if (activeTurn !== state) return;
  activeTurn = null;
  if (state.timer) clearTimeout(state.timer);
  state.resolve({ stopReason });
}

function schedule(state) {
  if (activeTurn !== state) return;
  const tickMs = RATE_PER_SEC > 0 ? 1000 / RATE_PER_SEC : 0;
  state.timer = setTimeout(() => {
    void tick(state);
  }, tickMs);
  state.timer.unref?.();
}

async function tick(state) {
  if (activeTurn !== state) return;
  if (state.index >= state.plan.length || Date.now() >= state.deadline) {
    finishTurn(state, "end_turn");
    return;
  }
  const step = state.plan[state.index];
  state.index += 1;
  try {
    await notifySessionUpdate(updateFor(step, state.turn));
  } catch {
    process.exit(0);
    return;
  }
  if (activeTurn !== state) return;
  schedule(state);
}

function startTurn(requestId) {
  turn += 1;
  writeMarker(PROMPT_MARKER, turn);
  const state = {
    requestId,
    turn,
    plan: buildPlan(turn),
    index: 0,
    deadline: Date.now() + DURATION_MS,
    timer: undefined,
    resolve: undefined,
  };
  state.done = new Promise((resolve) => {
    state.resolve = resolve;
  });
  activeTurn = state;
  schedule(state);
  state.done.then((result) => respond(requestId, result)).catch(() => process.exit(0));
}

function cancelTurn() {
  writeMarker(CANCEL_MARKER, turn);
  const state = activeTurn;
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  activeTurn = null;
  state.resolve({ stopReason: "cancelled" });
}

// ── ACP dispatch ────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const text = line.trim();
  if (!text) return;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  const { id, method, params } = message;

  switch (method) {
    case "initialize":
      reply(id, {
        protocolVersion: 1,
        agentCapabilities: {
          promptCapabilities: {},
          ...(RESUME ? { loadSession: true, sessionCapabilities: { resume: {} } } : {}),
        },
        agentInfo: { name: "structured-load-agent", version: "1.0.0" },
      });
      return;

    case "session/new":
      reply(id, {
        sessionId,
        modes: { currentModeId: "default", availableModes: [{ id: "default", name: "Default" }] },
        ...(configOptions() ? { configOptions: configOptions() } : {}),
      });
      return;

    case "session/load":
    case "session/resume":
      if (typeof params?.sessionId === "string" && params.sessionId.length > 0) {
        sessionId = params.sessionId;
      }
      reply(id, {
        sessionId,
        modes: { currentModeId: "default", availableModes: [{ id: "default", name: "Default" }] },
        ...(configOptions() ? { configOptions: configOptions() } : {}),
      });
      return;

    case "session/prompt":
      if (activeTurn) {
        replyError(id, -32600, "a prompt is already in flight");
        return;
      }
      startTurn(id);
      return;

    case "session/cancel":
      cancelTurn();
      return;

    case "session/set_config_option": {
      if (params?.configId === "model" && typeof params.value === "string") {
        currentModel = params.value;
      }
      reply(id, configOptions() ? { configOptions: configOptions() } : {});
      return;
    }

    case "session/set_mode":
      reply(id, {});
      return;

    case "session/delete":
    case "session/close":
      reply(id, {});
      return;

    case "authenticate":
      reply(id, {});
      return;

    default:
      if (id !== undefined) reply(id, {});
      return;
  }
});

rl.on("close", () => process.exit(0));
