#!/usr/bin/env node
/**
 * Minimal fake ACP agent used by `probe.stress.test.ts`.
 *
 * Speaks just enough newline-delimited JSON-RPC over stdio to drive
 * `probeAcpCapabilities` through its handshake + per-model thought-level
 * probing, with timing faults injected via environment variables so each
 * stress scenario is deterministic:
 *
 *   FAKE_MODELS                 comma-separated model ids for the "model" selector
 *   FAKE_INIT_MODELS            comma-separated model ids for initialize._meta.modelState
 *   FAKE_EFFORTS                comma-separated reasoning-effort values (default "low,high")
 *   FAKE_REASONING_EFFORT       "1" → advertise a {category:"model",id:"reasoning_effort"} selector
 *   FAKE_SLASH_BATCHES          JSON array of {delayMs, commands:[{name,description}]} — each
 *                               entry schedules one available_commands_update notification
 *   FAKE_SET_CONFIG_DELAY_MS    delay before answering session/set_config_option
 *   FAKE_HANG_SET_CONFIG        "1" → never answer session/set_config_option (simulates a wedged agent)
 *   FAKE_CRASH_AFTER_NEW_SESSION "1" → exit(0) immediately after answering session/new
 *   FAKE_AUTH_REQUIRED_ON_NEW     "1" → reject session/new as unauthenticated
 *   FAKE_SELF_DESTRUCT_MS       exit(0) after N ms regardless (test cleanup guard)
 */
import { createInterface } from "node:readline";

const env = process.env;
const SESSION_ID = "fake-session-1";

const models = (env.FAKE_MODELS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const initializeModels = (env.FAKE_INIT_MODELS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const efforts = (env.FAKE_EFFORTS ?? "low,high")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const slashBatches = JSON.parse(env.FAKE_SLASH_BATCHES ?? "[]");
const setConfigDelayMs = Number(env.FAKE_SET_CONFIG_DELAY_MS ?? 0);
const hangSetConfig = env.FAKE_HANG_SET_CONFIG === "1";
const crashAfterNewSession = env.FAKE_CRASH_AFTER_NEW_SESSION === "1";
const authRequiredOnNewSession = env.FAKE_AUTH_REQUIRED_ON_NEW === "1";
const selfDestructMs = Number(env.FAKE_SELF_DESTRUCT_MS ?? 0);
const includeReasoningEffort = env.FAKE_REASONING_EFFORT === "1";

if (selfDestructMs > 0) {
  const timer = setTimeout(() => process.exit(0), selfDestructMs);
  timer.unref?.();
}

let currentModel = models[0];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function notifySessionUpdate(update) {
  send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: SESSION_ID, update } });
}

function modelConfigOption() {
  return {
    type: "select",
    id: "model",
    name: "Model",
    category: "model",
    currentValue: currentModel,
    options: models.map((value) => ({ value, name: value })),
  };
}

function reasoningEffortOption() {
  return {
    type: "select",
    id: "reasoning_effort",
    name: "Reasoning Effort",
    category: "model",
    currentValue: efforts[0] ?? "low",
    options: efforts.map((value) => ({ value, name: value })),
  };
}

function configOptions() {
  const options = [];
  if (models.length > 0) options.push(modelConfigOption());
  if (includeReasoningEffort) options.push(reasoningEffortOption());
  return options;
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
  const { id, method, params } = message;

  switch (method) {
    case "initialize":
      respond(id, {
        protocolVersion: 1,
        agentCapabilities: { promptCapabilities: {}, sessionCapabilities: {} },
        agentInfo: { name: "fake-acp-agent", version: "0.0.0" },
        ...(initializeModels.length > 0
          ? {
              _meta: {
                modelState: {
                  currentModelId: initializeModels[0],
                  availableModels: initializeModels.map((modelId) => ({
                    modelId,
                    name: modelId === "grok-4.5" ? "Grok 4.5" : modelId,
                    _meta: { totalContextTokens: 500_000 },
                  })),
                },
              },
            }
          : {}),
      });
      return;

    case "authenticate":
      respond(id, {});
      return;

    case "session/new":
      if (authRequiredOnNewSession) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32_000, message: "Authentication required" },
        });
        return;
      }
      respond(id, {
        sessionId: SESSION_ID,
        modes: {
          currentModeId: "default",
          availableModes: [{ id: "default", name: "Default" }],
        },
        configOptions: configOptions(),
      });
      for (const batch of slashBatches) {
        setTimeout(
          () => {
            notifySessionUpdate({
              sessionUpdate: "available_commands_update",
              availableCommands: batch.commands,
            });
          },
          Number(batch.delayMs ?? 0),
        );
      }
      if (crashAfterNewSession) {
        // Give the session/new response time to flush before dying like a
        // crashed agent (process.exit() can truncate pending stdout writes).
        setTimeout(() => process.exit(0), 20);
      }
      return;

    case "session/set_config_option": {
      if (hangSetConfig) return; // wedged agent: never answer
      const value = params?.value;
      if (params?.configId === "model" && typeof value === "string") {
        currentModel = value;
      }
      const answer = () => respond(id, { configOptions: configOptions() });
      if (setConfigDelayMs > 0) setTimeout(answer, setConfigDelayMs);
      else answer();
      return;
    }

    case "session/prompt":
      respond(id, { stopReason: "end_turn" });
      return;

    case "session/cancel":
      return; // notification — no response

    default:
      if (id !== undefined) respond(id, {});
      return;
  }
});

rl.on("close", () => process.exit(0));
