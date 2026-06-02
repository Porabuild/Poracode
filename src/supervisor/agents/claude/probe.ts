import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentAuthMethod, AgentCapability } from "@/shared/contracts";
import type { SlashCommand } from "@anthropic-ai/claude-agent-sdk";
import {
  readWslLoginShellCommandOutputAsync,
  type CapabilitiesProbeResult,
  type DetectProbeCtx,
} from "../base";
import { CLAUDE_FAST_MODE_DISABLED_MESSAGE } from "./detection";
import { resolveFastModeCachePath } from "./fastModeCache";
import { resolveFastAvailability } from "./fastModeProbe";
import { AsyncPromptQueue } from "./promptQueue";

const CLAUDE_TERMINAL_AUTH_METHOD: AgentAuthMethod = {
  type: "terminal",
  id: "claude-login",
  name: "Claude login",
  args: ["auth", "login"],
};

const MIN_CLAUDE_OPUS_47_CLI = [2, 1, 111] as const;
const MIN_CLAUDE_OPUS_48_CLI = [2, 1, 154] as const;
const OPUS_48_MODEL_ID = "claude-opus-4-8";
const OPUS_47_MODEL_ID = "claude-opus-4-7";

const CLAUDE_SEMVER_RE = /(\d+)\.(\d+)\.(\d+)/;

/** Built-in catalog (CLI `--model` ids) merged with semver gate + SDK slash commands. */
const BUILTIN_MODELS: AgentCapability["models"] = [
  { id: OPUS_48_MODEL_ID, label: "Opus 4.8" },
  { id: OPUS_47_MODEL_ID, label: "Opus 4.7" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
];

const BUILTIN_MODEL_EFFORTS: AgentCapability["modelEfforts"] = {
  "claude-opus-4-6": ["low", "medium", "high", "max"],
  haiku: [],
  sonnet: ["low", "medium", "high", "max"],
};

function parseSemverTriplet(version: string): [number, number, number] | null {
  const m = CLAUDE_SEMVER_RE.exec(version.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function semverGte(a: [number, number, number], b: readonly [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] >= b[2];
}

/** Hide Opus releases when the installed CLI is older than Anthropic's minimum for that model. */
export function claudeCapabilitiesFromCliVersion(
  version: string | undefined,
): Partial<AgentCapability> | undefined {
  if (!version) return undefined;
  const triplet = parseSemverTriplet(version);
  if (!triplet) return undefined;

  const hiddenModelIds = new Set<string>();
  if (!semverGte(triplet, MIN_CLAUDE_OPUS_48_CLI)) hiddenModelIds.add(OPUS_48_MODEL_ID);
  if (!semverGte(triplet, MIN_CLAUDE_OPUS_47_CLI)) hiddenModelIds.add(OPUS_47_MODEL_ID);
  if (hiddenModelIds.size === 0) return undefined;

  const models = BUILTIN_MODELS.filter((m) => !hiddenModelIds.has(m.id));
  const modelEfforts = { ...BUILTIN_MODEL_EFFORTS };
  for (const modelId of hiddenModelIds) {
    delete modelEfforts[modelId];
  }
  return { models, modelEfforts };
}

export function mapClaudeSlashCommands(
  commands: readonly SlashCommand[],
): NonNullable<AgentCapability["slashCommands"]> {
  return commands.map((c) => ({
    id: c.name,
    label: c.description?.trim() ? `${c.name} — ${c.description}` : c.name,
    ...(c.description?.trim() ? { description: c.description } : {}),
    ...(c.argumentHint ? { argumentHint: c.argumentHint } : {}),
  }));
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
): Promise<Partial<AgentCapability> | undefined> {
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const abort = new AbortController();
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
          settingSources: ["user", "project", "local"],
          allowedTools: [],
          stderr: () => {},
        },
      });
      const init = await q.initializationResult();
      const slashCommands = mapClaudeSlashCommands(init.commands);
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
      if (slashCommands.length === 0 && !fastDisabledReason) return undefined;
      return {
        ...(slashCommands.length > 0 ? { slashCommands } : {}),
        ...(fastDisabledReason ? { fastDisabledReason } : {}),
      };
    } finally {
      clearTimeout(timer);
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
    { timeout: timeoutMs + 3000 },
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
      fastAvailable?: boolean;
      error?: string;
    };
    if (parsed.error) {
      console.log("[claude-probe] wsl worker error field:", parsed.error);
      return undefined;
    }
    const fastDisabledReason =
      parsed.fastAvailable === false ? CLAUDE_FAST_MODE_DISABLED_MESSAGE : undefined;
    if (!parsed.slashCommands?.length && !fastDisabledReason) return undefined;
    return {
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
): Promise<CapabilitiesProbeResult | undefined> {
  if (!ctx.executablePath) return undefined;

  // Both paths may run a one-off fast-mode availability turn on a cache miss, so
  // allow extra headroom over a plain init probe.
  const timeoutMs = process.platform === "win32" ? 25_000 : 20_000;
  const sdkPartial =
    ctx.location.kind === "wsl"
      ? await probeClaudeSdkPartialWsl(ctx, timeoutMs)
      : await probeClaudeSdkPartialNative(ctx.executablePath, timeoutMs);

  const versionPartial = claudeCapabilitiesFromCliVersion(ctx.version);

  // Always advertise the terminal login + `claude auth logout` capabilities
  // when the binary is installed — the Settings UI gates the Login/Logout
  // controls on these fields, and the supervisor's logout dispatcher uses
  // the adapter's `buildAcpLogoutCommand` to invoke `claude auth logout`.
  return {
    ...(sdkPartial ?? {}),
    ...(versionPartial ?? {}),
    authMethods: [CLAUDE_TERMINAL_AUTH_METHOD],
    authLogoutSupported: true,
  };
}
