/** Credential-free ACP subprocess for orchestration execution tests.
 * Tools are scripted protocol output; scheduler/process/request custody is real.
 */
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { runFixtureFileIo } from "./orchestration-file-io.mjs";

const tracePath = process.env.ORCHESTRATION_TRACE;
let sessionId = randomUUID();
let active;
let priorLabels = [];
const sessionPath = () =>
  join(process.env.ORCHESTRATION_SESSION_DIR ?? process.cwd(), `fixture-session-${sessionId}.json`);
const requests = new Map();
const trace = (event, fields = {}) => {
  if (tracePath)
    appendFileSync(
      tracePath,
      JSON.stringify({ event, pid: process.pid, sessionId, ...fields }) + "\n",
    );
};
const send = (message) =>
  new Promise((resolve, reject) =>
    process.stdout.write(JSON.stringify(message) + "\n", (error) =>
      error ? reject(error) : resolve(),
    ),
  );
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const update = (value) =>
  send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: value } });
const report = (plan, fileIo) => ({
  version: 1,
  outcome: "completed",
  summary: plan.label ?? "fixture completed",
  changes: [],
  checks: [
    { command: "fixture execution", result: plan.failedCheck ? "failed" : "passed" },
    ...fileIo.checks,
  ],
  findings: [],
  risks: [],
  evidence: fileIo.evidence,
});

async function turn(id, params) {
  const text =
    params.prompt
      ?.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n") ?? "";
  const line = text.split("\n").find((value) => value.startsWith("ORCHESTRATION_PLAN="));
  const plan = JSON.parse(line?.slice("ORCHESTRATION_PLAN=".length) ?? "{}");
  const state = { id, cancelled: false, timer: undefined, wake: undefined };
  active = state;
  const evidenceLine = text.split("\n").find((value) => value.startsWith('[{"id":'));
  const dependencies = evidenceLine ? JSON.parse(evidenceLine) : [];
  trace("prompt", { label: plan.label, dependencies, priorLabels: [...priorLabels] });
  priorLabels.push(plan.label);
  writeFileSync(sessionPath(), JSON.stringify(priorLabels));
  const fileIo = await runFixtureFileIo(plan.fsOperations, {
    state,
    sessionId,
    requests,
    send,
    update,
    trace,
  });
  for (let n = 0; n < (plan.tools ?? 3) && !state.cancelled; n++) {
    const toolCallId = `tool-${n}`;
    await update({
      sessionUpdate: "tool_call",
      toolCallId,
      title: `read fixture-${n}.txt`,
      kind: "read",
      status: "in_progress",
      rawInput: { path: `fixture-${n}.txt` },
    });
    await update({
      sessionUpdate: "tool_call_update",
      toolCallId,
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: `fixture output ${n}` } }],
    });
  }
  if (plan.permission && !state.cancelled) {
    const requestId = `permission-${randomUUID()}`;
    const response = new Promise((resolve) => requests.set(requestId, resolve));
    await send({
      jsonrpc: "2.0",
      id: requestId,
      method: "session/request_permission",
      params: {
        sessionId,
        toolCall: {
          toolCallId: "permission-tool",
          title: "Read fixture",
          kind: "read",
          status: "in_progress",
        },
        options: [
          { optionId: "allow", name: "Allow once", kind: "allow_once" },
          { optionId: "reject", name: "Reject once", kind: "reject_once" },
        ],
      },
    });
    const result = await response;
    trace("permission-resolved", { outcome: result?.outcome });
  }
  if (plan.holdMs && !state.cancelled)
    await new Promise((resolve) => {
      state.wake = resolve;
      state.timer = setTimeout(resolve, plan.holdMs);
    });
  if (!state.cancelled) {
    const answer = plan.invalidReport
      ? "Invalid worker report"
      : "```crossagents-result\n" + JSON.stringify(report(plan, fileIo)) + "\n```";
    await update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: answer } });
  }
  trace("settled", { label: plan.label, cancelled: state.cancelled });
  if (active === state) active = undefined;
  await reply(id, { stopReason: state.cancelled ? "cancelled" : "end_turn" });
}

trace("started");
process.on("exit", () => trace("exit"));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
process.stdout.on("error", () => process.exit(0));
const input = createInterface({ input: process.stdin });
input.on("close", () => process.exit(0));
input.on("line", (line) => {
  const message = JSON.parse(line);
  if (!message.method) {
    requests.get(message.id)?.(message.error ? { fixtureRpcError: message.error } : message.result);
    requests.delete(message.id);
    return;
  }
  const { id, method, params } = message;
  switch (method) {
    case "initialize":
      void reply(id, {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true, promptCapabilities: {} },
        agentInfo: { name: "orchestration-fixture", version: "1" },
      });
      break;
    case "session/new":
      trace("new");
      void reply(id, { sessionId });
      break;
    case "session/load":
    case "session/resume":
      if (!/^[a-f0-9-]{36}$/.test(params.sessionId)) throw new Error("Invalid fixture session ID");
      sessionId = params.sessionId;
      priorLabels = existsSync(sessionPath())
        ? JSON.parse(readFileSync(sessionPath(), "utf8"))
        : [];
      trace("load");
      void reply(id, {});
      break;
    case "session/prompt":
      void turn(id, params).catch((error) => {
        trace("error", { message: error.message });
        process.exit(1);
      });
      break;
    case "session/cancel":
      trace("cancel");
      if (active) {
        active.cancelled = true;
        clearTimeout(active.timer);
        active.wake?.();
        for (const resolve of requests.values()) resolve({ outcome: { outcome: "cancelled" } });
        requests.clear();
      }
      break;
    default:
      if (id !== undefined) void reply(id, {});
  }
});
