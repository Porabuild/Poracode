/**
 * Capture raw Factory Droid ACP session/update traffic (registry default).
 *
 * Usage:
 *   node scripts/probe-factory-droid-acp.mjs
 *   node scripts/probe-factory-droid-acp.mjs --model claude-opus-4-8 --prompt hi
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODEL = process.argv.includes("--model")
  ? process.argv[process.argv.indexOf("--model") + 1]
  : "claude-opus-4-8";
const PROMPT = process.argv.includes("--prompt")
  ? process.argv[process.argv.indexOf("--prompt") + 1]
  : "hi";

const OUT_DIR = join(process.cwd(), "logs");
const OUT_FILE = join(OUT_DIR, "factory-droid-acp-probe.jsonl");

const child = spawn("npx", ["-y", "droid@0.135.1", "exec", "--output-format", "acp-daemon"], {
  stdio: ["pipe", "pipe", "pipe"],
  shell: true,
  env: {
    ...process.env,
    DROID_DISABLE_AUTO_UPDATE: "true",
    FACTORY_DROID_AUTO_UPDATE_ENABLED: "false",
  },
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, "");

function log(kind, payload) {
  const line = JSON.stringify({ ts: new Date().toISOString(), kind, payload });
  writeFileSync(OUT_FILE, `${line}\n`, { flag: "a" });
  if (kind === "session/update") {
    const update = payload?.update;
    if (update?.sessionUpdate === "agent_message_chunk" && update?.content?.type === "text") {
      process.stdout.write(update.content.text);
    } else {
      console.log(`\n[${update?.sessionUpdate ?? "update"}]`, JSON.stringify(update, null, 2));
    }
  } else if (kind === "response.error") {
    console.log("\n[rpc error]", JSON.stringify(payload, null, 2));
  } else if (kind !== "stderr") {
    console.log(
      `\n[${kind}]`,
      typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
    );
  }
}

let requestId = 0;
const pending = new Map();

function send(method, params) {
  const id = ++requestId;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  log("request", { id, method, params });
  child.stdin.write(`${msg}\n`);
  return id;
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
  log("notification", { method, params });
  child.stdin.write(`${msg}\n`);
}

function waitForResponse(id, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for response ${id}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeout });
  });
}

const rl = createInterface({ input: child.stdout });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (msg.method === "session/update") {
      log("session/update", msg.params);
      return;
    }
    if ("id" in msg && pending.has(msg.id)) {
      const { resolve, reject, timeout } = pending.get(msg.id);
      clearTimeout(timeout);
      pending.delete(msg.id);
      if (msg.error) {
        log("response.error", msg.error);
        reject(new Error(JSON.stringify(msg.error)));
      } else {
        log("response", { id: msg.id, result: msg.result });
        resolve(msg.result);
      }
    }
  } catch (error) {
    log("parse_error", { line, error: String(error) });
  }
});

child.stderr?.on("data", (chunk) => {
  const text = String(chunk);
  if (text.trim()) log("stderr", text);
});

function findModelConfig(configOptions) {
  if (!Array.isArray(configOptions)) return undefined;
  for (const option of configOptions) {
    if (option?.category === "model" || option?.id === "model") return option;
  }
  return undefined;
}

async function main() {
  console.log(`Probing Factory Droid (model=${MODEL}, prompt="${PROMPT}")`);
  console.log(`Logging to ${OUT_FILE}\n`);

  const initResult = await waitForResponse(
    send("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "poracode-probe", version: "0.1.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
        auth: { terminal: true },
      },
    }),
  );
  sendNotification("initialized", {});

  if (initResult.authMethods?.length) {
    const login = initResult.authMethods.find((m) => m.id === "login") ?? initResult.authMethods[0];
    try {
      await waitForResponse(send("authenticate", { methodId: login.id }), 180_000);
    } catch (error) {
      console.log("authenticate failed (continuing):", error.message);
    }
  }

  const newResult = await waitForResponse(
    send("session/new", { cwd: process.cwd(), mcpServers: [] }),
  );
  const sessionId = newResult.sessionId;
  const modelConfig = findModelConfig(newResult.configOptions);
  if (modelConfig?.id) {
    try {
      await waitForResponse(
        send("session/set_config_option", {
          sessionId,
          configId: modelConfig.id,
          value: MODEL,
        }),
      );
      console.log(`\nSet model config to ${MODEL}`);
    } catch (error) {
      console.log("\nset_config_option failed:", error.message);
      try {
        await waitForResponse(
          send("session/unstable_set_session_model", { sessionId, modelId: MODEL }),
        );
        console.log(`\nSet model via unstable_set_session_model to ${MODEL}`);
      } catch (error2) {
        console.log("\nunstable_set_session_model failed:", error2.message);
      }
    }
  } else {
    console.log("\nNo model config option in newSession — available models in modes only");
  }

  console.log(`\n--- prompt: "${PROMPT}" ---\n`);
  const promptResult = await waitForResponse(
    send("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: PROMPT }],
    }),
  );
  console.log("\n\nstopReason:", promptResult.stopReason);
  child.kill();
}

main().catch((error) => {
  console.error("\nProbe failed:", error);
  child.kill();
  process.exit(1);
});
