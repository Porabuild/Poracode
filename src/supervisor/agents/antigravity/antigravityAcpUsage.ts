import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { PromptResponse } from "@agentclientprotocol/sdk/unstable";
import type { AgentStatus, ProjectLocation, UsageSnapshot } from "@/shared/contracts";
import { antigravityQuotaSummaryWindows } from "@poracode/agents-usage";
import { resolveAgentHomeSubpath, type AgentEnvContext, type CommandSpec } from "../base";
import {
  probeAcpCapabilities,
  type AcpProbeResult,
  type AcpUtilitySession,
  type AcpUtilitySessionContext,
} from "../acp/probe";

/**
 * Read the official Antigravity ACP server's human quota report through a
 * private, read-only utility session. The caller must have detected an
 * installed, authenticated ACP runtime and supplies the official adapter so
 * this reader uses its managed binary/env without issuing authenticate/login.
 *
 * The same process/session receives one exact bare `/usage` text prompt. The
 * native response is Markdown. Quota entries with an explicit remaining
 * percentage are normalized through the shared Antigravity parser and carry
 * a reset when available. EOF, timeout, exit, logged-out, or malformed
 * output skips this source. It never reads credentials.
 */

const UTILITY_TIMEOUT_MS = 60_000;
const PROMPT_TIMEOUT_MS = 30_000;
const MAX_ACP_USAGE_TEXT_BYTES = 128 * 1024;
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AntigravityAcpUsageAdapter {
  buildAcpAuthCommand?(ctx?: AgentEnvContext): Promise<CommandSpec | undefined>;
}

export interface AntigravityAcpUsageRuntime {
  status: AgentStatus;
  adapter: AntigravityAcpUsageAdapter;
}

export interface AntigravityAcpUsageDeps {
  probe: typeof probeAcpCapabilities;
  signal?: AbortSignal;
  resolveWslConversationsDir?: (location: ProjectLocation) => string | undefined;
}

const defaultDeps: AntigravityAcpUsageDeps = {
  probe: probeAcpCapabilities,
  resolveWslConversationsDir: (location) =>
    resolveAgentHomeSubpath(location, ".gemini/antigravity-acp/conversations"),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readVersion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /\b(\d+\.\d+\.\d+)\b/.exec(value.trim());
  return match?.[1];
}

/**
 * An available-command list that explicitly excludes usage is authoritative for
 * every version. Only 1.5.2 is allowed to proceed when no list was published:
 * the offline artifact confirms its native /usage handler and report, while
 * independent Pi Antigravity ACP uses the same session/prompt family. No claim
 * is made that 1.5.2 never advertises the command.
 */
function allowsUnadvertisedUsage(
  version: string | undefined,
  slashCommands: readonly { id: string }[] | undefined,
): boolean {
  return slashCommands === undefined && version === "1.5.2";
}

function hasAdvertisedUsage(slashCommands: readonly { id: string }[] | undefined): boolean {
  return (
    slashCommands?.some(
      (command) => command.id.replace(/^\//, "").trim().toLowerCase() === "usage",
    ) === true
  );
}

function hasPositivePromptUsage(usage: PromptResponse["usage"]): boolean {
  if (!usage) return false;
  return [
    usage.totalTokens,
    usage.inputTokens,
    usage.outputTokens,
    usage.thoughtTokens,
    usage.cachedReadTokens,
    usage.cachedWriteTokens,
  ].some((value) => typeof value === "number" && value > 0);
}

function parsePercent(value: string): number | undefined {
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : undefined;
}

function bucketWindow(label: string): string | undefined {
  const lower = label.toLowerCase();
  if (/\bweek/.test(lower)) return "weekly";
  if (/\b(?:hour|5h|five hour)\b/.test(lower)) return "5h";
  if (/\bday/.test(lower)) return "daily";
  if (/\bmonth/.test(lower)) return "monthly";
  return undefined;
}

/**
 * Parse the native `### Quota Limits` Markdown. Each group is a bold bullet and
 * each bucket under it is indented with an explicit percentage/reset:
 * `- **Weekly Limit Remaining:** 91% remaining (resets Oct 02, 2026, 08:22 UTC)`.
 */
export function parseAntigravityAcpUsageReport(
  markdown: string,
  nowMs: number,
): UsageSnapshot | undefined {
  const lines = markdown.split(/\r?\n/);
  const groups: Array<{
    displayName: string;
    buckets: Array<Record<string, unknown>>;
  }> = [];
  let inSection = false;
  let currentGroup: (typeof groups)[number] | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,6}\s*Quota Limits\s*$/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^#{1,6}\s+/.test(trimmed)) break;

    const groupMatch = /^[-*]\s+\*\*(.+?)\*\*\s*$/.exec(trimmed);
    if (groupMatch?.[1]) {
      currentGroup = { displayName: groupMatch[1].trim(), buckets: [] };
      groups.push(currentGroup);
      continue;
    }
    const bucketMatch =
      /^[-*]\s+\*\*(.+?):\*\*\s+(\d+(?:\.\d+)?)%\s+remaining(?:\s+\(resets?\s+(.+?)\))?/i.exec(
        trimmed,
      );
    if (!bucketMatch || !currentGroup) continue;
    const percent = parsePercent(bucketMatch[2] ?? "");
    if (percent === undefined) continue;
    let resetTime: string | undefined;
    if (bucketMatch[3] !== undefined) {
      const reset = Date.parse(bucketMatch[3]);
      if (!Number.isFinite(reset) || reset <= 0) continue;
      resetTime = new Date(reset).toISOString();
    }
    const label = bucketMatch[1]?.trim();
    if (!label) continue;
    const window = bucketWindow(label);
    if (!window) continue;
    currentGroup.buckets.push({
      displayName: label,
      window,
      remainingFraction: percent / 100,
      ...(resetTime ? { resetTime } : {}),
    });
  }

  const usableGroups = groups.filter((group) => group.buckets.length > 0);
  if (usableGroups.length === 0) return undefined;
  const windows = antigravityQuotaSummaryWindows({ groups: usableGroups });
  if (windows.length === 0) return undefined;
  return {
    providerId: "antigravity",
    status: "ok",
    windows,
    fetchedAt: nowMs,
  };
}

/** Remove only the exact session files this probe created, after process exit. */
async function removeSessionFilesIn(conversations: string, sessionId: string): Promise<void> {
  if (!SESSION_ID_RE.test(sessionId)) return;
  await Promise.all(
    [".db", ".db-shm", ".db-wal", ".meta"].map((suffix) =>
      rm(join(conversations, `${sessionId}${suffix}`), { force: true }).catch(() => {}),
    ),
  );
}

export async function removeAntigravityAcpSessionFiles(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!SESSION_ID_RE.test(sessionId)) return;
  const geminiHome = env.GEMINI_HOME?.trim();
  const base = geminiHome ? geminiHome : join(env.HOME?.trim() || homedir(), ".gemini");
  await removeSessionFilesIn(join(base, "antigravity-acp", "conversations"), sessionId);
}

function utilitySession(
  nowMs: number,
  location: ProjectLocation,
  wslConversationsDir: string | undefined,
): AcpUtilitySession {
  let collecting = false;
  let collectingSessionId: string | undefined;
  let text = "";
  let textBytes = 0;
  let oversized = false;
  return {
    qualifies: (initialize) => initialize.agentInfo?.name === "antigravity-acp",
    onSessionUpdate: (notification) => {
      if (!collecting || notification.sessionId !== collectingSessionId) return;
      const update = notification.update;
      if (
        update.sessionUpdate === "agent_message_chunk" &&
        update.content.type === "text" &&
        typeof update.content.text === "string"
      ) {
        const chunkBytes = Buffer.byteLength(update.content.text, "utf8");
        if (oversized) return;
        if (textBytes + chunkBytes > MAX_ACP_USAGE_TEXT_BYTES) {
          oversized = true;
          return;
        }
        text += update.content.text;
        textBytes += chunkBytes;
      }
    },
    run: async (context: AcpUtilitySessionContext) => {
      const version = readVersion(context.initialize.agentInfo?.version);
      if (
        !hasAdvertisedUsage(context.slashCommands) &&
        !allowsUnadvertisedUsage(version, context.slashCommands)
      ) {
        return undefined;
      }
      collecting = true;
      collectingSessionId = context.sessionId;
      text = "";
      textBytes = 0;
      oversized = false;
      try {
        const response = await context.prompt("/usage", PROMPT_TIMEOUT_MS);
        if (
          response.stopReason !== "end_turn" ||
          hasPositivePromptUsage(response.usage) ||
          oversized
        ) {
          return undefined;
        }
        return parseAntigravityAcpUsageReport(text, nowMs);
      } finally {
        collecting = false;
        collectingSessionId = undefined;
      }
    },
    cleanupAfterProcess: async (context) => {
      if (location.kind === "wsl") {
        if (wslConversationsDir) {
          await removeSessionFilesIn(wslConversationsDir, context.sessionId);
        }
        return;
      }
      await removeAntigravityAcpSessionFiles(context.sessionId, {
        ...process.env,
        ...context.command.env,
      });
    },
  };
}

function snapshotFromProbe(result: AcpProbeResult | undefined): UsageSnapshot | undefined {
  const value = result?.utilityResult;
  if (!isRecord(value) || value.providerId !== "antigravity" || value.status !== "ok") {
    return undefined;
  }
  return Array.isArray(value.windows) ? (value as unknown as UsageSnapshot) : undefined;
}

/**
 * Read ACP quota for an already-authenticated official runtime. Returns
 * `undefined` when the runtime is not authenticated/qualified, or when the
 * utility session fails closed.
 */
export async function readAntigravityAcpUsage(
  runtime: AntigravityAcpUsageRuntime,
  location: ProjectLocation,
  nowMs: number,
  deps: Partial<AntigravityAcpUsageDeps> = {},
): Promise<UsageSnapshot | undefined> {
  const variant = runtime.status.runtimeVariants?.acp;
  if (variant?.installed !== true) return undefined;
  if (variant.authState !== "authenticated" && runtime.status.acpSessionEstablished !== true) {
    return undefined;
  }
  if (!runtime.adapter.buildAcpAuthCommand) return undefined;
  const signal = deps.signal;
  if (signal?.aborted) return undefined;
  const envKind =
    location.kind === "wsl"
      ? ("wsl" as const)
      : location.kind === "windows"
        ? ("windows" as const)
        : ("posix" as const);
  const command = await runtime.adapter
    .buildAcpAuthCommand({
      envKind,
      ...(location.kind === "wsl" ? { wslDistro: location.distro } : {}),
      ...(signal ? { signal } : {}),
    })
    .catch(() => undefined);
  if (!command) return undefined;

  const wslConversationsDir =
    location.kind === "wsl" && !command.env?.GEMINI_HOME?.trim()
      ? (deps.resolveWslConversationsDir ?? defaultDeps.resolveWslConversationsDir)?.(location)
      : undefined;
  // A WSL server writes in Linux; without a host-addressable exact session
  // namespace there is no safe post-exit cleanup, so skip before session/new.
  if (location.kind === "wsl" && !wslConversationsDir) return undefined;

  const probeDir = await mkdtemp(join(tmpdir(), "poracode-antigravity-acp-usage-")).catch(
    () => undefined,
  );
  const nativeCwd = probeDir ?? tmpdir();
  const sessionCwd = location.kind === "wsl" ? "/tmp" : nativeCwd;
  const processCwd = location.kind === "wsl" ? command.cwd : nativeCwd;
  const probe = deps.probe ?? defaultDeps.probe;
  try {
    const result = await probe(command.command, command.args, sessionCwd, {
      ...(processCwd ? { processCwd } : {}),
      timeoutMs: UTILITY_TIMEOUT_MS,
      label: "antigravity-usage",
      fsTextCapability: false,
      terminalCapability: false,
      utilitySession: utilitySession(nowMs, location, wslConversationsDir),
      ...(command.env ? { env: command.env } : {}),
      ...(signal ? { signal } : {}),
    });
    return snapshotFromProbe(result);
  } catch {
    return undefined;
  } finally {
    await command.cleanup?.();
    if (probeDir) await rm(probeDir, { recursive: true, force: true }).catch(() => {});
  }
}
