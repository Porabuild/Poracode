#!/usr/bin/env node
/**
 * Minimal multi-session fake ACP agent used by `sharedProcess.test.ts` and
 * the shared-session integration test.
 *
 * Speaks newline-delimited JSON-RPC over stdio and hosts several concurrent
 * ACP sessions on one process — the shape a shared agent process exposes:
 *
 *   - `initialize` answers once per PROCESS and advertises
 *     `sessionCapabilities.close` + `loadSession`; every call appends
 *     `{ pid }` to FAKE_SHARED_INIT_MARKER so tests can count processes.
 *   - `session/new` returns `s-<n>` and emits one `session/update` for that
 *     id BEFORE the response (the pre-registration routing case).
 *   - `session/load` replays one `agent_message_chunk` for the addressed id,
 *     then responds.
 *   - `session/prompt` echoes `echo:<sessionId>:<text>` as an
 *     agent_message_chunk, then answers `end_turn`. Special texts:
 *       "hang"  → stays pending until `session/cancel`, then `cancelled`
 *                 (with FAKE_IGNORE_CANCEL=1 the cancel is ignored and the
 *                 prompt never settles — the still-working escalation case)
 *       "crash" → the process exits with code 1
 *       "diag"  → sends an agent→client extension REQUEST without a
 *                 sessionId, then echoes the result
 *       "relay:<sessionId>" → sends a session/update notification AND a
 *                 session/request_permission request addressed to that
 *                 session id, then echoes the permission outcome — used to
 *                 probe routing for quarantined/abandoned sessions.
 *       "elicit-by-request" → sends elicitation/create with requestId set
 *                 to the inbound session/prompt id (no sessionId), echoes
 *                 the client's answer into the session update.
 *       "elicit-addressed" → same but session-scoped (sessionId set).
 *       "elicit-unattributed" → requestId that matches no in-flight request.
 *       "elicit-complete" → sends an unaddressed elicitation/complete
 *                 notification, then echoes normally.
 *       "elicit-for-new:<sessionId>" → sends elicitation/create with
 *                 requestId set to that session's session/new JSON-RPC id
 *                 (no sessionId), then echoes the client's answer — probes
 *                 request attribution after the opening member released.
 *   - `session/close` rejects while that session's prompt is pending,
 *     otherwise records the id in FAKE_SHARED_CLOSE_MARKER; with
 *     FAKE_CLOSE_ALWAYS_FAILS=1 it always rejects, and with
 *     FAKE_CLOSE_HANGS=1 it never answers at all.
 *   - FAKE_NO_CLOSE_CAPABILITY=1 omits `sessionCapabilities.close` from
 *     initialize, so the pool must retire members without session/close.
 *   - FAKE_SHARED_INIT_DELAY_MS=<ms> delays the initialize response so
 *     members can join before capabilities are known.
 *   - FAKE_SHARED_PROMPT_MARKER=<path> appends one JSON line
 *     { sessionId, text } per session/prompt received.
 *   - FAKE_ELICIT_ON_NEW=1 makes session/new first send an
 *     elicitation/create request-scoped to that session/new request id and
 *     echo the answer into the new session's first update.
 *   - exits on stdin EOF; FAKE_SELF_DESTRUCT_MS is the test cleanup guard.
 */
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const env = process.env;
const initMarker = env.FAKE_SHARED_INIT_MARKER;
const closeMarker = env.FAKE_SHARED_CLOSE_MARKER;
const closeAlwaysFails = env.FAKE_CLOSE_ALWAYS_FAILS === "1";
const closeHangs = env.FAKE_CLOSE_HANGS === "1";
const ignoreCancel = env.FAKE_IGNORE_CANCEL === "1";
const noCloseCapability = env.FAKE_NO_CLOSE_CAPABILITY === "1";
const failInitialize = env.FAKE_FAIL_INITIALIZE === "1";
const initDelayMs = Number(env.FAKE_SHARED_INIT_DELAY_MS ?? 0);
const promptMarker = env.FAKE_SHARED_PROMPT_MARKER;
const elicitOnNew = env.FAKE_ELICIT_ON_NEW === "1";
const selfDestructMs = Number(env.FAKE_SELF_DESTRUCT_MS ?? 0);

if (selfDestructMs > 0) {
  const timer = setTimeout(() => process.exit(0), selfDestructMs);
  timer.unref?.();
}

/** sessionId → { pendingPromptId } */
const sessions = new Map();
/** agent→client request id → resolver for the diag flow */
const pendingAgentRequests = new Map();
let nextSessionNumber = 0;
let nextAgentRequestId = 0;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function reject(id, message) {
  send({ jsonrpc: "2.0", id, error: { code: -32603, message } });
}

function notifySessionUpdate(sessionId, update) {
  send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
}

function sessionRecord(sessionId) {
  let record = sessions.get(sessionId);
  if (record === undefined) {
    record = { pendingPromptId: undefined };
    sessions.set(sessionId, record);
  }
  return record;
}

function promptText(params) {
  const prompt = params?.prompt;
  if (!Array.isArray(prompt)) return "";
  return prompt
    .map((block) => (block && typeof block === "object" ? String(block.text ?? "") : ""))
    .join(" ")
    .trim();
}

function sessionPayload() {
  return {
    modes: {
      currentModeId: "default",
      availableModes: [{ id: "default", name: "Default" }],
    },
    configOptions: [],
  };
}

const ELICIT_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
};

/**
 * Send elicitation/create and resolve with the client's answer (or error).
 * `params` carries the ACP scope fields: sessionId for a session-scoped
 * elicitation, requestId for one tied to an in-flight JSON-RPC request.
 */
function elicitCreate(params) {
  const requestId = `elicit-${++nextAgentRequestId}`;
  return new Promise((resolve) => {
    pendingAgentRequests.set(requestId, (response) => {
      resolve(response.error !== undefined ? { error: response.error } : (response.result ?? null));
    });
    send({
      jsonrpc: "2.0",
      id: requestId,
      method: "elicitation/create",
      params,
    });
  });
}

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

  // A response to an agent-initiated request (the diag flow) carries no
  // method — resolve its waiter instead of treating it as a request.
  if (message.method === undefined) {
    if ("result" in message || "error" in message) {
      const waiter = pendingAgentRequests.get(message.id);
      if (waiter !== undefined) {
        pendingAgentRequests.delete(message.id);
        waiter(message);
      }
    }
    return;
  }

  const { id, method, params } = message;

  switch (method) {
    case "initialize":
      if (initMarker) appendFileSync(initMarker, `${JSON.stringify({ pid: process.pid })}\n`);
      if (failInitialize) {
        reject(id, "initialize failed (FAKE_FAIL_INITIALIZE)");
        return;
      }
      const answerInitialize = () =>
        respond(id, {
          protocolVersion: 1,
          agentCapabilities: {
            loadSession: true,
            promptCapabilities: {},
            ...(noCloseCapability ? {} : { sessionCapabilities: { close: {} } }),
          },
          agentInfo: { name: "fake-shared-acp-agent", version: "0.0.0" },
        });
      if (initDelayMs > 0) setTimeout(answerInitialize, initDelayMs);
      else answerInitialize();
      return;

    case "session/new": {
      const sessionId = `s-${++nextSessionNumber}`;
      // Remember which JSON-RPC id opened this session so prompts can send
      // request-scoped traffic tied to it after the fact.
      sessionRecord(sessionId).newRequestId = id;
      const answerNew = () => {
        // Pre-response traffic for the not-yet-registered id: the pool must
        // buffer this and deliver it to the member once the id registers.
        notifySessionUpdate(sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `open:${sessionId}` },
        });
        respond(id, { sessionId, ...sessionPayload() });
      };
      if (elicitOnNew) {
        // Request-scoped elicitation tied to THIS session/new request: the
        // pool must route it to the member that opened the session.
        void elicitCreate({
          mode: "form",
          message: "new-session elicitation",
          requestedSchema: ELICIT_SCHEMA,
          requestId: id,
        }).then((answer) => {
          notifySessionUpdate(sessionId, {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: `elicit-new:${sessionId}:${JSON.stringify(answer)}`,
            },
          });
          answerNew();
        });
        return;
      }
      answerNew();
      return;
    }

    case "session/load": {
      const sessionId = params?.sessionId;
      sessionRecord(sessionId);
      notifySessionUpdate(sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `replay:${sessionId}` },
      });
      respond(id, sessionPayload());
      return;
    }

    case "session/resume": {
      const sessionId = params?.sessionId;
      sessionRecord(sessionId);
      respond(id, sessionPayload());
      return;
    }

    case "session/prompt": {
      const sessionId = params?.sessionId;
      const record = sessionRecord(sessionId);
      const body = promptText(params);
      if (promptMarker) {
        appendFileSync(promptMarker, `${JSON.stringify({ sessionId, text: body })}\n`);
      }
      if (body.includes("hang")) {
        record.pendingPromptId = id;
        return;
      }
      if (body.includes("crash")) {
        // Let any in-flight writes flush before dying like a crashed agent.
        setTimeout(() => process.exit(1), 20);
        return;
      }
      const finish = (chunkText) => {
        notifySessionUpdate(sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: chunkText },
        });
        respond(id, { stopReason: "end_turn" });
      };
      if (
        body === "elicit-by-request" ||
        body === "elicit-addressed" ||
        body === "elicit-unattributed"
      ) {
        const elicitParams =
          body === "elicit-by-request"
            ? { requestId: id, mode: "form", message: body, requestedSchema: ELICIT_SCHEMA }
            : body === "elicit-addressed"
              ? { sessionId, mode: "form", message: body, requestedSchema: ELICIT_SCHEMA }
              : {
                  requestId: "no-such-request",
                  mode: "form",
                  message: body,
                  requestedSchema: ELICIT_SCHEMA,
                };
        void elicitCreate(elicitParams).then((answer) => {
          finish(`echo:${sessionId}:elicit:${JSON.stringify(answer)}`);
        });
        return;
      }
      if (body === "elicit-complete") {
        send({
          jsonrpc: "2.0",
          method: "elicitation/complete",
          params: { elicitationId: "elicit-done" },
        });
        finish(`echo:${sessionId}:complete-sent`);
        return;
      }
      if (body.startsWith("elicit-for-new:")) {
        const target = body.slice("elicit-for-new:".length).trim();
        const newRequestId = sessions.get(target)?.newRequestId;
        void elicitCreate({
          requestId: newRequestId ?? "no-such-request",
          mode: "form",
          message: body,
          requestedSchema: ELICIT_SCHEMA,
        }).then((answer) => {
          finish(`echo:${sessionId}:elicit-for-new:${JSON.stringify(answer)}`);
        });
        return;
      }
      if (body.startsWith("relay:")) {
        const target = body.slice("relay:".length).trim();
        // Late traffic addressed to another session: a notification the pool
        // should drop and a permission request it should answer without a
        // member. The outcome is echoed into THIS session's reply.
        notifySessionUpdate(target, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `late:${target}` },
        });
        const requestId = `perm-${++nextAgentRequestId}`;
        pendingAgentRequests.set(requestId, (response) => {
          finish(`echo:${sessionId}:relay:${JSON.stringify(response)}`);
        });
        send({
          jsonrpc: "2.0",
          id: requestId,
          method: "session/request_permission",
          params: {
            sessionId: target,
            toolCall: {
              toolCallId: `call-${requestId}`,
              title: "relay probe",
              kind: "other",
              status: "pending",
            },
            options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
          },
        });
        return;
      }
      if (body.includes("diag")) {
        const requestId = `diag-${++nextAgentRequestId}`;
        pendingAgentRequests.set(requestId, (response) => {
          const payload =
            response.error !== undefined
              ? { error: response.error }
              : { result: response.result ?? null };
          finish(`echo:${sessionId}:diag:${JSON.stringify(payload)}`);
        });
        // Agent→client extension request with NO sessionId — attribution is
        // the pool's unaddressedRequests policy, not the wire params.
        send({
          jsonrpc: "2.0",
          id: requestId,
          method: "_test/diagnostics",
          params: {},
        });
        return;
      }
      finish(`echo:${sessionId}:${body}`);
      return;
    }

    case "session/cancel": {
      const sessionId = params?.sessionId;
      const record = sessions.get(sessionId);
      if (ignoreCancel) {
        // The agent never settles the pending prompt: the pool must treat
        // the member as still working and escalate to process termination.
        return;
      }
      if (record?.pendingPromptId !== undefined) {
        respond(record.pendingPromptId, { stopReason: "cancelled" });
        record.pendingPromptId = undefined;
      }
      return; // notification — no response
    }

    case "session/close": {
      const sessionId = params?.sessionId;
      if (closeHangs) {
        // Never answer: the pool's close deadline must escalate to killing
        // the process instead of waiting on this response forever.
        return;
      }
      if (closeAlwaysFails) {
        reject(id, "session close always fails (FAKE_CLOSE_ALWAYS_FAILS)");
        return;
      }
      const record = sessions.get(sessionId);
      if (record?.pendingPromptId !== undefined) {
        reject(id, "Cannot disconnect while the agent is working; stop it first");
        return;
      }
      if (closeMarker) appendFileSync(closeMarker, `${sessionId}\n`);
      sessions.delete(sessionId);
      respond(id, {});
      return;
    }

    default:
      if (id !== undefined) respond(id, {});
      return;
  }
});

rl.on("close", () => process.exit(0));
