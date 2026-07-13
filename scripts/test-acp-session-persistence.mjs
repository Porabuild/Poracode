/**
 * Test when Gemini persists ACP sessions to disk.
 *
 * Checks the session storage directory at each phase:
 * 1. After session/new
 * 2. After sending a prompt (during processing)
 * 3. After prompt completes
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Gemini stores sessions here
const CHATS_DIR = join(homedir(), ".gemini", "tmp", "poracode", "chats");

function listSessions() {
  if (!existsSync(CHATS_DIR)) return [];
  return readdirSync(CHATS_DIR).filter((f) => !f.startsWith("."));
}

const child = spawn("gemini", ["--acp"], {
  stdio: ["pipe", "pipe", "pipe"],
  shell: true,
});

let requestId = 0;
const pending = new Map();

function send(method, params) {
  const id = ++requestId;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  console.log(">>>", method);
  child.stdin.write(msg + "\n");
  return id;
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
  child.stdin.write(msg + "\n");
}

function waitForResponse(id) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for response ${id}`));
    }, 60000);
    pending.set(id, { resolve, reject, timeout });
  });
}

const rl = createInterface({ input: child.stdout });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);

    // Log notifications
    if (msg.method === "session/update") {
      const update = msg.params?.update;
      if (update?.sessionUpdate === "agent_message_chunk" && update?.content?.type === "text") {
        process.stdout.write(update.content.text);
      } else {
        console.log("  [notification]", update?.sessionUpdate);
      }
      return;
    }

    if ("id" in msg && pending.has(msg.id)) {
      const { resolve, reject, timeout } = pending.get(msg.id);
      clearTimeout(timeout);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  } catch {}
});

child.stderr?.on("data", () => {});

function checkDisk(label) {
  const sessions = listSessions();
  console.log(`\n[DISK CHECK: ${label}] ${CHATS_DIR}`);
  console.log(`  Sessions on disk: ${sessions.length}`);
  sessions.forEach((s) => console.log(`    - ${s}`));
  return sessions;
}

async function main() {
  const sessionsBefore = checkDisk("BEFORE ACP");

  // Initialize
  const initId = send("initialize", {
    protocolVersion: 1,
    clientInfo: { name: "poracode-test", version: "0.1.0" },
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  });
  const initResult = await waitForResponse(initId);
  console.log("\nInitialized:", initResult.agentInfo?.name, "v" + initResult.agentInfo?.version);
  sendNotification("initialized", {});

  // Authenticate
  if (initResult.authMethods?.length > 0) {
    const authId = send("authenticate", { methodId: initResult.authMethods[0].id });
    await waitForResponse(authId);
    console.log("Authenticated");
  }

  // Create session
  const newId = send("session/new", { cwd: process.cwd(), mcpServers: [] });
  const newResult = await waitForResponse(newId);
  const sessionId = newResult.sessionId;
  console.log("\nSession created:", sessionId);

  checkDisk("AFTER session/new");

  // Send a simple prompt
  console.log("\n--- Sending prompt: 'Say hello in one word' ---\n");
  const promptId = send("session/prompt", {
    sessionId,
    prompt: [{ type: "text", text: "Say hello in one word" }],
  });

  // Check disk while prompt is processing (after 2s)
  setTimeout(() => checkDisk("DURING prompt (2s)"), 2000);
  setTimeout(() => checkDisk("DURING prompt (5s)"), 5000);

  const promptResult = await waitForResponse(promptId);
  console.log("\n\nPrompt completed:", promptResult.stopReason);

  checkDisk("AFTER prompt completed");

  // Find new sessions
  const sessionsAfter = listSessions();
  const newSessions = sessionsAfter.filter((s) => !sessionsBefore.includes(s));

  if (newSessions.length > 0) {
    console.log("\n========================================");
    console.log("NEW sessions on disk:", newSessions);
    console.log("ACP session ID was:", sessionId);
    console.log(
      "Match?",
      newSessions.some((s) => s.includes(sessionId)),
    );
    console.log("========================================");
  } else {
    console.log("\n========================================");
    console.log("NO new sessions appeared on disk.");
    console.log("ACP sessions are memory-only.");
    console.log("========================================");
  }

  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  child.kill();
  process.exit(1);
});
