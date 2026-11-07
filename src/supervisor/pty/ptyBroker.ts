import { randomUUID } from "node:crypto";
import type { IPty } from "node-pty";
import {
  PTY_BROKER_CONTROL_MAX_BYTES,
  PTY_BROKER_PROTOCOL_VERSION,
  ptyBrokerRequestSchema,
  type PtyBrokerLaunch,
  type PtyBrokerReply,
} from "@/shared/contracts/ptyBroker";
import { ptyJobNonceSchema } from "@/shared/contracts/ptyJobOwner";

const nonce = ptyJobNonceSchema.safeParse(process.argv[2]);
if (!nonce.success || process.argv.length !== 3 || !process.send) process.exit(64);
const base = { version: PTY_BROKER_PROTOCOL_VERSION, nonce: nonce.data } as const;
const bootstrapId = randomUUID();
let pty: IPty | undefined;
let proved = false;
let starting = false;
let ending = false;
let paused = false;
let stdoutBlocked = false;
let controlBytes = 0;

function send(frame: PtyBrokerReply, done?: () => void): void {
  if (!process.connected || !process.send) process.exit(1);
  const bytes = Buffer.byteLength(JSON.stringify(frame));
  controlBytes += bytes;
  if (controlBytes > PTY_BROKER_CONTROL_MAX_BYTES) process.exit(1);
  try {
    process.send(frame, (error: Error | null) => {
      controlBytes -= bytes;
      if (error) process.exit(1);
      done?.();
    });
  } catch {
    process.exit(1);
  }
}

function fail(code: "protocol" | "launch" | "control" | "transport"): void {
  if (ending) return;
  ending = true;
  // Do not serialize native errors, argv or environment values. The supervisor
  // still owes kernel retirement and process/pipe joins after this failure.
  send({ ...base, kind: "error", code }, () => process.exit(1));
}

async function start(launch: PtyBrokerLaunch): Promise<void> {
  // Native loading and the real spawn occur only after the owning supervisor
  // has completed private proof and assigned this bootstrap to its kernel job.
  const { spawn } = await import("node-pty");
  if (ending) return;
  const { handleFlowControl, flowControlPause, flowControlResume, encoding, ...required } =
    launch.options;
  pty = spawn(launch.command, launch.args, {
    ...required,
    ...(handleFlowControl !== undefined ? { handleFlowControl } : {}),
    ...(flowControlPause !== undefined ? { flowControlPause } : {}),
    ...(flowControlResume !== undefined ? { flowControlResume } : {}),
    ...(encoding !== undefined ? { encoding } : {}),
  });
  pty.onData((data) => {
    if (!process.stdout.write(data) && !stdoutBlocked) {
      stdoutBlocked = true;
      pty?.pause();
    }
  });
  pty.onExit((event) => {
    if (ending) return;
    ending = true;
    // IPC and stdout are separate pipes. Flush all captured final bytes before
    // publishing exit; the supervisor additionally joins stdout's actual close.
    process.stdout.write("", () =>
      send(
        {
          ...base,
          kind: "exited",
          exitCode: event.exitCode,
          ...(event.signal !== undefined ? { signal: event.signal } : {}),
        },
        () => process.exit(0),
      ),
    );
  });
  send({ ...base, kind: "started", pid: pty.pid, cols: pty.cols, rows: pty.rows });
  process.stdin.resume();
}

process.stdout.on("drain", () => {
  stdoutBlocked = false;
  if (!paused && !ending) pty?.resume();
});
process.stdout.on("error", () => process.exit(1));
process.stderr.on("error", () => process.exit(1));
process.stdin.pause();
process.stdin.on("data", (data: Buffer) => {
  try {
    if (pty && !ending) pty.write(data);
  } catch {
    fail("control");
  }
});
process.stdin.on("end", () => process.exit(0));
process.stdin.on("error", () => fail("transport"));
process.once("disconnect", () => process.exit(0));

process.on("message", (message: unknown) => {
  if (ending) return;
  if (Buffer.byteLength(JSON.stringify(message)) > PTY_BROKER_CONTROL_MAX_BYTES) {
    fail("protocol");
    return;
  }
  const parsed = ptyBrokerRequestSchema.safeParse(message);
  if (!parsed.success || parsed.data.nonce !== base.nonce) {
    fail("protocol");
    return;
  }
  const frame = parsed.data;
  if (frame.kind === "prove") {
    if (starting || frame.bootstrapId !== bootstrapId) {
      fail("protocol");
      return;
    }
    proved = true;
    send({
      ...base,
      kind: "proof",
      pid: process.pid,
      bootstrapId,
      operationId: frame.operationId,
      creationTicks: frame.creationTicks,
    });
    return;
  }
  if (frame.kind === "start") {
    if (!proved || starting) {
      fail("protocol");
      return;
    }
    starting = true;
    void start(frame.launch).catch(() => fail("launch"));
    return;
  }
  if (!pty) {
    fail("protocol");
    return;
  }
  try {
    switch (frame.kind) {
      case "resize":
        pty.resize(frame.cols, frame.rows);
        break;
      case "clear":
        pty.clear();
        break;
      case "pause":
        paused = true;
        pty.pause();
        break;
      case "resume":
        paused = false;
        if (!stdoutBlocked) pty.resume();
        break;
      case "flow-control":
        pty.handleFlowControl = frame.enabled;
        break;
    }
  } catch {
    fail("control");
  }
});

send({ ...base, kind: "ready", pid: process.pid, bootstrapId });
