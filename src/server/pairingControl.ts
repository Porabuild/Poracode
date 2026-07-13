import { randomUUID } from "node:crypto";
import { closeSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";

const SERVER_LOCK_FILE = "server.lock";
const PAIRING_REQUEST_LOCK_FILE = "server-pairing-request.lock";
const PAIRING_REQUEST_FILE = "server-pairing-request.json";
const PAIRING_RESPONSE_FILE = "server-pairing-response.json";

interface PairingControlRequest {
  readonly requestId: string;
}

export interface PairingControlResponse {
  readonly requestId: string;
  readonly pairingUrl: string;
}

interface RequestPairingOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly requestId?: () => string;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly signalProcess?: (pid: number) => void;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function parseRequest(value: unknown): PairingControlRequest | null {
  if (!value || typeof value !== "object") return null;
  const requestId = (value as { requestId?: unknown }).requestId;
  return typeof requestId === "string" && requestId.length > 0 ? { requestId } : null;
}

function parseResponse(value: unknown): PairingControlResponse | null {
  if (!value || typeof value !== "object") return null;
  const requestId = (value as { requestId?: unknown }).requestId;
  const pairingUrl = (value as { pairingUrl?: unknown }).pairingUrl;
  return typeof requestId === "string" &&
    requestId.length > 0 &&
    typeof pairingUrl === "string" &&
    pairingUrl.length > 0
    ? { requestId, pairingUrl }
    : null;
}

function removeFile(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // Best-effort cleanup. A later request uses a fresh id and ignores stale data.
  }
}

/** Reports whether a pid is a live process this user can signal. */
export function pidIsAlive(pid: number): boolean {
  try {
    // Signal 0 performs error-checking without delivering a signal.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH: no such process (stale). EPERM: alive but owned by another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Read a pid from a lock file; unreadable/invalid contents count as stale. */
export function readPidFile(path: string): number | null {
  try {
    const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function acquireRequestLock(path: string, isProcessAlive: (pid: number) => boolean): void {
  let reclaimed = false;
  for (;;) {
    let fd: number;
    try {
      fd = openSync(path, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const holderPid = readPidFile(path);
      if (holderPid !== null && isProcessAlive(holderPid)) {
        throw new Error("Another pairing request is already in progress.", { cause: error });
      }
      if (reclaimed) {
        throw new Error("The stale pairing-request lock could not be reclaimed.", { cause: error });
      }
      reclaimed = true;
      removeFile(path);
      continue;
    }
    try {
      writeSync(fd, String(process.pid));
    } finally {
      closeSync(fd);
    }
    return;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handle a pending machine-readable pairing request from the headless CLI's
 * SIGUSR2 listener. Returns false when the signal was a regular manual request,
 * preserving the existing "print a fresh pairing URL" behavior in that case.
 */
export function fulfillPairingControlRequest(
  baseDir: string,
  issuePairingUrl: () => string,
): boolean {
  const requestPath = join(baseDir, PAIRING_REQUEST_FILE);
  const request = parseRequest(readJson(requestPath));
  if (!request) return false;
  const requesterPid = readPidFile(join(baseDir, PAIRING_REQUEST_LOCK_FILE));
  if (requesterPid === null || !pidIsAlive(requesterPid)) {
    removeFile(requestPath);
    return false;
  }

  const response: PairingControlResponse = {
    requestId: request.requestId,
    pairingUrl: issuePairingUrl(),
  };
  writeFileAtomic(join(baseDir, PAIRING_RESPONSE_FILE), `${JSON.stringify(response)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  removeFile(requestPath);
  return true;
}

/**
 * Ask an already-running headless server to mint a one-time pairing URL.
 * Communication stays local to the remote OS account: this process writes a
 * short-lived request, signals the PID in server.lock, and waits for the
 * in-process RemoteAccessServer to write the matching response.
 */
export async function requestPairingFromRunningServer(
  baseDir: string,
  options: RequestPairingOptions = {},
): Promise<PairingControlResponse> {
  if (process.platform === "win32" && !options.signalProcess) {
    throw new Error("Machine-readable pairing requires a POSIX headless server.");
  }

  const isProcessAlive = options.isProcessAlive ?? pidIsAlive;
  const pid = readPidFile(join(baseDir, SERVER_LOCK_FILE));
  if (pid === null) {
    throw new Error(`No running Poracode server found in ${baseDir}.`);
  }
  if (!isProcessAlive(pid)) {
    throw new Error(`Poracode server process ${pid} is not running.`);
  }

  const requestLockPath = join(baseDir, PAIRING_REQUEST_LOCK_FILE);
  acquireRequestLock(requestLockPath, isProcessAlive);

  const requestPath = join(baseDir, PAIRING_REQUEST_FILE);
  const responsePath = join(baseDir, PAIRING_RESPONSE_FILE);
  const requestId = (options.requestId ?? randomUUID)();
  const timeoutMs = options.timeoutMs ?? 5_000;
  // Human-scale bootstrap: 100 ms keeps ~50 sync reads off the 5 s worst case
  // without adding perceptible latency.
  const pollIntervalMs = options.pollIntervalMs ?? 100;

  try {
    removeFile(requestPath);
    removeFile(responsePath);
    writeFileAtomic(requestPath, `${JSON.stringify({ requestId })}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    (options.signalProcess ?? ((serverPid) => process.kill(serverPid, "SIGUSR2")))(pid);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const response = parseResponse(readJson(responsePath));
      if (response?.requestId === requestId) return response;
      await sleep(pollIntervalMs);
    }
    throw new Error("Timed out waiting for the Poracode server pairing response.");
  } finally {
    removeFile(requestPath);
    removeFile(responsePath);
    removeFile(requestLockPath);
  }
}
