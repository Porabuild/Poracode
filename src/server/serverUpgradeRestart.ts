import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

/**
 * D4 service targeting for upgrades.
 *
 * A restart must target the intended prefix and config. The shipped systemd
 * unit is only used when its `ExecStart` actually launches
 * `<prefix>/current/lib/server.cjs`; an old or edited unit that points at a
 * different path is a refusal, not a silent restart of the wrong service. A
 * custom prefix never touches the global unit.
 *
 * The `ExecStart` value is folded and tokenized with quote awareness, then the
 * launched entry is derived from the program: `node`/`bun`/`deno` launch their
 * first non-flag argument, `sh -c` scripts are tokenized and `exec` is
 * unwrapped, `env` skips assignments, and any other program must itself be the
 * entrypoint. A path merely appearing as an argument (for example a `--watch`
 * target) never makes the unit match.
 */

export const SHIPPED_SERVICE_PREFIX = "/opt/poracode";
export const SHIPPED_SERVICE_UNIT = "poracode-server";
export const SERVER_ENTRYPOINT_RELATIVE = join("current", "lib", "server.cjs");

export class ServerUpgradeServiceTargetError extends Error {
  readonly code = "SERVER_UPGRADE_SERVICE_TARGET";

  constructor(message: string) {
    super(message);
    this.name = "ServerUpgradeServiceTargetError";
  }
}

export type ServiceRun = (command: string, args: readonly string[]) => string;

const defaultRun: ServiceRun = (command, args) =>
  execFileSync(command, [...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 30_000,
  }).toString();

export interface ServerServiceTarget {
  readonly kind: "systemd" | "direct";
  readonly unit: string | null;
}

/** Fold systemd line continuations so ExecStart parsing sees one command. */
function foldContinuations(unitText: string): string[] {
  const lines: string[] = [];
  let pending = "";
  for (const raw of unitText.split(/\r?\n/u)) {
    const line = raw.replace(/\s+$/u, "");
    if (line.endsWith("\\")) {
      pending += `${line.slice(0, -1)} `;
      continue;
    }
    lines.push(`${pending}${line}`);
    pending = "";
  }
  if (pending.length > 0) lines.push(pending);
  return lines;
}

/**
 * systemd-style tokenization: whitespace separates tokens; single and double
 * quotes group; a backslash escapes the next character outside single quotes.
 */
function tokenizeCommand(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quote === null && /\s/u.test(character)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    if (character === "'" && quote !== '"') {
      quote = quote === "'" ? null : "'";
      started = true;
      continue;
    }
    if (character === '"' && quote !== "'") {
      quote = quote === '"' ? null : '"';
      started = true;
      continue;
    }
    if (character === "\\" && quote !== "'" && index + 1 < value.length) {
      current += value[index + 1]!;
      started = true;
      index += 1;
      continue;
    }
    current += character;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

const NODE_RUNNERS = new Set(["node", "nodejs", "bun", "deno"]);
const SHELLS = new Set(["sh", "bash", "dash", "zsh", "ksh"]);
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;

/** Strip the single systemd ExecStart prefix character (`-`, `@`, `+`, `!`, `:`). */
function stripCommandPrefix(token: string): string {
  return token.replace(/^[-@+!:]+/u, "");
}

/**
 * Derive the file system entry a command launches, or null when the command
 * does not launch a single verifiable entry.
 */
function resolveLaunchedEntryFromTokens(tokens: readonly string[]): string | null {
  let index = 0;
  while (index < tokens.length && ENV_ASSIGNMENT.test(tokens[index]!)) index += 1;
  if (index >= tokens.length) return null;
  const program = stripCommandPrefix(tokens[index]!);
  index += 1;
  const args = tokens.slice(index);
  const programName = basename(program);

  if (programName === "env") {
    let next = 0;
    while (next < args.length && (args[next]!.startsWith("-") || ENV_ASSIGNMENT.test(args[next]!)))
      next += 1;
    if (next >= args.length) return null;
    return resolveLaunchedEntryFromTokens([args[next]!, ...args.slice(next + 1)]);
  }
  if (SHELLS.has(programName)) {
    const commandFlag = args.findIndex((argument) => argument === "-c" || argument === "--command");
    if (commandFlag === -1 || args[commandFlag + 1] === undefined) return null;
    const inner = tokenizeCommand(args[commandFlag + 1]!);
    const unwrapped = inner[0] === "exec" ? inner.slice(1) : inner;
    return resolveLaunchedEntryFromTokens(unwrapped);
  }
  if (NODE_RUNNERS.has(programName)) {
    return args.find((argument) => !argument.startsWith("-")) ?? null;
  }
  if (program.length === 0) return null;
  return program;
}

function resolveLaunchedEntry(command: string): string | null {
  return resolveLaunchedEntryFromTokens(tokenizeCommand(command));
}

function canonicalPath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/**
 * True when `candidate` is the exact shipped prefix, including the case where
 * either path is a symlink to the other (the upgrader canonicalizes its prefix
 * before deciding, so the literal `/opt/poracode` and its real path must both
 * select the shipped unit).
 */
function isShippedPrefix(prefix: string): boolean {
  if (prefix === SHIPPED_SERVICE_PREFIX) return true;
  const canonicalPrefix = canonicalPath(prefix);
  const canonicalShipped = canonicalPath(SHIPPED_SERVICE_PREFIX);
  return (
    canonicalPrefix !== null && canonicalShipped !== null && canonicalPrefix === canonicalShipped
  );
}

/** Read a unit setting value, honoring quoting and the leading `-` form. */
function readUnitSetting(lines: readonly string[], key: string): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(key)) continue;
    let value = trimmed.slice(key.length).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"'))
      value = value.slice(1, -1);
    value = stripCommandPrefix(value);
    return value.length > 0 ? value : null;
  }
  return null;
}

function entryMatchesPrefix(
  entry: string,
  prefix: string,
  workingDirectory: string | null,
): boolean {
  const based = isAbsolute(entry) ? entry : join(workingDirectory ?? "/", entry);
  const resolvedEntry = resolve(based);
  const canonicalEntry = canonicalPath(resolvedEntry);
  const candidatePrefixes = new Set([
    prefix,
    SHIPPED_SERVICE_PREFIX,
    ...(canonicalPath(prefix) !== null ? [canonicalPath(prefix)!] : []),
    ...(canonicalPath(SHIPPED_SERVICE_PREFIX) !== null
      ? [canonicalPath(SHIPPED_SERVICE_PREFIX)!]
      : []),
  ]);
  for (const candidatePrefix of candidatePrefixes) {
    const expected = resolve(join(candidatePrefix, SERVER_ENTRYPOINT_RELATIVE));
    if (resolvedEntry === expected) return true;
    const canonicalExpected = canonicalPath(expected);
    if (
      canonicalEntry !== null &&
      canonicalExpected !== null &&
      canonicalEntry === canonicalExpected
    )
      return true;
  }
  return false;
}

function unitLaunchesPrefix(unitText: string, prefix: string): boolean {
  const lines = foldContinuations(unitText);
  // Relative entrypoints resolve against WorkingDirectory (systemd default /).
  // `WorkingDirectory=~` cannot be verified here and is treated as unset.
  const workingDirectory = readUnitSetting(lines, "WorkingDirectory=") ?? "/";
  return lines.some((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("ExecStart=")) return false;
    const entry = resolveLaunchedEntry(trimmed.slice("ExecStart=".length).trim());
    return entry !== null && entryMatchesPrefix(entry, prefix, workingDirectory);
  });
}

export function resolveServerServiceTarget(input: {
  readonly prefix: string;
  readonly platform?: NodeJS.Platform;
  readonly run?: ServiceRun;
}): ServerServiceTarget {
  const prefix = resolve(input.prefix);
  if ((input.platform ?? process.platform) !== "linux") return { kind: "direct", unit: null };
  if (!isShippedPrefix(prefix)) return { kind: "direct", unit: null };
  const run = input.run ?? defaultRun;
  let fragment = "";
  try {
    fragment = run("systemctl", [
      "show",
      "-p",
      "FragmentPath",
      "--value",
      SHIPPED_SERVICE_UNIT,
    ]).trim();
  } catch {
    // No service manager (or no such unit): an unmanaged install is restarted
    // directly under the owner's authenticated control surface.
    return { kind: "direct", unit: null };
  }
  if (fragment.length === 0) return { kind: "direct", unit: null };
  let unitText: string;
  try {
    unitText = readFileSync(fragment, "utf8");
  } catch {
    throw new ServerUpgradeServiceTargetError(
      `The installed ${SHIPPED_SERVICE_UNIT} unit at ${fragment} could not be read; ` +
        "refusing to restart a service whose target cannot be verified.",
    );
  }
  if (!unitLaunchesPrefix(unitText, prefix))
    throw new ServerUpgradeServiceTargetError(
      `The installed ${SHIPPED_SERVICE_UNIT} unit (${fragment}) does not launch ` +
        `${join(prefix, SERVER_ENTRYPOINT_RELATIVE)}. Refusing to restart a service that ` +
        "would run a different path; fix the unit or upgrade the matching prefix.",
    );
  return { kind: "systemd", unit: SHIPPED_SERVICE_UNIT };
}

export async function stopServerService(
  target: ServerServiceTarget,
  input: { readonly run?: ServiceRun } = {},
): Promise<void> {
  if (target.kind !== "systemd" || target.unit === null) return;
  (input.run ?? defaultRun)("systemctl", ["stop", target.unit]);
}

/** Start (or restart) the service target at the swapped `current` release. */
export async function startServerService(
  target: ServerServiceTarget,
  prefix: string,
  input: {
    readonly staging: boolean;
    readonly run?: ServiceRun;
    readonly env?: NodeJS.ProcessEnv;
  } = {
    staging: false,
  },
): Promise<ChildProcess | null> {
  if (target.kind === "systemd" && target.unit !== null) {
    // Staging for a service-managed install is journal-driven: the candidate
    // discovers the in-flight upgrade journal for its release directory and
    // holds admission until the authenticated admit.
    (input.run ?? defaultRun)("systemctl", ["restart", target.unit]);
    return null;
  }
  const entry = join(resolve(prefix), "current", "lib", "server.cjs");
  const env: NodeJS.ProcessEnv = { ...(input.env ?? process.env) };
  if (input.staging) env.PORACODE_UPGRADE_STAGING = "1";
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: "ignore",
    env,
  });
  await new Promise<void>((resolveSpawn, reject) => {
    child.once("error", reject);
    child.once("spawn", resolveSpawn);
  });
  // Diagnostic/backward-compatible marker; never kill authority (D4).
  if (child.pid) writeFileSync(join(resolve(prefix), "poracode-server.pid"), `${child.pid}\n`);
  child.unref();
  return child;
}
