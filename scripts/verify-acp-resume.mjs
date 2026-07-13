/**
 * Step 0 verification: Can we create an ACP session and resume it in TUI mode?
 *
 * This script:
 * 1. Spawns `gemini --acp`
 * 2. Performs the ACP initialize handshake
 * 3. Creates a new session via session/new
 * 4. Prints the session ID
 * 5. Kills the ACP process
 *
 * Then you can test: `gemini --resume <session-id>`
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const child = spawn("gemini", ["--acp"], {
  stdio: ["pipe", "pipe", "pipe"],
  shell: true,
});

let requestId = 0;

function send(method, params) {
  const id = ++requestId;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  console.log(">>>", msg);
  child.stdin.write(msg + "\n");
  return id;
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
  console.log(">>>", msg);
  child.stdin.write(msg + "\n");
}

const pending = new Map();

function waitForResponse(id) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for response to request ${id}`));
    }, 30000);
    pending.set(id, { resolve, reject, timeout });
  });
}

// Parse newline-delimited JSON from stdout
const rl = createInterface({ input: child.stdout });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    console.log("<<<", JSON.stringify(msg));

    if ("id" in msg && pending.has(msg.id)) {
      const { resolve, reject, timeout } = pending.get(msg.id);
      clearTimeout(timeout);
      pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(JSON.stringify(msg.error)));
      } else {
        resolve(msg.result);
      }
    }
  } catch {
    console.log("<<< (parse error)", line);
  }
});

child.stderr?.on("data", (chunk) => {
  process.stderr.write("[gemini stderr] " + chunk);
});

child.on("exit", (code) => {
  console.log(`\n[gemini --acp] exited with code ${code}`);
});

async function main() {
  console.log("=== Step 0: Verify ACP session can be resumed in TUI ===\n");

  // 1. Initialize
  console.log("\n--- Phase 1: Initialize ---");
  const initId = send("initialize", {
    protocolVersion: 1,
    clientInfo: { name: "poracode-verify", version: "0.1.0" },
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  });
  const initResult = await waitForResponse(initId);
  console.log("\nInit result:", JSON.stringify(initResult, null, 2));

  // Send initialized notification
  sendNotification("initialized", {});

  // 2. Handle auth if needed
  if (initResult.authMethods && initResult.authMethods.length > 0) {
    console.log("\n--- Phase 1b: Authenticate ---");
    const method = initResult.authMethods[0];
    const authId = send("authenticate", { methodId: method.id });
    const authResult = await waitForResponse(authId);
    console.log("Auth result:", JSON.stringify(authResult, null, 2));
  }

  // 3. Create session
  console.log("\n--- Phase 2: Create Session ---");
  const sessionId = send("session/new", {
    cwd: process.cwd(),
    mcpServers: [],
  });
  const sessionResult = await waitForResponse(sessionId);
  console.log("\nSession result:", JSON.stringify(sessionResult, null, 2));

  const acpSessionId = sessionResult.sessionId;

  console.log("\n========================================");
  console.log("ACP Session ID:", acpSessionId);
  console.log("========================================");
  console.log("\nNow test in another terminal:");
  console.log(`  gemini --resume ${acpSessionId}`);
  console.log("\nIf TUI opens and shows the session, hybrid mode works!");
  console.log("Press Ctrl+C to exit this script.\n");

  // Keep alive for 60 seconds to allow testing
  await new Promise((resolve) => setTimeout(resolve, 60000));

  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  child.kill();
  process.exit(1);
});
