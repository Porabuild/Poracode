// Scripted ACP agent that deliberately talks like an older or vendor-extended
// agent: unknown update kinds, extra fields, extension methods and odd types.
// It exists only for clientWireCompat.test.ts, which records how Poracode's
// client side behaves against it. It is not a real agent.
//
//   PORACODE_WIRE_LOG    path: JSON-lines log of every frame the client wrote
//   PORACODE_WIRE_DONE   path: marker file written when the script has finished
//   PORACODE_WIRE_INIT   full | minimal | odd       initialize result variant
//   PORACODE_WIRE_CLOSE  close_32002 | close_ok     session/close result
//   PORACODE_WIRE_EXIT   exit_while_pending | ""    exit without answering session/prompt
//   PORACODE_WIRE_STRAY  1 | ""                     also answer a request the client never made
import { appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const env = process.env;
const NL = "\n";
const LOG = env.PORACODE_WIRE_LOG ?? "";
const DONE = env.PORACODE_WIRE_DONE ?? "";
const INIT = env.PORACODE_WIRE_INIT ?? "full";
const CLOSE = env.PORACODE_WIRE_CLOSE ?? "close_32002";
const EXIT = env.PORACODE_WIRE_EXIT ?? "";
const STRAY = env.PORACODE_WIRE_STRAY === "1";
const SESSION = "s-1";
const outstanding = new Set();
const requestCounters = new Map();

const log = (frame) => {
  if (LOG) appendFileSync(LOG, JSON.stringify(frame) + NL);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const send = (frame) => process.stdout.write(JSON.stringify(frame) + NL);
const respond = (id, result) => send({ jsonrpc: "2.0", id, result });
const reject = (id, error) => send({ jsonrpc: "2.0", id, error });
const notify = (method, params) =>
  send({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) });
const ask = (method, params) => {
  const n = (requestCounters.get(method) ?? 0) + 1;
  requestCounters.set(method, n);
  const id = method + "#" + n;
  outstanding.add(id);
  send({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
};
const allAnswered = async () => {
  const deadline = Date.now() + 3000;
  while (outstanding.size > 0 && Date.now() < deadline) await sleep(5);
};

const INITIALIZE_RESULTS = {
  full: {
    protocolVersion: 1,
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: { image: true, audio: true, embeddedContext: true },
      mcpCapabilities: { http: true, sse: true },
      sessionCapabilities: {
        list: {},
        resume: {},
        close: {},
        configOptions: {},
        fork: { notAShape: true },
        vendorCapability: 1,
      },
      auth: { logout: {} },
      _meta: { vendor: { anything: [1, 2, { a: null }] } },
    },
    authMethods: [
      { id: "oauth-personal", name: "Personal", description: "x", _meta: { vendor: 1 } },
    ],
    agentInfo: { name: "wire-compat", version: "0.0.0" },
    _meta: { vendor: { tier: 1 } },
    vendorTopLevel: { unknown: "field", nested: { deep: [1, 2, 3] } },
  },
  minimal: { protocolVersion: 1 },
  odd: {
    protocolVersion: "1-b vendor",
    junk: [1, null, "x"],
    agentCapabilities: null,
    authMethods: "not-a-list",
  },
};

const CONFIG_OPTIONS = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "m-1",
    options: [{ value: "m-1", name: "M1" }],
    vendorField: 1,
  },
  { id: "flag", name: "Flag", category: "other", type: "boolean", currentValue: null, options: [] },
];

async function unsolicited() {
  notify("session/update", {
    sessionId: "s-unsolicited",
    update: { sessionUpdate: "vendor_custom_update", anything: { nested: [1, 2, 3] } },
  });
  await sleep(15);
  notify("session/update", {
    sessionId: "s-unsolicited",
    topLevelExtra: true,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "unsolicited" },
      vendorField: 1,
    },
    _meta: { vendor: { deep: { x: 1 } } },
  });
  await sleep(15);
  notify("vendor/progress", { n: 1 });
  await sleep(15);
  ask("vendor/ask", { q: "ping", extra: [1, 2] });
  await sleep(15);
  ask("vendor/unknown2", {});
  await sleep(15);
}

async function promptScript(id) {
  const update = (body, extra = {}) =>
    notify("session/update", { sessionId: SESSION, update: body, ...extra });
  update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } });
  await sleep(10);
  update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking" } });
  await sleep(10);
  update(
    {
      sessionUpdate: "tool_call",
      toolCallId: "c-1",
      title: "run",
      kind: "execute",
      status: "in_progress",
      rawInput: { command: "echo" },
      vendorUpdateKey: { v: 1 },
    },
    { _meta: { "poracode/x": 1, vendor: { k: [1] } } },
  );
  await sleep(10);
  update({
    sessionUpdate: "tool_call_update",
    toolCallId: "c-1",
    status: "completed",
    rawOutput: { exitCode: 0 },
    vendorUpdateKey: 2,
  });
  await sleep(10);
  // The client's handler for this request takes 30 ms. The update right after
  // it shows whether the client waits for a pending handler.
  ask("fs/read_text_file", { sessionId: SESSION, path: "/x", line: 3, limit: 2, vendorExtra: 1 });
  await sleep(10);
  update({ sessionUpdate: "usage_update", used: 1234, size: 1000, vendorUsage: "u" });
  await sleep(10);
  const kinds = [
    ["user_message_chunk", { content: { type: "text", text: "user" } }],
    ["plan", { entries: [{ content: "step", priority: "medium", status: "pending" }] }],
    ["available_commands_update", { availableCommands: [{ name: "plan", description: "d" }] }],
    ["current_mode_update", { currentModeId: "default" }],
    ["session_info_update", { sessionInfo: { session_id: "s-1", title: "t" } }],
    ["notice", { notice: { type: "system", message: "m" } }],
    ["plan_removed", {}],
    ["config_option_update", { currentValue: "m-1" }],
    ["cursor_update", { cursorId: "c" }],
    ["vendor_future_update", { anything: { deep: [1, { x: null }] } }],
  ];
  for (const [sessionUpdate, body] of kinds) {
    update({ sessionUpdate, ...body });
    await sleep(10);
  }
  ask("fs/read_text_file", { sessionId: SESSION });
  await sleep(10);
  ask("fs/write_text_file", { sessionId: SESSION, path: "/x", content: "abc" });
  await sleep(10);
  ask("terminal/create", { sessionId: SESSION, command: "echo" });
  await sleep(10);
  ask("terminal/output", { sessionId: SESSION, terminalId: "t1" });
  await sleep(10);
  ask("terminal/wait_for_exit", { sessionId: SESSION, terminalId: "t1" });
  await sleep(10);
  ask("terminal/release", { sessionId: SESSION, terminalId: "t1" });
  await sleep(10);
  ask("terminal/kill", { sessionId: SESSION, terminalId: "t1" });
  await sleep(10);
  ask("session/request_permission", {
    sessionId: SESSION,
    toolCall: { toolCallId: "c-1", title: "T", kind: "execute", rawInput: {} },
    options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    vendorOptionField: 1,
  });
  await sleep(10);
  ask("elicitation/create", {
    sessionId: SESSION,
    messageId: "e-1",
    message: "m",
    requestedSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  });
  await sleep(10);
  notify("elicitation/complete", {});
  await sleep(10);
  ask("vendor/throw_plain", {});
  await sleep(10);
  ask("vendor/throw_request_error", {});
  await sleep(10);
  ask("vendor/return_undefined", {});
  await sleep(10);
  if (STRAY) {
    send({ jsonrpc: "2.0", id: 999999, result: { stale: true } });
    await sleep(10);
  }
  if (EXIT === "exit_while_pending") {
    await sleep(30);
    process.exit(0);
  }
  respond(id, {
    stopReason: "end_turn",
    usage: {
      totalTokens: 10,
      inputTokens: 5,
      outputTokens: 5,
      thoughtTokens: 0,
      cachedReadTokens: 0,
      cachedWriteTokens: 0,
    },
    extraField: { kept: true },
  });
}

async function onMessage(message) {
  log(message);
  if (message.id !== undefined && message.method === undefined) {
    outstanding.delete(message.id);
    return;
  }
  switch (message.method) {
    case "initialize":
      respond(message.id, INITIALIZE_RESULTS[INIT] ?? INITIALIZE_RESULTS.full);
      return;
    case "authenticate":
      await unsolicited();
      await allAnswered();
      respond(message.id, {});
      return;
    case "session/new":
      respond(message.id, {
        sessionId: SESSION,
        modes: { availableModes: [{ id: "default", name: "Default" }], currentModeId: "default" },
        models: { availableModels: [{ modelId: "m-1", name: "M1", isDefault: true }] },
        configOptions: CONFIG_OPTIONS,
        _meta: { vendor: { alias: "x" } },
        extraResultField: { kept: true },
      });
      return;
    case "session/load":
      respond(message.id, { sessionId: SESSION });
      return;
    case "session/resume":
      respond(message.id, { sessionId: SESSION, _meta: { vendor: 1 } });
      return;
    case "session/prompt":
      await promptScript(message.id);
      return;
    case "session/set_config_option":
      respond(message.id, { configOptions: CONFIG_OPTIONS, _meta: { vendor: 1 } });
      return;
    case "session/set_mode":
      respond(message.id, null);
      return;
    case "session/cancel":
      return;
    case "vendor/echo":
      respond(message.id, { echo: message.params ?? null, extra: true });
      return;
    case "session/close":
      if (CLOSE === "close_32002") {
        reject(message.id, {
          code: -32002,
          message: "Session not found",
          data: { detail: "gone" },
        });
      } else {
        respond(message.id, {});
      }
      return;
    case "session/delete":
      reject(message.id, { code: -32002, message: "Session not found" });
      await allAnswered();
      if (DONE) writeFileSync(DONE, "done");
      await sleep(50);
      process.exit(0);
      return;
    default:
      if (message.id !== undefined) {
        reject(message.id, { code: -32601, message: "Unknown method: " + message.method });
      }
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  void onMessage(JSON.parse(line));
});
process.stdin.on("end", () => process.exit(0));
