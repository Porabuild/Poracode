// Probe: spawn `opencode serve`, send a small prompt, capture every SSE event.
// Used to verify the event ordering / field-name assumptions our SDK mapper
// relies on. Prints JSONL to stdout so it can be diff'd or piped through jq.
//
// Usage:
//   node scripts/probe-opencode-events.mjs [prompt]
//
// Prerequisite: opencode binary on PATH at C:/Users/sdsle/.opencode/bin/opencode.exe
// (or wherever the user's poracode resolution points to).

import { spawn } from "node:child_process";
import { createOpencodeClient } from "@opencode-ai/sdk/v2";

const OPENCODE_BIN = process.env.OPENCODE_BIN ?? "opencode";
const PROMPT = process.argv[2] ?? "hi";
const PROBE_TIMEOUT_MS = 60_000;

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(OPENCODE_BIN, ["serve", "--port", "0", "--hostname", "127.0.0.1"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let buffered = "";
    const onData = (chunk) => {
      buffered += chunk.toString("utf8");
      const m = buffered.match(/https?:\/\/127\.0\.0\.1:\d+/);
      if (m) {
        proc.stdout.off("data", onData);
        proc.stderr.off("data", onData);
        resolve({ proc, baseUrl: m[0] });
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`opencode serve exited with code ${code}; output:\n${buffered}`));
      }
    });
    setTimeout(
      () => reject(new Error(`opencode serve did not print URL within 10s; output:\n${buffered}`)),
      10_000,
    );
  });
}

const log = (label, payload) => {
  process.stdout.write(JSON.stringify({ t: Date.now(), label, ...payload }) + "\n");
};

async function main() {
  const { proc, baseUrl } = await startServer();
  log("server.ready", { baseUrl });

  const directory = process.cwd();
  const client = createOpencodeClient({ baseUrl, directory, throwOnError: true });

  // Subscribe BEFORE creating the session so we don't miss the first events.
  const ctrl = new AbortController();
  const sub = await client.global.event({ signal: ctrl.signal });
  let eventCount = 0;
  const eventTask = (async () => {
    try {
      for await (const raw of sub.stream) {
        const ev = raw?.payload?.type === "sync" ? undefined : (raw?.payload ?? raw);
        if (!ev?.type) continue;
        eventCount += 1;
        // Strip large fields so the log stays readable but still proves
        // routing: keep type, properties.{partID, messageID, field, delta, part.type, info.role, info.id, info.time}.
        const summary = { type: ev.type };
        const p = ev.properties ?? {};
        if (p.partID) summary.partID = p.partID;
        if (p.messageID) summary.messageID = p.messageID;
        if (typeof p.field === "string") summary.field = p.field;
        if (typeof p.delta === "string") {
          summary.delta = p.delta.length > 80 ? p.delta.slice(0, 80) + "…" : p.delta;
        }
        if (p.part) {
          summary.partType = p.part.type;
          if (typeof p.part.text === "string") {
            summary.partText =
              p.part.text.length > 80 ? p.part.text.slice(0, 80) + "…" : p.part.text;
          }
          if (p.part.time) summary.partTime = p.part.time;
        }
        if (p.info) {
          summary.infoRole = p.info.role;
          summary.infoId = p.info.id;
          summary.infoTime = p.info.time;
        }
        log("event", summary);
        if (ev.type === "session.idle") ctrl.abort();
      }
    } catch (err) {
      if (!ctrl.signal.aborted) log("event.error", { message: String(err) });
    }
  })();

  const created = await client.session.create({ directory, title: "probe" });
  const sessionID = created.data?.id;
  log("session.created", { sessionID });

  await client.session.promptAsync({
    directory,
    sessionID,
    parts: [{ type: "text", text: PROMPT }],
  });
  log("prompt.sent", { prompt: PROMPT });

  // Wait for session.idle or timeout.
  await new Promise((resolve) => {
    const t = setTimeout(resolve, PROBE_TIMEOUT_MS);
    sub.stream.controller?.signal?.addEventListener?.("abort", () => {
      clearTimeout(t);
      resolve();
    });
    setTimeout(resolve, PROBE_TIMEOUT_MS);
  });

  ctrl.abort();
  await eventTask.catch(() => {});
  proc.kill();
  log("done", { eventCount });
}

main().catch((err) => {
  log("fatal", { message: String(err?.stack ?? err) });
  process.exit(1);
});
