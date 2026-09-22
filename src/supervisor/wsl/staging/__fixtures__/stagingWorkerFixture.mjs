import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const mode = process.env.FIXTURE_MODE ?? "echo";
const protocolVersion = Number(process.env.FIXTURE_PROTOCOL_VERSION ?? 3);

if (process.env.FIXTURE_PID_FILE) {
  writeFileSync(process.env.FIXTURE_PID_FILE, String(process.pid));
}

process.stdout.write(`${JSON.stringify({ type: "ready", protocolVersion })}\n`);

if (mode === "exit") {
  process.exit(0);
}

if (mode === "stall") {
  setInterval(() => {}, 1_000);
} else {
  const reader = createInterface({ input: process.stdin });
  reader.on("line", (line) => {
    let envelope;
    try {
      envelope = JSON.parse(line);
    } catch {
      return;
    }
    process.stdout.write(
      `${JSON.stringify({ type: "result", id: envelope.id, ok: true, result: { mode } })}\n`,
    );
  });
  reader.on("close", () => process.exit(0));
}
