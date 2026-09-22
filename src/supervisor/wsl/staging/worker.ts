import { createInterface } from "node:readline";
import { executeStagingRequest } from "./backend";
import {
  WSL_STAGING_PROTOCOL_VERSION,
  type WslStagingRequestEnvelope,
  type WslStagingResultMessage,
  type WslStagingWorkerMessage,
} from "./protocol";

/**
 * Line-delimited JSON worker. Requests are served strictly in arrival order
 * so a deploy issued later can never be overtaken by an earlier one (stale
 * writes cannot win); the supervisor can kill the whole process when any
 * request exceeds its deadline.
 */

function write(message: WslStagingWorkerMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handleLine(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  let envelope: WslStagingRequestEnvelope;
  try {
    envelope = JSON.parse(trimmed) as WslStagingRequestEnvelope;
  } catch {
    return;
  }
  if (
    !envelope ||
    typeof envelope.id !== "string" ||
    envelope.protocolVersion !== WSL_STAGING_PROTOCOL_VERSION
  ) {
    const rejected: WslStagingResultMessage = {
      type: "result",
      id: typeof envelope?.id === "string" ? envelope.id : "",
      ok: false,
      error: { message: "unsupported staging protocol version" },
    };
    write(rejected);
    return;
  }
  try {
    const result = await executeStagingRequest(envelope.request);
    const message: WslStagingResultMessage = { type: "result", id: envelope.id, ok: true };
    if (result !== undefined) message.result = result;
    write(message);
  } catch (error) {
    write({
      type: "result",
      id: envelope.id,
      ok: false,
      error: { message: error instanceof Error ? error.message : String(error) },
    });
  }
}

function main(): void {
  write({ type: "ready", protocolVersion: WSL_STAGING_PROTOCOL_VERSION });
  const reader = createInterface({ input: process.stdin });
  let chain = Promise.resolve();
  reader.on("line", (line) => {
    chain = chain.then(() => handleLine(line));
  });
  reader.on("close", () => {
    void chain.finally(() => process.exit(0));
  });
}

main();
