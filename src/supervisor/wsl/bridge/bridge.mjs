#!/usr/bin/env node
/**
 * Lightcode in-distro bridge server — runs INSIDE a WSL distro.
 *
 * Owns two kinds of endpoints, both guarded by the shared bearer secret:
 *
 *   1. `/v1/agent-event` — ingress for CLI hook plugins that live inside
 *      the distro. They can't reach the Windows-host `HookIngress` via
 *      WSL2 NAT loopback, so they POST to this bridge and it forwards the
 *      envelope out over stdout to the supervisor.
 *
 *   2. `/v1/fs/*` and `/v1/git/*` — filesystem and Git operations requested
 *      by the supervisor for WSL projects. Handlers execute inside the distro
 *      (no UNC, no 9P). FS path-safety: every path argument must be absolute
 *      and resolve within a `projectRoot` the caller declares. Git execution
 *      only accepts structured argv for the `git` binary, never shell strings.
 *
 * Wire format on stdout (unchanged; reads are HTTP responses):
 *   {"type":"boot","port":<n>,"protocolVersion":<n>,"version":"<x>"}\n once
 *   {"type":"event","payload":<envelope>}\n                       per hook
 *   {"type":"error","message":"…"}\n                              optional
 *
 * The script intentionally has no `import`s beyond `node:*` and writes
 * only transient response buffers — no state on disk.
 *
 * The `version` field in `boot` is consumed by the Windows-side
 * `WslBridgeServer` to detect stale copies. Bump on every behavioural
 * change to the wire format, auth model, or endpoint surface.
 */

import { createServer } from "node:http";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  opendirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  existsSync,
  lstatSync,
  writeFileSync,
  watch as fsWatch,
} from "node:fs";
// We always run on Linux inside a distro, so force POSIX semantics — this
// also keeps the unit tests path-agnostic when executed on a Windows host.
import { isAbsolute, normalize, resolve as resolvePath } from "node:path/posix";
import { createRequire } from "node:module";

// Bumped on every behavioural change. Windows side reads this via regex.
const BRIDGE_VERSION = "2.8.1";

/**
 * Lazily loads `@parcel/watcher` (staged next to this script as
 * `watcher.node`). Returns null if the binding is missing or the host CPU
 * can't load it — callers fall back to `fs.watch`.
 */
let cachedParcel;
function loadParcelWatcher() {
  if (cachedParcel !== undefined) return cachedParcel;
  try {
    const require = createRequire(import.meta.url);
    const binding = require("./watcher.node");
    if (binding && typeof binding.subscribe === "function") {
      cachedParcel = binding;
      return binding;
    }
  } catch {
    // fall through
  }
  cachedParcel = null;
  return null;
}

const PROTOCOL_VERSION = Number(process.env.LIGHTCODE_HOOK_PROTOCOL_VERSION ?? "1") || 1;
const SECRET = process.env.LIGHTCODE_HOOK_SECRET;
const HOOK_PATH = "/v1/agent-event";
const MAX_HOOK_BODY_BYTES = 64 * 1024;
// Large enough for a ~1MB editable file after base64 expansion (+33%) plus
// JSON framing. Hard cap — anything larger should use a streaming transport.
const MAX_FS_BODY_BYTES = 2 * 1024 * 1024;
const MAX_FIND_ENTRIES = 50_000;
const MAX_GIT_COMMANDS = 256;
const MAX_GIT_TIMEOUT_MS = 300_000;
const VALID_INTENTS = new Set([
  "session.started",
  "session.turn_started",
  "session.needs_approval",
  "session.needs_reply",
  "session.turn_finished",
  "session.turn_errored",
]);
const EMPTY_GIT_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const LIGHTCODE_CHECKPOINT_REF_RE =
  /^refs\/lightcode\/checkpoints\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
let cachedLoginShellEnv;

if (!SECRET) {
  emit({ type: "error", message: "LIGHTCODE_HOOK_SECRET missing in bridge env" });
  process.exit(2);
}

function emit(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function respond(res, status, body) {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function respondOk(res, data) {
  respond(res, 200, { ok: true, data });
}

function respondErr(res, status, code, message) {
  respond(res, status, { ok: false, code, message });
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;
    let oversized = false;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (oversized) return;
      if (total > maxBytes) {
        oversized = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (oversized) {
        reject(new Error("payload_too_large"));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function validateEnvelope(json) {
  if (!json || typeof json !== "object") return null;
  const protocolVersion = json.protocolVersion;
  const agentKind = json.agentKind;
  const pluginVersion = json.pluginVersion;
  const ts = json.ts;
  const intent = json.intent;
  if (
    typeof protocolVersion !== "number" ||
    !Number.isInteger(protocolVersion) ||
    protocolVersion < 1
  )
    return null;
  if (typeof agentKind !== "string" || agentKind.length === 0) return null;
  if (typeof pluginVersion !== "string" || pluginVersion.length === 0) return null;
  if (typeof ts !== "number" || !Number.isInteger(ts) || ts < 0) return null;
  if (typeof intent !== "string" || !VALID_INTENTS.has(intent)) return null;
  const threadId =
    typeof json.threadId === "string" && json.threadId.length > 0 ? json.threadId : undefined;
  const sessionId =
    typeof json.sessionId === "string" && json.sessionId.length > 0 ? json.sessionId : undefined;
  if (!threadId && !sessionId) return null;
  return json;
}

/**
 * Return the normalized absolute form of `target` if (a) `target` is an
 * absolute POSIX path, (b) `projectRoot` is an absolute POSIX path, and
 * (c) `target` is equal to or nested within `projectRoot`. Returns null on
 * any violation — callers surface this as ESCAPE.
 */
function resolveSafePath(projectRoot, target) {
  if (typeof projectRoot !== "string" || !isAbsolute(projectRoot)) return null;
  if (typeof target !== "string" || !isAbsolute(target)) return null;
  const normRoot = normalize(projectRoot);
  const normTarget = normalize(target);
  if (normTarget !== normRoot && !normTarget.startsWith(normRoot + "/")) return null;
  return normTarget;
}

function classifyDirent(dirent) {
  if (dirent.isDirectory()) return "directory";
  if (dirent.isSymbolicLink()) return "symlink";
  if (dirent.isFile()) return "file";
  return "other";
}

function readdirHandler(req, body) {
  const target = resolveSafePath(body.projectRoot, body.path);
  if (!target) return { status: 400, code: "ESCAPE", message: "path escapes projectRoot" };
  let entries;
  try {
    entries = readdirSync(target, { withFileTypes: true });
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    const status = code === "ENOENT" ? 404 : 500;
    return { status, code, message: String(err?.message ?? err) };
  }
  const includeChildCount = Boolean(body.includeChildCount);
  const result = [];
  for (const d of entries) {
    const type = classifyDirent(d);
    const full = resolvePath(target, d.name);
    if (type === "symlink") {
      let isDirectoryLink = false;
      try {
        isDirectoryLink = statSync(full).isDirectory();
      } catch {
        // broken symlink; report as symlink, no directory hint
      }
      const entry = { name: d.name, type, isDirectoryLink };
      if (includeChildCount && isDirectoryLink) {
        entry.hasChildren = dirHasVisibleChildren(full);
      }
      result.push(entry);
      continue;
    }
    const entry = { name: d.name, type };
    if (includeChildCount && type === "directory") {
      entry.hasChildren = dirHasVisibleChildren(full);
    }
    result.push(entry);
  }
  return { status: 200, data: { entries: result } };
}

function dirHasVisibleChildren(dir) {
  let handle;
  try {
    handle = opendirSync(dir);
    // Walk entries one at a time; first non-`.git` wins. For huge dirs
    // (node_modules/*) this avoids allocating an N-entry array just to
    // ask "is anything here?".
    for (;;) {
      const entry = handle.readSync();
      if (!entry) return false;
      if (entry.name !== ".git") return true;
    }
  } catch {
    return false;
  } finally {
    try {
      handle?.closeSync();
    } catch {
      // best effort
    }
  }
}

function statHandler(req, body) {
  if (!Array.isArray(body.paths))
    return { status: 400, code: "EINVAL", message: "paths must be an array" };
  const results = [];
  for (const rawPath of body.paths) {
    const target = resolveSafePath(body.projectRoot, rawPath);
    if (!target) {
      results.push({ path: rawPath, exists: false, code: "ESCAPE" });
      continue;
    }
    try {
      const st = body.follow ? statSync(target) : lstatSync(target);
      results.push({
        path: rawPath,
        exists: true,
        isDirectory: st.isDirectory(),
        isFile: st.isFile(),
        isSymlink: st.isSymbolicLink(),
        size: st.size,
        mtimeMs: st.mtimeMs,
      });
    } catch (err) {
      const code = typeof err?.code === "string" ? err.code : "EIO";
      results.push({ path: rawPath, exists: false, code });
    }
  }
  return { status: 200, data: { stats: results } };
}

function findHandler(req, body) {
  const root = resolveSafePath(body.projectRoot, body.root ?? body.projectRoot);
  if (!root) return { status: 400, code: "ESCAPE", message: "root escapes projectRoot" };
  const ignore = new Set(Array.isArray(body.ignore) ? body.ignore : []);
  const maxEntries = Math.min(
    typeof body.maxEntries === "number" && body.maxEntries > 0 ? body.maxEntries : MAX_FIND_ENTRIES,
    MAX_FIND_ENTRIES,
  );

  const entries = [];
  const stack = [root];
  let truncated = false;

  while (stack.length > 0) {
    const dir = stack.pop();
    let dirents;
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirents) {
      if (ignore.has(d.name)) continue;
      const full = `${dir}/${d.name}`;
      const rel = full.slice(root.length).replace(/^\/+/, "");
      if (d.isDirectory()) {
        entries.push({ path: rel, name: d.name, type: "directory" });
        if (entries.length >= maxEntries) {
          truncated = true;
          break;
        }
        stack.push(full);
        continue;
      }
      if (d.isFile()) {
        entries.push({ path: rel, name: d.name, type: "file" });
        if (entries.length >= maxEntries) {
          truncated = true;
          break;
        }
      }
    }
    if (truncated) break;
  }

  return { status: 200, data: { entries, truncated } };
}

function readFileHandler(req, body) {
  const target = resolveSafePath(body.projectRoot, body.path);
  if (!target) return { status: 400, code: "ESCAPE", message: "path escapes projectRoot" };
  let st;
  try {
    st = statSync(target);
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    return { status: code === "ENOENT" ? 404 : 500, code, message: String(err?.message ?? err) };
  }
  if (!st.isFile()) {
    return { status: 400, code: "EISDIR", message: "path is not a file" };
  }
  const maxBytes = typeof body.maxBytes === "number" && body.maxBytes > 0 ? body.maxBytes : 0;
  if (maxBytes > 0 && st.size > maxBytes) {
    return {
      status: 200,
      data: { tooLarge: true, size: st.size, mtimeMs: st.mtimeMs },
    };
  }
  let buffer;
  try {
    buffer = readFileSync(target);
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    return { status: 500, code, message: String(err?.message ?? err) };
  }
  return {
    status: 200,
    data: {
      size: st.size,
      mtimeMs: st.mtimeMs,
      contentBase64: buffer.toString("base64"),
    },
  };
}

function writeFileHandler(req, body) {
  const target = resolveSafePath(body.projectRoot, body.path);
  if (!target) return { status: 400, code: "ESCAPE", message: "path escapes projectRoot" };
  if (typeof body.contentBase64 !== "string") {
    return { status: 400, code: "EINVAL", message: "contentBase64 required" };
  }
  let existingStat;
  try {
    existingStat = statSync(target);
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    return { status: code === "ENOENT" ? 404 : 500, code, message: String(err?.message ?? err) };
  }
  if (!existingStat.isFile()) {
    return { status: 400, code: "EISDIR", message: "path is not a file" };
  }
  if (
    typeof body.expectedMtimeMs === "number" &&
    Math.abs(existingStat.mtimeMs - body.expectedMtimeMs) > 1
  ) {
    return {
      status: 409,
      code: "EMTIME",
      message: "file changed on disk since it was read",
    };
  }
  let data;
  try {
    data = Buffer.from(body.contentBase64, "base64");
  } catch {
    return { status: 400, code: "EINVAL", message: "invalid base64 body" };
  }
  try {
    writeFileSync(target, data);
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    return { status: 500, code, message: String(err?.message ?? err) };
  }
  let nextStat;
  try {
    nextStat = statSync(target);
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    return { status: 500, code, message: String(err?.message ?? err) };
  }
  return { status: 200, data: { mtimeMs: nextStat.mtimeMs, size: nextStat.size } };
}

function mkdirHandler(req, body) {
  const target = resolveSafePath(body.projectRoot, body.path);
  if (!target) return { status: 400, code: "ESCAPE", message: "path escapes projectRoot" };
  try {
    mkdirSync(target, { recursive: Boolean(body.recursive) });
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    return { status: 500, code, message: String(err?.message ?? err) };
  }
  return { status: 200, data: {} };
}

function rmHandler(req, body) {
  const target = resolveSafePath(body.projectRoot, body.path);
  if (!target) return { status: 400, code: "ESCAPE", message: "path escapes projectRoot" };
  // Never allow deleting the project root itself — protects against a
  // malformed request wiping a whole project.
  if (target === normalize(body.projectRoot)) {
    return { status: 400, code: "EINVAL", message: "refusing to remove projectRoot" };
  }
  try {
    rmSync(target, {
      recursive: Boolean(body.recursive),
      force: Boolean(body.force),
    });
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    return { status: 500, code, message: String(err?.message ?? err) };
  }
  return { status: 200, data: {} };
}

function renameHandler(req, body) {
  const from = resolveSafePath(body.projectRoot, body.from);
  const to = resolveSafePath(body.projectRoot, body.to);
  if (!from || !to) {
    return {
      status: 400,
      code: "ESCAPE",
      message: "rename endpoints must stay within projectRoot",
    };
  }
  try {
    renameSync(from, to);
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    return { status: 500, code, message: String(err?.message ?? err) };
  }
  return { status: 200, data: {} };
}

function writeNewFileHandler(req, body) {
  const target = resolveSafePath(body.projectRoot, body.path);
  if (!target) return { status: 400, code: "ESCAPE", message: "path escapes projectRoot" };
  if (typeof body.contentBase64 !== "string") {
    return { status: 400, code: "EINVAL", message: "contentBase64 required" };
  }
  let data;
  try {
    data = Buffer.from(body.contentBase64, "base64");
  } catch {
    return { status: 400, code: "EINVAL", message: "invalid base64 body" };
  }
  try {
    writeFileSync(target, data, { flag: "wx" });
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    return { status: code === "EEXIST" ? 409 : 500, code, message: String(err?.message ?? err) };
  }
  let st;
  try {
    st = statSync(target);
  } catch (err) {
    const code = typeof err?.code === "string" ? err.code : "EIO";
    return { status: 500, code, message: String(err?.message ?? err) };
  }
  return { status: 200, data: { mtimeMs: st.mtimeMs, size: st.size } };
}

function git(args, cwd, env) {
  return execFileSync("git", args, {
    cwd,
    env: { ...sanitizeGitEnv(process.env), GIT_OPTIONAL_LOCKS: "0", ...(env ?? {}) },
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

function gitMaybe(args, cwd, env) {
  try {
    return git(args, cwd, env).trim();
  } catch {
    return "";
  }
}

function validateGitCommand(body) {
  if (!body || typeof body !== "object") {
    return { error: { status: 400, code: "EINVAL", message: "body object required" } };
  }
  if (typeof body.cwd !== "string" || !isAbsolute(body.cwd)) {
    return { error: { status: 400, code: "EINVAL", message: "cwd must be absolute" } };
  }
  if (!Array.isArray(body.args) || body.args.some((arg) => typeof arg !== "string")) {
    return { error: { status: 400, code: "EINVAL", message: "args must be a string array" } };
  }
  if (body.loginEnv !== undefined && typeof body.loginEnv !== "boolean") {
    return { error: { status: 400, code: "EINVAL", message: "loginEnv must be a boolean" } };
  }
  let env;
  if (body.env !== undefined) {
    if (!body.env || typeof body.env !== "object" || Array.isArray(body.env)) {
      return { error: { status: 400, code: "EINVAL", message: "env must be an object" } };
    }
    env = {};
    for (const [key, value] of Object.entries(body.env)) {
      if (typeof value !== "string") {
        return { error: { status: 400, code: "EINVAL", message: "env values must be strings" } };
      }
      env[key] = value;
    }
  }
  return {
    command: {
      cwd: normalize(body.cwd),
      args: body.args,
      env,
      loginEnv: body.loginEnv === true,
      timeoutMs: normalizeGitTimeout(body.timeoutMs),
    },
  };
}

function normalizeGitTimeout(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 15_000;
  return Math.min(Math.max(Math.floor(value), 1000), MAX_GIT_TIMEOUT_MS);
}

function resolveLoginShellPath() {
  if (typeof process.env.SHELL === "string" && isAbsolute(process.env.SHELL)) {
    return process.env.SHELL;
  }
  try {
    const shell = execFileSync("sh", ["-lc", 'getent passwd "$(id -un)" | cut -d: -f7'], {
      encoding: "utf8",
      timeout: 3_000,
    }).trim();
    if (shell && isAbsolute(shell)) return shell;
  } catch {
    // fall through
  }
  return existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh";
}

function parseEnvBlock(buffer) {
  const env = {};
  for (const raw of buffer.toString("utf8").split("\0")) {
    if (!raw) continue;
    let entry = raw;
    let eq = entry.indexOf("=");
    let key = eq > 0 ? entry.slice(0, eq) : "";
    if (!ENV_NAME_RE.test(key)) {
      const lineStart = eq > 0 ? entry.lastIndexOf("\n", eq) : -1;
      if (lineStart >= 0) {
        entry = entry.slice(lineStart + 1);
        eq = entry.indexOf("=");
        key = eq > 0 ? entry.slice(0, eq) : "";
      }
    }
    if (!ENV_NAME_RE.test(key) || eq <= 0) continue;
    env[key] = entry.slice(eq + 1);
  }
  return Object.keys(env).length > 0 ? env : null;
}

function sanitizeGitEnv(baseEnv) {
  const env = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value === "string") env[key] = value;
  }
  delete env.LIGHTCODE_HOOK_SECRET;
  delete env.LIGHTCODE_HOOK_PROTOCOL_VERSION;
  return env;
}

function getLoginShellEnv() {
  if (cachedLoginShellEnv !== undefined) return cachedLoginShellEnv;
  try {
    const shell = resolveLoginShellPath();
    const output = execFileSync(shell, ["-l", "-i", "-c", "env -0"], {
      env: process.env,
      encoding: "buffer",
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    });
    cachedLoginShellEnv = sanitizeGitEnv(parseEnvBlock(output) ?? process.env);
  } catch {
    cachedLoginShellEnv = sanitizeGitEnv(process.env);
  }
  return cachedLoginShellEnv;
}

function buildGitEnv(command) {
  const baseEnv = command.loginEnv ? getLoginShellEnv() : sanitizeGitEnv(process.env);
  return { ...baseEnv, GIT_OPTIONAL_LOCKS: "0", ...(command.env ?? {}) };
}

function runGitExec(command) {
  return runProcessExec("git", command);
}

function runProcessExec(binary, command) {
  return new Promise((resolve) => {
    execFile(
      binary,
      command.args,
      {
        cwd: command.cwd,
        env: buildGitEnv(command),
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        timeout: command.timeoutMs,
      },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({ ok: true, stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 });
          return;
        }
        const code = typeof err.code === "number" ? err.code : 1;
        resolve({
          ok: false,
          stdout: typeof err.stdout === "string" ? err.stdout : (stdout ?? ""),
          stderr: typeof err.stderr === "string" ? err.stderr : (stderr ?? ""),
          exitCode: code,
          ...(typeof err.signal === "string" ? { signal: err.signal } : {}),
          error: String(err.message ?? err),
          ...(err.killed ? { timedOut: true } : {}),
        });
      },
    );
  });
}

async function gitExecHandler(req, body) {
  const parsed = validateGitCommand(body);
  if (parsed.error) return parsed.error;
  const result = await runGitExec(parsed.command);
  return { status: 200, data: result };
}

async function gitBatchHandler(req, body) {
  if (!Array.isArray(body.commands)) {
    return { status: 400, code: "EINVAL", message: "commands must be an array" };
  }
  if (body.commands.length > MAX_GIT_COMMANDS) {
    return { status: 400, code: "EINVAL", message: "too many git commands" };
  }
  const commands = [];
  for (const raw of body.commands) {
    const parsed = validateGitCommand({
      ...raw,
      timeoutMs: raw?.timeoutMs ?? body.timeoutMs,
    });
    if (parsed.error) return parsed.error;
    commands.push(parsed.command);
  }
  const results = await Promise.all(commands.map((command) => runGitExec(command)));
  return { status: 200, data: { results } };
}

async function ghVersionHandler(req, body) {
  const parsed = validateGitCommand({
    cwd: body?.cwd,
    args: ["--version"],
    loginEnv: body?.loginEnv,
    timeoutMs: body?.timeoutMs,
  });
  if (parsed.error) return parsed.error;
  const result = await runProcessExec("gh", parsed.command);
  return { status: 200, data: result };
}

function gitCheckpointSnapshotHandler(req, body) {
  const projectRoot = resolveSafePath(body.projectRoot, body.projectRoot);
  if (!projectRoot) return { status: 400, code: "ESCAPE", message: "projectRoot is invalid" };
  if (typeof body.ref !== "string" || !LIGHTCODE_CHECKPOINT_REF_RE.test(body.ref)) {
    return { status: 400, code: "EINVAL", message: "invalid checkpoint ref" };
  }
  if (!body.metadata || typeof body.metadata !== "object" || Array.isArray(body.metadata)) {
    return { status: 400, code: "EINVAL", message: "metadata object required" };
  }

  try {
    git(["rev-parse", "--is-inside-work-tree"], projectRoot);
    const indexPath = git(
      ["rev-parse", "--path-format=absolute", "--git-path", "index"],
      projectRoot,
    ).trim();
    const tempIndex = `${indexPath}.lightcode-${randomUUID()}`;
    try {
      const env = { GIT_INDEX_FILE: tempIndex };
      const baseTree =
        gitMaybe(["rev-parse", "--verify", "HEAD^{tree}"], projectRoot) || EMPTY_GIT_TREE;
      git(["read-tree", baseTree], projectRoot, env);
      git(["add", "-A", "--", "."], projectRoot, env);
      const tree = git(["write-tree"], projectRoot, env).trim();
      const head = gitMaybe(["rev-parse", "--verify", "HEAD"], projectRoot);
      const commitArgs = [
        "commit-tree",
        tree,
        ...(head ? ["-p", head] : []),
        "-m",
        "Lightcode checkpoint",
        "-m",
        JSON.stringify(body.metadata),
      ];
      const commit = git(commitArgs, projectRoot, env).trim();
      git(["update-ref", body.ref, commit], projectRoot);
      return { status: 200, data: { commit } };
    } finally {
      try {
        rmSync(tempIndex, { force: true });
      } catch {
        // best effort
      }
    }
  } catch (err) {
    const message = String(err?.stderr || err?.message || err);
    return { status: 500, code: "EGIT", message };
  }
}

const FS_ROUTES = new Map([
  ["/v1/fs/readdir", readdirHandler],
  ["/v1/fs/stat", statHandler],
  ["/v1/fs/find", findHandler],
  ["/v1/fs/read", readFileHandler],
  ["/v1/fs/write", writeFileHandler],
  ["/v1/fs/write-new", writeNewFileHandler],
  ["/v1/fs/mkdir", mkdirHandler],
  ["/v1/fs/rm", rmHandler],
  ["/v1/fs/rename", renameHandler],
]);

const GIT_ROUTES = new Map([
  ["/v1/git/checkpoint-snapshot", gitCheckpointSnapshotHandler],
  ["/v1/git/exec", gitExecHandler],
  ["/v1/git/batch", gitBatchHandler],
]);

const GH_ROUTES = new Map([["/v1/gh/version", ghVersionHandler]]);

/**
 * Active watch subscriptions keyed by client-supplied `subscriptionId`.
 * Each subscription owns N inner watchers (one per `paths[]` entry). The
 * supervisor sees events as `{type:"watch",subscriptionId,scope,paths}`.
 */
const subscriptions = new Map();
let watchSeq = 0;

function watchSubscribeHandler(req, body) {
  if (typeof body.subscriptionId !== "string" || body.subscriptionId.length === 0) {
    return { status: 400, code: "EINVAL", message: "subscriptionId required" };
  }
  if (subscriptions.has(body.subscriptionId)) {
    return { status: 409, code: "EEXIST", message: "subscriptionId already active" };
  }
  if (!Array.isArray(body.paths) || body.paths.length === 0) {
    return { status: 400, code: "EINVAL", message: "paths[] required" };
  }
  const ignore = Array.isArray(body.ignore) ? body.ignore.filter((v) => typeof v === "string") : [];
  const projectRoot =
    typeof body.projectRoot === "string" && isAbsolute(body.projectRoot)
      ? normalize(body.projectRoot)
      : null;
  if (!projectRoot) {
    return { status: 400, code: "EINVAL", message: "projectRoot must be absolute" };
  }

  const unsubs = [];
  for (const entry of body.paths) {
    if (!entry || typeof entry.path !== "string" || typeof entry.scope !== "string") {
      rollback(unsubs);
      return { status: 400, code: "EINVAL", message: "paths[].path and .scope required" };
    }
    const target = resolveSafePath(projectRoot, entry.path);
    if (!target) {
      rollback(unsubs);
      return { status: 400, code: "ESCAPE", message: `${entry.path} escapes projectRoot` };
    }
    try {
      const unsub = startWatch(target, entry.scope, ignore, (scope, changedPaths) => {
        emit({ type: "watch", subscriptionId: body.subscriptionId, scope, paths: changedPaths });
      });
      unsubs.push(unsub);
    } catch (err) {
      rollback(unsubs);
      const code = typeof err?.code === "string" ? err.code : "EIO";
      return { status: 500, code, message: String(err?.message ?? err) };
    }
  }

  subscriptions.set(body.subscriptionId, {
    dispose: () => {
      for (const unsub of unsubs) {
        try {
          unsub();
        } catch {
          // best effort
        }
      }
    },
  });
  watchSeq += 1;
  return { status: 200, data: { ok: true } };
}

function watchUnsubscribeHandler(req, body) {
  if (typeof body.subscriptionId !== "string") {
    return { status: 400, code: "EINVAL", message: "subscriptionId required" };
  }
  const sub = subscriptions.get(body.subscriptionId);
  if (!sub) return { status: 200, data: { ok: true, noop: true } };
  sub.dispose();
  subscriptions.delete(body.subscriptionId);
  return { status: 200, data: { ok: true } };
}

function rollback(unsubs) {
  for (const unsub of unsubs) {
    try {
      unsub();
    } catch {
      // best effort
    }
  }
}

/**
 * Start watching `target` (absolute POSIX path). Tries parcel-watcher first,
 * falls back to recursive `fs.watch`. Returns a sync `unsubscribe()` fn.
 * `onChange(scope, paths)` is called in either case; `paths` is the list of
 * changed POSIX paths relative to `target` (empty array for fs.watch fallback).
 */
function startWatch(target, scope, ignore, onChange) {
  const parcel = loadParcelWatcher();
  if (parcel) {
    const ignorePaths = ignore.map((name) => resolvePath(target, name));
    // Root watcher's own .git subtree handled separately via a second
    // subscription — same pattern wsl-watcher.cjs used.
    let active = true;
    const subPromise = parcel.subscribe(
      target,
      (err, events) => {
        if (!active || err) return;
        const evts = Array.isArray(events) ? events : [];
        const rel = evts
          .map((e) => normalizeRelative(target, e && e.path))
          .filter((s) => s.length > 0);
        onChange(scope, rel.slice(0, 5));
      },
      { backend: "inotify", ignore: ignorePaths },
    );
    return () => {
      active = false;
      subPromise.then((s) => s?.unsubscribe?.()).catch(() => undefined);
    };
  }

  // fs.watch fallback. Use the filename when Node provides one; pathless
  // events still wake the supervisor so WSL trees do not go stale.
  const watcher = fsWatch(target, { recursive: true }, (_ev, filename) => {
    let normalized = "";
    if (filename && typeof filename === "string") {
      normalized = filename.replace(/\\/g, "/");
      if (shouldIgnore(normalized, ignore)) return;
    }
    onChange(scope, normalized ? [normalized] : []);
  });
  watcher.on("error", () => undefined);
  return () => {
    try {
      watcher.close();
    } catch {
      // best effort
    }
  };
}

function normalizeRelative(root, p) {
  if (!p || typeof p !== "string") return "";
  if (!p.startsWith(root)) return "";
  const rel = p.slice(root.length).replace(/^\/+/, "");
  return rel;
}

function shouldIgnore(relativePath, ignore) {
  if (ignore.length === 0) return false;
  const first = relativePath.split("/", 1)[0];
  return ignore.includes(first);
}

const WATCH_ROUTES = new Map([
  ["/v1/watch/subscribe", watchSubscribeHandler],
  ["/v1/watch/unsubscribe", watchUnsubscribeHandler],
]);

async function handleHook(req, res) {
  let body;
  try {
    body = await readBody(req, MAX_HOOK_BODY_BYTES);
  } catch {
    respond(res, 413, { error: "payload_too_large" });
    return;
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch {
    respond(res, 400, { error: "invalid_json" });
    return;
  }

  const rawProtocol = json && typeof json === "object" ? json.protocolVersion : undefined;
  if (typeof rawProtocol === "number" && rawProtocol < 1) {
    respond(res, 426, {
      error: "upgrade_required",
      supportedProtocol: PROTOCOL_VERSION,
      minProtocol: 1,
    });
    return;
  }

  const envelope = validateEnvelope(json);
  if (!envelope) {
    respond(res, 400, { error: "invalid_envelope" });
    return;
  }

  if (envelope.protocolVersion > PROTOCOL_VERSION) {
    respond(res, 200, { ok: true, downgraded: true, supportedProtocol: PROTOCOL_VERSION });
  } else {
    respond(res, 202, { ok: true });
  }

  emit({ type: "event", payload: envelope });
}

async function handleFs(req, res, handler) {
  let body;
  try {
    body = await readBody(req, MAX_FS_BODY_BYTES);
  } catch {
    respondErr(res, 413, "TOO_LARGE", "request body too large");
    return;
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    respondErr(res, 400, "EINVAL", "invalid json");
    return;
  }
  let outcome;
  try {
    outcome = await handler(req, json);
  } catch (err) {
    respondErr(res, 500, "EIO", String(err?.message ?? err));
    return;
  }
  if (outcome.status === 200 && outcome.data !== undefined) {
    respondOk(res, outcome.data);
    return;
  }
  respondErr(res, outcome.status, outcome.code ?? "EIO", outcome.message ?? "error");
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST") {
    respondErr(res, 405, "EMETHOD", "method_not_allowed");
    return;
  }
  const auth = req.headers["authorization"];
  if (typeof auth !== "string" || auth !== `Bearer ${SECRET}`) {
    respondErr(res, 401, "EAUTH", "unauthorized");
    return;
  }
  const url = req.url ?? "";
  if (url.startsWith(HOOK_PATH)) {
    await handleHook(req, res);
    return;
  }
  const pathOnly = url.split("?")[0];
  const fsHandler = FS_ROUTES.get(pathOnly);
  if (fsHandler) {
    await handleFs(req, res, fsHandler);
    return;
  }
  const gitHandler = GIT_ROUTES.get(pathOnly);
  if (gitHandler) {
    await handleFs(req, res, gitHandler);
    return;
  }
  const ghHandler = GH_ROUTES.get(pathOnly);
  if (ghHandler) {
    await handleFs(req, res, ghHandler);
    return;
  }
  const watchHandler = WATCH_ROUTES.get(pathOnly);
  if (watchHandler) {
    await handleFs(req, res, watchHandler);
    return;
  }
  respondErr(res, 404, "ENOENT", `no handler for ${pathOnly}`);
});

server.on("error", (error) => {
  emit({ type: "error", message: String(error?.message ?? error) });
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    emit({ type: "error", message: "unexpected listen address" });
    process.exit(2);
    return;
  }
  emit({
    type: "boot",
    port: address.port,
    protocolVersion: PROTOCOL_VERSION,
    version: BRIDGE_VERSION,
  });
});

function shutdown() {
  for (const sub of subscriptions.values()) {
    try {
      sub.dispose();
    } catch {
      // best effort
    }
  }
  subscriptions.clear();
  server.close(() => process.exit(0));
  // Hard-stop fallback in case close() hangs on a stuck socket.
  setTimeout(() => process.exit(0), 250).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
