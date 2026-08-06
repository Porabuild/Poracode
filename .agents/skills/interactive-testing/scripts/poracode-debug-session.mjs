import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  inspectCdpWindowTargets,
  normalizeCdpAppUrl,
  parseCdpPort,
} from "./poracode-cdp-target.mjs";

export const DEBUG_SESSION_SCHEMA_VERSION = 1;

export function resolveSmokeRoot() {
  return resolve(process.env.PORACODE_SMOKE_ROOT ?? join(homedir(), ".poracode-smoke"));
}

export function resolveSessionFile(value) {
  const path = resolve(value);
  return path.toLowerCase().endsWith(".json") ? path : join(path, "session.json");
}

export function assertSessionRootOutsideRepo(sessionRoot, repoRoot) {
  const relation = relative(resolve(repoRoot), resolve(sessionRoot));
  if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) {
    throw new Error(
      `debug session root must be outside the repository so file watchers cannot restart Electron: ${sessionRoot}`,
    );
  }
}

export async function writeDebugSession(sessionFile, session) {
  await mkdir(dirname(sessionFile), { recursive: true });
  const tempFile = `${sessionFile}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(
    tempFile,
    `${JSON.stringify(
      {
        ...session,
        schemaVersion: DEBUG_SESSION_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  try {
    await rename(tempFile, sessionFile);
  } finally {
    await rm(tempFile, { force: true });
  }
}

export async function readDebugSession(value) {
  const sessionFile = resolveSessionFile(value);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(sessionFile, "utf8"));
  } catch (error) {
    throw new Error(
      `unable to read debug session ${sessionFile}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  validateDebugSession(parsed, sessionFile);
  return { ...parsed, sessionFile };
}

export async function listDebugSessions({ repoRoot, purpose } = {}) {
  const smokeRoot = resolveSmokeRoot();
  let entries;
  try {
    entries = await readdir(smokeRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const sessions = (
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const session = await readDebugSession(join(smokeRoot, entry.name, "session.json"));
            if (repoRoot && normalizeForCompare(session.repoRoot) !== normalizeForCompare(repoRoot))
              return null;
            if (purpose && session.purpose !== purpose) return null;
            return { ...session, active: isSessionActive(session) };
          } catch {
            // Old smoke roots and partially written manifests are not sessions.
            return null;
          }
        }),
    )
  ).filter(Boolean);
  return sessions.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export async function acquireDebugLaunchLock(repoRoot) {
  const lockKey = createHash("sha256")
    .update(normalizeForCompare(repoRoot))
    .digest("hex")
    .slice(0, 20);
  const locksRoot = join(tmpdir(), "poracode-debug-launch-locks");
  const lockDir = join(locksRoot, lockKey);
  const ownerFile = join(lockDir, "owner.json");
  const token = randomUUID();
  await mkdir(locksRoot, { recursive: true });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await mkdir(lockDir);
      await writeFile(
        ownerFile,
        `${JSON.stringify({ ownerPid: process.pid, token, repoRoot, startedAt: new Date().toISOString() }, null, 2)}\n`,
      );
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try {
          const owner = JSON.parse(await readFile(ownerFile, "utf8"));
          if (owner.token === token) await rm(lockDir, { recursive: true, force: true });
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let owner;
      try {
        owner = JSON.parse(await readFile(ownerFile, "utf8"));
      } catch {
        try {
          const lockAgeMs = Date.now() - (await stat(lockDir)).mtimeMs;
          if (lockAgeMs < 1_000) {
            await new Promise((done) => setTimeout(done, 100));
            continue;
          }
        } catch (statError) {
          if (statError?.code === "ENOENT") continue;
          throw statError;
        }
      }
      if (Number.isInteger(owner?.ownerPid) && isProcessRunning(owner.ownerPid)) {
        throw new Error(
          `another managed debug launcher is already reserving this checkout (owner PID ${owner.ownerPid}); wait for its session.json instead of launching again`,
          { cause: error },
        );
      }
      const staleDir = `${lockDir}.stale-${process.pid}-${randomUUID()}`;
      try {
        await rename(lockDir, staleDir);
        await rm(staleDir, { recursive: true, force: true });
      } catch (renameError) {
        if (renameError?.code !== "ENOENT") throw renameError;
      }
    }
  }
  throw new Error(`unable to acquire the managed debug launch lock for ${repoRoot}`);
}

export async function resolveDebugConnection({
  session,
  port,
  appUrl,
  repoRoot,
  allowedPurposes = ["debug"],
}) {
  if (session) {
    const manifest = await readDebugSession(session);
    assertActiveSession(manifest);
    if (!allowedPurposes.includes(manifest.purpose)) {
      throw new Error(
        `debug attachment requires a ${allowedPurposes.join(" or ")} session, got ${manifest.purpose}: ${manifest.sessionFile}`,
      );
    }
    if (normalizeForCompare(manifest.repoRoot) !== normalizeForCompare(repoRoot)) {
      throw new Error(
        `debug session belongs to a different checkout: ${manifest.repoRoot}; current checkout: ${repoRoot}`,
      );
    }
    return connectionFromSession(manifest);
  }

  const hasPort = port !== undefined && port !== null && String(port).trim() !== "";
  const hasAppUrl = appUrl !== undefined && appUrl !== null && String(appUrl).trim() !== "";
  if (hasPort || hasAppUrl) {
    if (!hasPort || !hasAppUrl) {
      throw new Error(
        "explicit CDP attachment requires both PORACODE_CDP_PORT and PORACODE_APP_URL (or --port and --appUrl); refusing to guess the missing half",
      );
    }
    return {
      port: parseCdpPort(port),
      appUrl: normalizeCdpAppUrl(String(appUrl)),
      sessionFile: null,
      sessionId: null,
      sessionToken: null,
      repoRoot: null,
    };
  }

  const sessions = (await listDebugSessions({ repoRoot, purpose: "debug" })).filter(
    (candidate) => candidate.active,
  );
  if (sessions.length === 0) {
    throw new Error(
      `no active managed Poracode debug session for ${repoRoot}. Start one with: node .agents/skills/interactive-testing/scripts/run-poracode-smoke.mjs --launch-only --mode mock`,
    );
  }
  if (sessions.length > 1) {
    const choices = sessions
      .map(
        (candidate) =>
          `${candidate.sessionFile} (CDP ${candidate.cdpPort}, app ${candidate.appUrl})`,
      )
      .join("; ");
    throw new Error(
      `multiple active Poracode debug sessions match this repository; pass --session <session.json>. Choices: ${choices}`,
    );
  }
  return connectionFromSession(sessions[0]);
}

function connectionFromSession(session) {
  return {
    port: session.cdpPort,
    appUrl: normalizeCdpAppUrl(session.appUrl),
    sessionFile: session.sessionFile,
    sessionId: session.id,
    sessionToken: session.token,
    repoRoot: session.repoRoot,
    root: session.root,
    mode: session.mode,
  };
}

export async function inspectDebugSessionHealth(session) {
  if (session.state === "starting") {
    const ageMs = Date.now() - Date.parse(session.startedAt);
    if (Number.isFinite(ageMs) && ageMs <= 240_000) return { status: "starting" };
    return { status: "unhealthy", detail: "session stayed in starting state for over 4 minutes" };
  }
  try {
    const inspection = await inspectCdpWindowTargets({
      port: session.cdpPort,
      appUrl: session.appUrl,
      windowKind: "main",
    });
    if (inspection.ready.length === 1) return { status: "ready", inspection };
    return {
      status: "unhealthy",
      detail: `expected one ready main target, found ${inspection.ready.length}; candidate health: ${JSON.stringify(inspection.candidateStates)}`,
    };
  } catch (error) {
    return { status: "unhealthy", detail: error instanceof Error ? error.message : String(error) };
  }
}

function validateDebugSession(value, sessionFile) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid debug session object in ${sessionFile}`);
  }
  if (value.schemaVersion !== DEBUG_SESSION_SCHEMA_VERSION) {
    throw new Error(`unsupported debug session schema in ${sessionFile}`);
  }
  for (const key of [
    "id",
    "token",
    "purpose",
    "state",
    "repoRoot",
    "root",
    "appUrl",
    "startedAt",
  ]) {
    if (typeof value[key] !== "string" || value[key].length === 0) {
      throw new Error(`debug session ${sessionFile} is missing ${key}`);
    }
  }
  value.cdpPort = parseCdpPort(value.cdpPort);
  value.devServerPort = parseCdpPort(value.devServerPort);
  if (!Number.isInteger(value.ownerPid) || value.ownerPid <= 0) {
    throw new Error(`debug session ${sessionFile} has an invalid ownerPid`);
  }
  if (value.mode !== "mock" && value.mode !== "real") {
    throw new Error(`debug session ${sessionFile} has an invalid mode`);
  }
  if (normalizeForCompare(value.root) !== normalizeForCompare(dirname(sessionFile))) {
    throw new Error(`debug session ${sessionFile} has a mismatched root: ${value.root}`);
  }
}

function assertActiveSession(session) {
  if (!isSessionActive(session)) {
    throw new Error(
      `debug session is not active: ${session.sessionFile} (state ${session.state}, owner PID ${session.ownerPid})`,
    );
  }
}

function isSessionActive(session) {
  return ["starting", "ready"].includes(session.state) && isProcessRunning(session.ownerPid);
}

export function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function normalizeForCompare(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
