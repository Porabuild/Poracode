/**
 * Runtime helpers for server processes: the installed-server CLI runner,
 * its JSON output parsing, loopback port allocation, per-profile child
 * environment, PTY/console wait signals, and daemon lifecycle (child and
 * pid-file owned).
 */

import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { redactSecrets } from "./redaction.mjs";

/** Run an installed-server CLI command; every failure output is redacted. */
export function runServerCli(entry, args, env, { timeoutMs = 300_000 } = {}) {
  const run = spawnSync(process.execPath, [entry, ...args], {
    encoding: "utf8",
    env,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = run.stdout ?? "";
  const stderr = run.stderr ?? "";
  if (run.status !== 0) {
    throw new Error(
      `server CLI ${args[0]} exited ${run.status}: ${redactSecrets(stdout).trim()} ${redactSecrets(stderr).trim()}`.trim(),
    );
  }
  return { status: run.status, stdout, stderr };
}

export function parseLastJsonLine(output) {
  const line = output.trim().split("\n").at(-1);
  return JSON.parse(line);
}

/** Extract the one-use pairing credential from raw `pair --json` output. */
export function pairingCredentialFromCliOutput(output) {
  const pairing = parseLastJsonLine(output);
  const credential = new URLSearchParams(new URL(pairing.pairingUrl).hash.replace(/^#/, "")).get(
    "token",
  );
  if (!credential) throw new Error("pair --json output carries no credential token");
  return credential;
}

export function allocateLoopbackPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

/** Environment for a spawned server/CLI step. `port === null` selects a
 * read-only one-shot command (doctor, pair, status) that must not bind. */
export function serverEnv(profile, port) {
  const inherited = { ...process.env };
  // The qualification process needs these for GitHub release downloads; the
  // installed server and the real PTY it launches do not. Keep workflow
  // credentials out of child environments entirely.
  delete inherited.GH_TOKEN;
  delete inherited.GITHUB_TOKEN;
  return {
    ...inherited,
    PORACODE_BASE_DIR: profile,
    PORACODE_HEADLESS_SERVER: "1",
    PORACODE_SECRET_STORAGE_KEY:
      process.env.PORACODE_SECRET_STORAGE_KEY ?? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    ...(port === null
      ? {}
      : { PORACODE_REMOTE_ACCESS_HOST: "127.0.0.1", PORACODE_REMOTE_ACCESS_PORT: String(port) }),
  };
}

export function waitForText(stream, needle, timeoutMs) {
  return new Promise((resolveWait, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${needle}`)), timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes(needle)) {
        clearTimeout(timer);
        stream.off("data", onData);
        resolveWait(buffer);
      }
    };
    stream.on("data", onData);
  });
}

export async function healthOk(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}

export function startPtyWatch(wsUrl, shellId) {
  const ws = new WebSocket(wsUrl);
  let buffer = "";
  const opened = new Promise((resolveOpened, reject) => {
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "terminal-watch", id: shellId }));
      resolveOpened();
    });
    ws.addEventListener("error", () => reject(new Error("terminal watch failed to connect")));
  });
  return {
    opened,
    waitFor(needle, timeoutMs) {
      return new Promise((resolveFrame, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`timed out waiting for PTY output ${needle}`)),
          timeoutMs,
        );
        const onMessage = (event) => {
          let frame;
          try {
            frame = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (frame?.type === "terminal-output" && typeof frame.data === "string") {
            buffer += frame.data;
            if (buffer.includes(needle)) {
              clearTimeout(timer);
              ws.removeEventListener("message", onMessage);
              resolveFrame(true);
            }
          }
        };
        if (buffer.includes(needle)) {
          clearTimeout(timer);
          resolveFrame(true);
          return;
        }
        ws.addEventListener("message", onMessage);
      });
    },
    close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
    },
  };
}

export async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveExit();
    }, 20_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit();
    });
  });
}

function readOwnerRecord(profile) {
  const path = `${profile}.host-owner.json`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function waitForOwnerPhase(profile, phase, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const record = readOwnerRecord(profile);
    let holderGone = true;
    if (record && Number.isSafeInteger(record.pid) && record.pid > 0) {
      try {
        process.kill(record.pid, 0);
        holderGone = false;
      } catch {
        holderGone = true;
      }
    }
    if (record?.phase === phase && holderGone) return record;
    if (Date.now() >= deadline) {
      throw new Error(
        `owner lease did not reach phase=${phase}: ${JSON.stringify(readOwnerRecord(profile))}`,
      );
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
}

/**
 * Stop a daemon this script does not own as a child — the upgrade CLI
 * respawns the candidate detached and records its pid at
 * `<prefix>/poracode-server.pid`. Without this the respawned daemon would
 * outlive the gate still holding the lease and the port.
 */
export async function stopPidFileDaemon(prefix, profile) {
  const pidPath = join(prefix, "poracode-server.pid");
  if (!existsSync(pidPath)) return;
  const pid = Number(readFileSync(pidPath, "utf8").trim());
  if (Number.isSafeInteger(pid) && pid > 0) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  await waitForOwnerPhase(profile, "stopped", 30_000);
}
