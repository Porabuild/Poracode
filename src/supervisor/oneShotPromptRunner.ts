import type { ProjectLocation } from "@/shared/contracts";
import {
  resolveAgentProjectLocation,
  withCommandBaseSpawnEnv,
  type AgentAdapter,
  type CommandSpec,
} from "./agents/base";
import { prepareOneShot } from "./oneShotSpawn";

// Spawn returns these errno codes when the OS rejects the argv length:
// - ENAMETOOLONG: macOS / Windows (via libuv mapping)
// - E2BIG: Linux execve when argv+envp exceeds ARG_MAX
const ARGV_TOO_LONG_CODES: ReadonlySet<string> = new Set(["ENAMETOOLONG", "E2BIG"]);

// Conservative per-platform argv budgets — slightly under the OS hard caps so
// the shell-wrapping overhead (`bash -l -i -c '<…>'`, `wsl.exe -d <distro> --`)
// still fits.
//   Windows: CreateProcess command line ≤ 32_767 chars total.
//   Linux:   MAX_ARG_STRLEN ≤ 131_072 per *single* argv (binding when the
//            whole command is wrapped into one `bash -c '…'` arg).
//   macOS:   ARG_MAX ≈ 262_144 (total argv + envp).
function platformArgvBudgets(): { totalChars: number; perArgChars: number } {
  if (process.platform === "win32") return { totalChars: 28_000, perArgChars: 28_000 };
  if (process.platform === "darwin") return { totalChars: 220_000, perArgChars: 220_000 };
  return { totalChars: 1_500_000, perArgChars: 110_000 };
}

export function isArgvLikelyTooLong(spec: CommandSpec): boolean {
  const { totalChars, perArgChars } = platformArgvBudgets();
  let total = spec.command.length;
  let maxArg = spec.command.length;
  for (const arg of spec.args) {
    total += arg.length + 1;
    if (arg.length > maxArg) maxArg = arg.length;
  }
  return total > totalChars || maxArg > perArgChars;
}

export function isArgvTooLongError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const candidate = err as { code?: unknown; message?: unknown };
  if (typeof candidate.code === "string" && ARGV_TOO_LONG_CODES.has(candidate.code)) {
    return true;
  }
  if (typeof candidate.message === "string") {
    for (const code of ARGV_TOO_LONG_CODES) {
      if (candidate.message.includes(code)) return true;
    }
  }
  return false;
}

/** One attempt in the fallback chain; later attempts should yield smaller prompts. */
export interface OneShotPromptAttempt {
  /** Short tag for logs (e.g. "full", "files-only", "scrollback-30k"). */
  level: string;
  /** Build the prompt for this attempt. Called lazily — only when the attempt fires. */
  buildPrompt(): string;
}

export interface RunOneShotPromptOptions {
  location: ProjectLocation;
  adapter: AgentAdapter;
  model: string;
  effort: string | undefined;
  /** Opus-only fast-mode flag, forwarded to the adapter when set. */
  fast?: boolean | undefined;
  /** Let structured runtimes expose read/search/list tools in the isolated workspace. */
  readOnlyWorkspace?: boolean | undefined;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Tag for log lines, e.g. "commit-gen", "pr-summary-gen". */
  logTag: string;
  /** Ordered prompt builders; tried in sequence, smallest last. Must be non-empty. */
  attempts: readonly OneShotPromptAttempt[];
}

/**
 * Run a one-shot LLM call with progressive prompt fallback.
 *
 * Two execution paths:
 *
 *   1. If the adapter exposes `runOneShot`, the prompt is passed straight to
 *      the provider's structured runtime (SDK / ACP / shared server). This is
 *      the preferred path: no per-call cold start, no OS argv length cap,
 *      cleaner error surface. The fallback chain is still honoured — if the
 *      "full" prompt fails we still drop to "files-only" / "scrollback-N" —
 *      but argv-overflow detection is skipped (there's no argv).
 *
 *   2. Otherwise the adapter must provide `buildOneShotCommand`, and we shell
 *      out via `spawnAgent`. Adapters that embed the prompt in argv
 *      (Claude/OpenCode CLI/Gemini/Copilot via `-p`) blow past OS argv caps
 *      for large diffs / scrollbacks, surfacing as `spawn ENAMETOOLONG`
 *      (or `E2BIG` on Linux). This path retries with the next smaller prompt
 *      on detected argv overflow, and also skips proactively when the built
 *      `CommandSpec` is already over the platform budget — so we don't waste
 *      a doomed spawn before falling back.
 */
export async function runOneShotPromptWithFallback(
  options: RunOneShotPromptOptions,
): Promise<string> {
  return runOneShotPromptWithFallbackImpl(options, false);
}

/** Run the fallback chain through an adapter's provider-enforced text-only path. */
export async function runTextOnlyOneShotPromptWithFallback(
  options: RunOneShotPromptOptions,
): Promise<string> {
  return runOneShotPromptWithFallbackImpl(options, true);
}

async function runOneShotPromptWithFallbackImpl(
  options: RunOneShotPromptOptions,
  textOnly: boolean,
): Promise<string> {
  if (options.attempts.length === 0) {
    throw new Error(
      `${textOnly ? "runTextOnlyOneShotPromptWithFallback" : "runOneShotPromptWithFallback"}: no attempts provided`,
    );
  }
  const runOneShot = textOnly ? options.adapter.runTextOnlyOneShot : options.adapter.runOneShot;
  const buildOneShotCommand = textOnly
    ? options.adapter.buildTextOnlyOneShotCommand
    : options.adapter.buildOneShotCommand;
  const generationLabel = textOnly ? "text-only one-shot generation" : "one-shot generation";
  const logLabel = textOnly ? "text-only one-shot" : "one-shot";
  if (!runOneShot && !buildOneShotCommand) {
    throw new Error(`${options.adapter.label} does not support ${generationLabel}`);
  }

  const useSdkPath = typeof runOneShot === "function";
  const executionLocation = await resolveAgentProjectLocation(
    options.adapter,
    options.location,
    undefined,
    options.signal,
  );

  let lastError: unknown;
  for (let i = 0; i < options.attempts.length; i++) {
    const attempt = options.attempts[i]!;
    const prompt = attempt.buildPrompt();
    const hasNextAttempt = i < options.attempts.length - 1;

    if (useSdkPath) {
      console.log(
        `[${options.logTag}] sdk ${logLabel} ${attempt.level} (prompt ${prompt.length} chars)`,
      );
      const signal = wrapTimeoutSignal(options.signal, options.timeoutMs);
      try {
        return await runOneShot.call(options.adapter, {
          location: executionLocation,
          model: options.model,
          effort: options.effort,
          fast: options.fast,
          readOnlyWorkspace: options.readOnlyWorkspace,
          prompt,
          signal,
        });
      } catch (err) {
        lastError = err;
        // SDK path has no argv overflow class of errors; only fall through to
        // the next attempt if there's one available and the failure isn't an
        // explicit abort.
        if (hasNextAttempt && !isAbortError(err)) {
          console.warn(
            `[${options.logTag}] sdk ${logLabel} ${attempt.level} for ${options.adapter.label} failed (${formatError(err)}); retrying with ${options.attempts[i + 1]!.level}`,
          );
          continue;
        }
        throw err;
      }
    }

    if (!buildOneShotCommand) {
      throw new Error(`${options.adapter.label} does not support ${generationLabel}`);
    }
    const cmd = buildOneShotCommand.call(
      options.adapter,
      options.model,
      options.effort,
      prompt,
      executionLocation,
      options.fast,
      { readOnlyWorkspace: options.readOnlyWorkspace },
    );
    if (!cmd) {
      throw new Error(`${options.adapter.label} does not support ${generationLabel}`);
    }
    // The judge workspace is already throwaway and contains the only files the
    // model may inspect. Preserve it even for adapters that normally move
    // utility one-shots to the OS temp root for session-cache isolation.
    const baseCommand =
      options.readOnlyWorkspace && cmd.isolateCwd ? { ...cmd, isolateCwd: false } : cmd;
    // Every Poracode-made spawn of this CLI carries the provider's base env
    // (updater/telemetry opt-outs); a command-specific `env` wins on conflict.
    const effectiveCommand = withCommandBaseSpawnEnv(baseCommand, options.adapter.baseSpawnEnv);
    const { spec: spawnSpec, spawn } = prepareOneShot(executionLocation, effectiveCommand);

    if (hasNextAttempt && isArgvLikelyTooLong(spawnSpec)) {
      console.warn(
        `[${options.logTag}] skipping ${attempt.level} (argv ~${argvCharCount(spawnSpec)} chars over platform budget); trying ${options.attempts[i + 1]!.level}`,
      );
      continue;
    }

    console.log(
      `[${options.logTag}] spawning ${attempt.level}: ${spawnSpec.command} (${spawnSpec.args.length} args, prompt ${prompt.length} chars)`,
    );

    try {
      return await spawn(spawnSpec, cmd.stdin ?? prompt, options.timeoutMs, options.signal);
    } catch (err) {
      lastError = err;
      if (hasNextAttempt && isArgvTooLongError(err)) {
        console.warn(
          `[${options.logTag}] argv too long at ${attempt.level} for ${options.adapter.label}; retrying with ${options.attempts[i + 1]!.level}`,
        );
        continue;
      }
      throw err instanceof Error ? err : new Error(formatError(err), { cause: err });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        lastError === undefined
          ? `[${options.logTag}] all fallback attempts exhausted`
          : formatError(lastError),
        { cause: lastError },
      );
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    if (/\baborted\b/i.test(err.message)) return true;
  }
  return false;
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Combine the caller's optional `AbortSignal` with a per-call timeout. SDK
 * runOneShot honours a single `AbortSignal`, so this folds both deadlines
 * into one. Returns `undefined` only when there is neither a parent signal
 * nor a positive timeout, matching the surface `runOneShot` expects.
 */
function wrapTimeoutSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal | undefined {
  if (!parent && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) return undefined;
  const controller = new AbortController();
  if (parent) {
    if (parent.aborted) {
      controller.abort();
    } else {
      parent.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
    // Stop the timer if the parent (or caller) finishes first. Listening on
    // `controller.signal` covers both abort sources.
    controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  }
  return controller.signal;
}

function argvCharCount(spec: CommandSpec): number {
  let total = spec.command.length;
  for (const arg of spec.args) total += arg.length + 1;
  return total;
}
