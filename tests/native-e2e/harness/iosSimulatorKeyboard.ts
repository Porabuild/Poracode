import { execFile, spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { ChildProcessLifetime } from "@/shared/childProcessLifetime";
import type { ProcessCleanup } from "./processCleanup.ts";

/** Canonical 8-4-4-4-12 hex UUID (CoreSimulator UDIDs are case-insensitive). */
const EXACT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isExactUuid(value: string): boolean {
  return EXACT_UUID.test(value);
}

/** One hardware-key token: a single lowercase ASCII letter or a comma. */
export function isSimulatorKey(value: unknown): value is string {
  return typeof value === "string" && (value === "," || /^[a-z]$/.test(value));
}

/**
 * USB HID keyboard usages live in the driver. The HTTP layer validates the
 * token; the driver alone turns it into an integer so no caller argv can ever
 * reach the idb process (a-z -> 4..29, ',' -> 54).
 */
export function simulatorKeyToHidUsage(key: string): number {
  if (key === ",") return 54;
  if (/^[a-z]$/.test(key)) return key.charCodeAt(0) - "a".charCodeAt(0) + 4;
  throw new Error("Unsupported simulator key.");
}

export interface IosSimulatorKeyboardOptions {
  readonly udid: string;
  readonly cleanup: ProcessCleanup;
  readonly readinessTimeoutMs?: number;
  readonly commandTimeoutMs?: number;
  // Supervisor-owned socket directory (trusted same-run env); when supplied
  // the harness uses <socketRoot>/c.sock and leaves removal to the supervisor.
  readonly socketRoot?: string;
}

export interface IosSimulatorKeyboard {
  readonly pressSimulatorKey: (key: string, shift: boolean) => Promise<void>;
}

const HANDSHAKE_LIMIT_BYTES = 64_000;
const DEFAULT_READINESS_TIMEOUT_MS = 15_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;

/** Resolve a tool strictly by name from PATH; require a real, executable file. */
async function resolveOnPath(name: string): Promise<string> {
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, name);
    const isFile = await stat(candidate).then(
      (entry) => entry.isFile(),
      () => false,
    );
    if (!isFile) continue;
    const executable = await access(candidate, constants.X_OK).then(
      () => true,
      () => false,
    );
    if (executable) return candidate;
  }
  throw new Error(
    `iOS simulator keyboard qualification needs Meta idb and idb_companion on PATH; "${name}" was not found as an executable.`,
  );
}

/** Bounded, checked first-line `grpc_path` handshake (NativeDeviceDriver.ios). */
function awaitHandshake(child: ChildProcess, socketPath: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let output = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      child.stdout?.removeListener("data", onData);
      child.stdout?.resume();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error("idb_companion readiness timed out.")),
      timeoutMs,
    );
    const onError = () => finish(new Error("idb_companion failed to start."));
    const onExit = () => finish(new Error("idb_companion exited before its handshake."));
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > HANDSHAKE_LIMIT_BYTES) {
        finish(new Error("idb_companion handshake exceeds the limit."));
        return;
      }
      if (output.includes("\n")) {
        try {
          if (JSON.parse(output.split("\n")[0]!).grpc_path === socketPath) finish();
          else finish(new Error("idb_companion grpc_path mismatch."));
        } catch {
          finish(new Error("Invalid idb_companion handshake."));
        }
      }
    };
    child.once("error", onError);
    child.once("exit", onExit);
    child.stderr?.resume();
    child.stdout?.on("data", onData);
  });
}

/** Bounded, shell-free command execution; never surfaces raw process errors. */
function execFileBounded(
  cleanup: ProcessCleanup,
  file: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = execFile(
      file,
      [...args],
      {
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
      (error) => {
        if (error) reject(new Error("Simulator key command failed or timed out."));
        else resolve();
      },
    );
    // In-flight key presses are owned too, so shutdown can account for them.
    cleanup.trackChild(child);
  });
}

/**
 * Own ONE scoped companion for ONE qualified simulator. Nothing here targets a
 * global idb companion or opens another listening port: the harness reuses its
 * authenticated ControlServer, and every command names our private socket.
 * The companion stays in the harness process group (no detached spawn), so both
 * ProcessCleanup's SIGTERM-then-SIGKILL and the supervisor's group SIGKILL
 * reach it. An internally allocated socket root is tracked and removed by
 * ProcessCleanup; a supervisor-provided root is owned (and removed) by the
 * supervisor. A failed handshake stops the companion through
 * ChildProcessLifetime and removes only an internally allocated root after
 * close is confirmed.
 */
export async function startIosSimulatorKeyboard(
  options: IosSimulatorKeyboardOptions,
): Promise<IosSimulatorKeyboard> {
  if (!isExactUuid(options.udid)) {
    throw new Error("--ios-hid-udid must be an exact simulator UUID.");
  }
  const idb = await resolveOnPath("idb");
  const companion = await resolveOnPath("idb_companion");
  // A supervisor-provided socket root is trusted (set from the supervisor's
  // own environment, never from a network request) and is removed by its
  // owner; otherwise allocate a private root that ProcessCleanup removes.
  const internalRoot = options.socketRoot === undefined;
  const root = options.socketRoot ?? (await mkdtemp(join(tmpdir(), "pora-hid-")));
  const socketPath = join(root, "c.sock");
  const child = spawn(
    companion,
    ["--udid", options.udid, "--grpc-domain-sock", socketPath, "--only", "simulator"],
    // Stay in the harness process group so the supervisor's group SIGKILL
    // reaches the companion even when shutdown deadlines collide.
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const lifetime = new ChildProcessLifetime(child);
  options.cleanup.trackChild(child);
  if (internalRoot) options.cleanup.trackTempDir(root);

  try {
    await awaitHandshake(
      child,
      socketPath,
      options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS,
    );
  } catch (error) {
    try {
      // Remove only an internally allocated root, and only after the
      // companion's close is confirmed; the supervisor owns a provided root.
      await lifetime.stop();
      if (internalRoot) await rm(root, { recursive: true, force: true });
    } catch (cleanupError) {
      // ProcessCleanup still owns the tracked child and any internally
      // allocated temp dir, so shutdown performs their eventual teardown.
      // Preserve both the startup failure and the nearest cleanup failure
      // instead of masking either.
      throw new AggregateError(
        [error, cleanupError],
        "iOS simulator keyboard startup failed and cleanup could not complete.",
        { cause: cleanupError },
      );
    }
    throw error;
  }

  const pressSimulatorKey = async (key: string, shift: boolean): Promise<void> => {
    if (!isSimulatorKey(key) || typeof shift !== "boolean") {
      throw new Error("Invalid simulator key request.");
    }
    const usage = simulatorKeyToHidUsage(key);
    await execFileBounded(
      options.cleanup,
      idb,
      [
        "--companion",
        socketPath,
        "ui",
        "key",
        String(usage),
        "--command",
        ...(shift ? ["--shift"] : []),
      ],
      options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    );
  };

  return { pressSimulatorKey };
}
