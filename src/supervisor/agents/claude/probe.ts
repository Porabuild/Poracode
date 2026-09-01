import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentCapability, AgentTerminalAuthMethod } from "@/shared/contracts";
import type { SlashCommand } from "@anthropic-ai/claude-agent-sdk";
import {
  readWslLoginShellCommandOutputAsync,
  type CapabilitiesProbeResult,
  type DetectProbeCtx,
} from "../base";
import { CLAUDE_FAST_MODE_DISABLED_MESSAGE } from "./detection";
import { resolveFastModeCachePath } from "./fastModeCache";
import { resolveFastAvailability } from "./fastModeProbe";
import { claudeCapabilitiesFromCliVersion, claudeCapabilitiesFromSdkModels } from "./models";
import { AsyncPromptQueue } from "./promptQueue";
import { spawnClaudeProbeProcess } from "./sdkProbeProcess";

export { claudeCapabilitiesFromCliVersion } from "./models";

const CLAUDE_TERMINAL_AUTH_METHOD: AgentTerminalAuthMethod = {
  type: "terminal",
  id: "claude-login",
  name: "Claude login",
  args: ["auth", "login"],
};

export function claudeTerminalAuthMethod(env?: Record<string, string>): AgentTerminalAuthMethod {
  return env ? { ...CLAUDE_TERMINAL_AUTH_METHOD, env } : CLAUDE_TERMINAL_AUTH_METHOD;
}

/** Provider label carried by Claude's own (SDK-reported) skill entries. */
export const CLAUDE_NATIVE_SKILL_PROVIDER = "Claude";

/**
 * Prompt-style invocation for a model-invoked skill. Per the Agent SDK docs a
 * skill is invoked by the model through the `Skill` tool, which streams events
 * normally; sending the bare `/name` slash text instead makes the CLI run an
 * opaque local command that emits nothing until it finishes.
 */
export function claudeSkillInvocation(name: string): string {
  return `Use the ${name} skill.`;
}

/**
 * `skillNames` are the entries the SDK reports under `skills` on the session's
 * `system` init message. Bundled skills appear in *both* that list and the
 * slash-command list, so a command whose name is a known skill is re-flavored
 * as a skill entry (model-invoked, streams) instead of a slash command
 * (opaque local command, no stream events).
 */
export function mapClaudeSlashCommands(
  commands: readonly SlashCommand[],
  skillNames?: ReadonlySet<string> | Set<string>,
): NonNullable<AgentCapability["slashCommands"]> {
  return commands.map((c) => {
    const base = {
      id: c.name,
      label: c.description?.trim() ? `${c.name} — ${c.description}` : c.name,
      ...(c.description?.trim() ? { description: c.description } : {}),
      ...(c.argumentHint ? { argumentHint: c.argumentHint } : {}),
    };
    if (!skillNames?.has(c.name)) return base;
    return {
      ...base,
      section: "skills" as const,
      skillName: c.name,
      skillInvocation: claudeSkillInvocation(c.name),
      skillProvider: CLAUDE_NATIVE_SKILL_PROVIDER,
      // Provider-native skills carry no SKILL.md path; scope is only used for
      // display/precedence, and the SDK reports one flat catalog.
      skillScope: "global" as const,
    };
  });
}

/**
 * Skill names for the session, read through the SDK's skill-list control
 * request. Used by the probes, which never consume the message stream and so
 * cannot read `skills` off the `system` init message. Returns `undefined` when
 * the CLI does not support the request.
 */
export async function readClaudeSkillNames(runtime: {
  reloadSkills: () => Promise<{ skills: readonly { name: string }[] }>;
}): Promise<Set<string> | undefined> {
  try {
    const { skills } = await runtime.reloadSkills();
    return new Set(skills.map((skill) => skill.name));
  } catch {
    return undefined;
  }
}

function probeDir(): string {
  return typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
}

/**
 * In packaged builds the worker lives at `…/app.asar/dist/main/…`, but WSL's
 * `node` cannot read inside an asar archive — only Electron's patched fs hooks
 * can. The corresponding electron-builder `asarUnpack` rule mirrors the file to
 * `…/app.asar.unpacked/dist/main/…`; rewrite the path so the external
 * interpreter sees a regular on-disk file.
 */
function unpackedAsarPath(p: string): string {
  return p.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
}

function getSdkWorkerPath(): string {
  return join(unpackedAsarPath(probeDir()), "claudeSdkProbeWorker.mjs");
}

/**
 * Windows `C:\...` or `\\wsl$\...` → `/mnt/c/...` style path for in-distro `node`.
 */
export function win32PathToWslMount(winPath: string): string {
  const norm = winPath.replace(/\\/g, "/");
  const unc = /^\/\/wsl(?:\.localhost|\$)\/[^/]+\/(.*)$/i.exec(norm);
  if (unc) return `/${unc[1]!.replace(/\\/g, "/")}`.replace(/^\/+/, "/");
  const drive = /^([a-zA-Z]):\/(.*)$/i.exec(norm);
  if (drive) return `/mnt/${drive[1]!.toLowerCase()}/${drive[2]}`;
  return norm;
}

async function probeClaudeSdkPartialNative(
  executablePath: string,
  timeoutMs: number,
  envOverrides?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Partial<AgentCapability> | undefined> {
  if (signal?.aborted) return undefined;
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const abort = new AbortController();
    const abortFromParent = () => abort.abort();
    signal?.addEventListener("abort", abortFromParent, { once: true });
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    const queue = new AsyncPromptQueue();
    try {
      const q = query({
        prompt: queue,
        options: {
          abortController: abort,
          pathToClaudeCodeExecutable: executablePath,
          persistSession: false,
          cwd: process.platform === "win32" ? (process.env.USERPROFILE ?? process.cwd()) : "/tmp",
          ...(envOverrides ? { env: { ...process.env, ...envOverrides } } : {}),
          settingSources: ["user", "project", "local"],
          allowedTools: [],
          stderr: () => {},
          spawnClaudeCodeProcess: spawnClaudeProbeProcess,
        },
      });
      const init = await q.initializationResult();
      const slashCommands = mapClaudeSlashCommands(init.commands, await readClaudeSkillNames(q));
      const modelCapabilities = claudeCapabilitiesFromSdkModels(init.models);
      const fastAvailable = await resolveFastAvailability(
        q,
        queue,
        init.account?.email,
        resolveFastModeCachePath(),
      );
      const fastDisabledReason =
        fastAvailable === false ? CLAUDE_FAST_MODE_DISABLED_MESSAGE : undefined;
      try {
        queue.close();
        q.close();
      } catch {
        // ignore
      }
      abort.abort();
      if (slashCommands.length === 0 && !fastDisabledReason && !modelCapabilities) return undefined;
      return {
        ...(modelCapabilities ?? {}),
        ...(slashCommands.length > 0 ? { slashCommands } : {}),
        ...(fastDisabledReason ? { fastDisabledReason } : {}),
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromParent);
      abort.abort();
    }
  } catch (error) {
    console.log(
      "[claude-probe] native sdk:",
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

async function probeClaudeSdkPartialWsl(
  ctx: DetectProbeCtx,
  timeoutMs: number,
  envOverrides?: Record<string, string>,
): Promise<Partial<AgentCapability> | undefined> {
  if (ctx.location.kind !== "wsl" || !ctx.executablePath) return undefined;

  const workerHostPath = getSdkWorkerPath();
  const workerWslPath =
    process.platform === "win32" ? win32PathToWslMount(workerHostPath) : workerHostPath;
  // The worker runs in-distro, so hand it the fast-mode cache as a `/mnt/c/...`
  // mount; it reads/writes the same file the native path uses (keyed by account
  // hash), so the billed turn runs at most once per account.
  const cacheHostPath = resolveFastModeCachePath();
  const cacheWslPath =
    process.platform === "win32" ? win32PathToWslMount(cacheHostPath) : cacheHostPath;

  const result = await readWslLoginShellCommandOutputAsync(
    ctx.location.distro,
    "/tmp",
    "node",
    [workerWslPath, ctx.executablePath, String(timeoutMs), cacheWslPath],
    {
      timeout: timeoutMs + 3000,
      ...(envOverrides ? { env: envOverrides } : {}),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    },
  );

  if (!result.ok) {
    console.log(
      "[claude-probe] wsl worker:",
      (result.stderr || result.stdout || "(empty)").slice(0, 500),
    );
    return undefined;
  }

  try {
    const parsed = JSON.parse(result.stdout) as {
      slashCommands?: AgentCapability["slashCommands"];
      models?: AgentCapability["models"];
      defaultHiddenModels?: AgentCapability["defaultHiddenModels"];
      modelEfforts?: AgentCapability["modelEfforts"];
      modelContextSizes?: AgentCapability["modelContextSizes"];
      fastModels?: AgentCapability["fastModels"];
      fastAvailable?: boolean;
      error?: string;
    };
    if (parsed.error) {
      console.log("[claude-probe] wsl worker error field:", parsed.error);
      return undefined;
    }
    const fastDisabledReason =
      parsed.fastAvailable === false ? CLAUDE_FAST_MODE_DISABLED_MESSAGE : undefined;
    const hasModelCapabilities =
      parsed.models !== undefined ||
      parsed.defaultHiddenModels !== undefined ||
      parsed.modelEfforts !== undefined ||
      parsed.modelContextSizes !== undefined ||
      parsed.fastModels !== undefined;
    if (!parsed.slashCommands?.length && !fastDisabledReason && !hasModelCapabilities) {
      return undefined;
    }
    return {
      ...(parsed.models ? { models: parsed.models } : {}),
      ...(parsed.defaultHiddenModels ? { defaultHiddenModels: parsed.defaultHiddenModels } : {}),
      ...(parsed.modelEfforts ? { modelEfforts: parsed.modelEfforts } : {}),
      ...(parsed.modelContextSizes ? { modelContextSizes: parsed.modelContextSizes } : {}),
      ...(parsed.fastModels ? { fastModels: parsed.fastModels } : {}),
      ...(parsed.slashCommands?.length ? { slashCommands: parsed.slashCommands } : {}),
      ...(fastDisabledReason ? { fastDisabledReason } : {}),
    };
  } catch {
    console.log("[claude-probe] wsl worker: invalid json stdout");
    return undefined;
  }
}

export async function probeClaudeCapabilities(
  ctx: DetectProbeCtx,
  options?: { env?: Record<string, string> },
): Promise<CapabilitiesProbeResult | undefined> {
  if (!ctx.executablePath) return undefined;

  // Both paths may run a one-off fast-mode availability turn on a cache miss, so
  // allow extra headroom over a plain init probe.
  const timeoutMs = process.platform === "win32" ? 25_000 : 20_000;
  const sdkPartial =
    ctx.location.kind === "wsl"
      ? await probeClaudeSdkPartialWsl(ctx, timeoutMs, options?.env)
      : await probeClaudeSdkPartialNative(ctx.executablePath, timeoutMs, options?.env, ctx.signal);

  const versionPartial = claudeCapabilitiesFromCliVersion(ctx.version);

  // Always advertise the terminal login + `claude auth logout` capabilities
  // when the binary is installed — the Settings UI gates the Login/Logout
  // controls on these fields, and the supervisor's logout dispatcher uses
  // the adapter's `buildAcpLogoutCommand` to invoke `claude auth logout`.
  return {
    ...(sdkPartial ?? {}),
    ...(versionPartial ?? {}),
    authMethods: [claudeTerminalAuthMethod(options?.env)],
    authLogoutSupported: true,
  };
}
