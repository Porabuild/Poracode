import { closeSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const mode = process.env.FIXTURE_MODE ?? "echo";
const protocolVersion = Number(process.env.FIXTURE_PROTOCOL_VERSION ?? 3);

if (process.env.FIXTURE_PID_FILE) {
  writeFileSync(process.env.FIXTURE_PID_FILE, String(process.pid));
}

if (mode === "close-input") closeSync(0);

const emitReady = () => {
  process.stdout.write(`${JSON.stringify({ type: "ready", protocolVersion })}\n`);
};

if (mode === "exit") {
  emitReady();
  process.exit(0);
} else if (mode === "close-input") {
  emitReady();
  setTimeout(() => process.exit(3), 200);
} else if (mode === "stall") {
  emitReady();
  setInterval(() => {}, 1_000);
} else {
  // One readline handler, one JSON parser and one close handler for every
  // mode that stays alive; only the split-utf8 write is special-cased.
  let readyEmitted = false;
  const reader = createInterface({ input: process.stdin });
  reader.on("line", (line) => {
    let envelope;
    try {
      envelope = JSON.parse(line);
    } catch {
      return;
    }
    let result;
    if (mode === "split-utf8") {
      result = { exists: true, entries: [{ name: "évidence", directory: false }] };
    } else if (mode === "delayed-ready") {
      result = { mode, requestBeforeReady: !readyEmitted };
    } else {
      result = { mode };
    }
    const message = Buffer.from(
      `${JSON.stringify({ type: "result", id: envelope.id, ok: true, result })}\n`,
      "utf8",
    );
    if (mode === "split-utf8") {
      // Split the two UTF-8 bytes of "é" (0xC3 0xA9) across two writes so a
      // byte-wise reader decodes two replacement characters instead of "é".
      const splitAt = message.indexOf(Buffer.from("é", "utf8")) + 1;
      process.stdout.write(message.subarray(0, splitAt), () => {
        setTimeout(() => process.stdout.write(message.subarray(splitAt)), 150);
      });
    } else {
      process.stdout.write(message);
    }
  });
  reader.on("close", () => process.exit(0));

  if (mode === "delayed-ready") {
    // Readline already listens; defer ready so an early request can be echoed
    // before the (possibly incompatible) handshake lands.
    setTimeout(() => {
      readyEmitted = true;
      emitReady();
    }, 200);
  } else if (mode !== "no-ready") {
    emitReady();
  }
}
