import {
  antigravityPoolWindows,
  antigravityQuotaSummaryWindows,
  hasAntigravityQuotaSummaryGroups,
  type UsageSnapshot,
  type UsageWindow,
} from "@poracode/agents-usage";
import type { AgentStatus, ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "../base";
import { readAntigravityAcpUsage } from "./antigravityAcpUsage";
import { readAntigravityCliUsage } from "./antigravityCliUsage";
import {
  GET_COMMAND_MODEL_CONFIGS,
  GET_USER_STATUS,
  modelsFromBody,
  planFromUserStatus,
  queryLs,
  RETRIEVE_USER_QUOTA_SUMMARY,
} from "./antigravityLanguageServer";
import { resolveAntigravityLsEndpoints } from "./antigravityProcessScan";

/**
 * Antigravity usage starts with an already-running local language server.
 *
 * While `agy` (or the Antigravity IDE) is running it hosts a local language
 * server — a Connect-RPC service reachable on a loopback port. Discovery
 * (process trees, loopback ports, CSRF tokens) lives in
 * `antigravityProcessScan.ts`; the RPC calls + response parsing live in
 * `antigravityLanguageServer.ts` and `@poracode/agents-usage`. If the server
 * has no measured quota, the CLI and ACP readers use the vendor's own
 * `/usage` reports with the sign-in already held by those runtimes.
 *
 * Per endpoint, `RetrieveUserQuotaSummary` (the current two-group / 5h+weekly
 * quota model) and `GetUserStatus` (plan + legacy per-model quota) are
 * independent, so they run concurrently. A grouped summary that measures a
 * Gemini group is the complete local answer and wins immediately; otherwise
 * the first grouped measured result wins over the first legacy measured result.
 * Each snapshot stays within one endpoint: windows and plan are never mixed.
 */

export interface AntigravityUsageRuntime {
  status: AgentStatus;
  adapter: AgentAdapter;
}

export interface AntigravityUsageScannerDeps {
  resolveEndpoints(
    wslDistros: readonly string[],
  ): Promise<{ ports: number[]; csrfTokens: string[] }>;
  queryLs(port: number, path: string, csrfTokens: string[]): Promise<unknown | undefined>;
  getRuntime?(): Promise<AntigravityUsageRuntime | undefined>;
  readCliUsage?: typeof readAntigravityCliUsage;
  readAcpUsage?: typeof readAntigravityAcpUsage;
  signal?: AbortSignal;
}

const defaultDeps: AntigravityUsageScannerDeps = {
  resolveEndpoints: resolveAntigravityLsEndpoints,
  queryLs,
  readCliUsage: readAntigravityCliUsage,
  readAcpUsage: readAntigravityAcpUsage,
};

const GROUPED_GEMINI_PRIORITY = 3;
const GROUPED_PRIORITY = 2;
const LEGACY_PRIORITY = 1;
const CONTEXT_PRIORITY = 0;

interface LocalCandidate {
  priority: number;
  snapshot: UsageSnapshot;
}

function appNotRunning(nowMs: number): UsageSnapshot {
  return { providerId: "antigravity", status: "app-not-running", windows: [], fetchedAt: nowMs };
}

function snapshotFrom(
  nowMs: number,
  windows: UsageWindow[],
  plan: string | undefined,
): UsageSnapshot {
  return {
    providerId: "antigravity",
    status: "ok",
    windows,
    fetchedAt: nowMs,
    ...(plan ? { plan } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Grouped windows use `antigravity:<group>:<cadence>`, so dynamic Gemini groups
 * such as "Gemini 4 Argon" (`gemini-4-argon`) count alongside the canonical
 * `gemini` group. Legacy pool ids (`antigravity:gemini-pro`) have no cadence
 * segment and are deliberately not matched here.
 */
function groupedGeminiKey(window: UsageWindow): string | undefined {
  return /^antigravity:([^:]+):[^:]+$/.exec(window.id)?.[1];
}

function isGroupedGeminiWindow(window: UsageWindow): boolean {
  const group = groupedGeminiKey(window);
  return group === "gemini" || group?.startsWith("gemini-") === true;
}

function isCanonicalGroupedGeminiWindow(window: UsageWindow): boolean {
  return groupedGeminiKey(window) === "gemini";
}

/** Legacy Gemini pool ids (Pro, Flash, and Argon). */
function isLegacyGeminiPoolWindow(window: UsageWindow): boolean {
  return window.id.startsWith("antigravity:gemini-");
}

/** A `GetUserStatus` body that actually carries the provider's status shape. */
function isProviderStatusBody(body: unknown): boolean {
  return isRecord(body) && isRecord(body.userStatus);
}

/**
 * Legacy per-model pooling: GetUserStatus carries each model's 5-hour
 * `quotaInfo.remainingFraction`, which we fold into Gemini Pro / Flash / Claude
 * pools. Falls back to GetCommandModelConfigs on the same endpoint when
 * GetUserStatus answered without quota.
 */
async function legacyPoolWindows(
  statusBody: unknown,
  ask: (path: string) => Promise<unknown | undefined>,
): Promise<UsageWindow[]> {
  let models = statusBody !== undefined ? modelsFromBody(statusBody) : [];
  if (statusBody !== undefined && models.length === 0) {
    const configs = await ask(GET_COMMAND_MODEL_CONFIGS);
    if (configs !== undefined) models = modelsFromBody(configs);
  }
  return antigravityPoolWindows(models);
}

/**
 * Read one already-discovered endpoint. A grouped summary wins over legacy
 * pooling; missing Gemini pools are supplemented from the same endpoint only.
 * When the endpoint answered without a measured window, its provider-shaped
 * status or empty quota response is retained as context for the same endpoint's
 * plan.
 */
async function probeEndpoint(
  port: number,
  csrfTokens: readonly string[],
  nowMs: number,
  query: AntigravityUsageScannerDeps["queryLs"],
): Promise<LocalCandidate | undefined> {
  const tokens = [...csrfTokens];
  const ask = async (path: string): Promise<unknown | undefined> => {
    try {
      return await query(port, path, tokens);
    } catch {
      return undefined;
    }
  };
  const [statusBody, summaryBody] = await Promise.all([
    ask(GET_USER_STATUS),
    ask(RETRIEVE_USER_QUOTA_SUMMARY),
  ]);
  const plan = planFromUserStatus(statusBody);
  const summaryWindows =
    summaryBody !== undefined ? antigravityQuotaSummaryWindows(summaryBody) : [];

  if (summaryWindows.length > 0) {
    const hasGroupedGemini = summaryWindows.some(isGroupedGeminiWindow);
    const hasCanonicalGemini = summaryWindows.some(isCanonicalGroupedGeminiWindow);
    let windows = summaryWindows;
    if (!hasCanonicalGemini) {
      // Some local servers report only the Claude/GPT group, or only a dynamic
      // Gemini group; supplement from the same endpoint's legacy Gemini pools
      // when available.
      const geminiPools = (await legacyPoolWindows(statusBody, ask)).filter(
        isLegacyGeminiPoolWindow,
      );
      if (geminiPools.length > 0) windows = [...geminiPools, ...windows];
    }
    return {
      priority: hasGroupedGemini ? GROUPED_GEMINI_PRIORITY : GROUPED_PRIORITY,
      snapshot: snapshotFrom(nowMs, windows, plan),
    };
  }

  const legacyWindows = await legacyPoolWindows(statusBody, ask);
  if (legacyWindows.length > 0) {
    return { priority: LEGACY_PRIORITY, snapshot: snapshotFrom(nowMs, legacyWindows, plan) };
  }
  if (isProviderStatusBody(statusBody) || hasAntigravityQuotaSummaryGroups(summaryBody)) {
    return { priority: CONTEXT_PRIORITY, snapshot: snapshotFrom(nowMs, [], plan) };
  }
  return undefined;
}

/**
 * Build the Antigravity usage snapshot from the best available local endpoint.
 * A grouped summary measuring Gemini wins immediately; otherwise the first
 * grouped measured result is preferred over the first legacy measured result,
 * and an endpoint that answered without measured quota yields an empty `ok`
 * snapshot with that same endpoint's plan ("No windows reported"). No windows
 * or plan are ever combined across endpoints.
 */
async function scanLocalLanguageServerUsage(
  nowMs: number,
  wslDistros: readonly string[],
  resolveEndpoints: AntigravityUsageScannerDeps["resolveEndpoints"],
  query: AntigravityUsageScannerDeps["queryLs"],
): Promise<UsageSnapshot> {
  let endpoints: { ports: number[]; csrfTokens: string[] };
  try {
    endpoints = await resolveEndpoints(wslDistros);
  } catch {
    return appNotRunning(nowMs);
  }

  let best: LocalCandidate | undefined;
  for (const port of endpoints.ports) {
    const candidate = await probeEndpoint(port, endpoints.csrfTokens, nowMs, query).catch(
      () => undefined,
    );
    if (!candidate) continue;
    if (candidate.priority === GROUPED_GEMINI_PRIORITY) return candidate.snapshot;
    if (!best || candidate.priority > best.priority) {
      best = candidate;
      continue;
    }
    // Keep the existing tie-break: an empty snapshot with a same-endpoint plan
    // replaces an earlier empty snapshot without one.
    if (
      candidate.priority === best.priority &&
      candidate.snapshot.windows.length === 0 &&
      !best.snapshot.plan &&
      candidate.snapshot.plan
    ) {
      best = candidate;
    }
  }
  return best?.snapshot ?? appNotRunning(nowMs);
}

function runtimeLocation(status: AgentStatus): ProjectLocation {
  if (status.envKind === "wsl" && status.envDistro) {
    return {
      kind: "wsl",
      distro: status.envDistro,
      linuxPath: "/tmp",
      uncPath: `\\\\wsl.localhost\\${status.envDistro}\\tmp`,
    };
  }
  if (isNativeWindows(status)) return { kind: "windows", path: process.cwd() };
  return { kind: "posix", path: process.cwd() };
}

function isNativeWindows(status: AgentStatus): boolean {
  return status.envKind === "windows" || (!status.envKind && process.platform === "win32");
}

function cliExecutable(status: AgentStatus): string | undefined {
  const variant = status.runtimeVariants?.cli;
  if (variant?.installed !== true || variant.authState !== "authenticated") return undefined;
  if (!status.executablePath) return undefined;
  // CLI detection auth is only the config-directory soft signal. Native
  // Windows browser suppression is unqualified, so never start the CLI there;
  // the ACP utility session or running language server supplies usage instead.
  if (isNativeWindows(status) && variant.authUsesProviderLogin) {
    return undefined;
  }
  return status.executablePath;
}

function acpAuthenticated(status: AgentStatus): boolean {
  const variant = status.runtimeVariants?.acp;
  return (
    variant?.installed === true &&
    (variant.authState === "authenticated" || status.acpSessionEstablished === true)
  );
}

function isUsableSnapshot(snapshot: UsageSnapshot | undefined): snapshot is UsageSnapshot {
  return snapshot?.status === "ok" && snapshot.windows.length > 0;
}

/**
 * Collect Antigravity quota from the least invasive source first: a measured
 * reading from an already-running local language server wins without launching
 * another process; otherwise the signed-in CLI report, then the official ACP
 * utility session. An answered-but-unmeasured local context is retained if every
 * fallback source fails. A fallback source is returned whole; windows from
 * separate sources are never combined.
 */
export async function scanAntigravityUsage(
  nowMs: number,
  wslDistros: readonly string[] = [],
  deps: Partial<AntigravityUsageScannerDeps> = {},
): Promise<UsageSnapshot> {
  const settings = { ...defaultDeps, ...deps };
  if (settings.signal?.aborted) return appNotRunning(nowMs);
  const local = await scanLocalLanguageServerUsage(
    nowMs,
    wslDistros,
    settings.resolveEndpoints,
    settings.queryLs,
  );
  if (local.status === "ok" && local.windows.length > 0) return local;
  if (settings.signal?.aborted) return local;

  const runtime = await settings.getRuntime?.().catch(() => undefined);
  if (runtime) {
    const location = runtimeLocation(runtime.status);
    const executable = cliExecutable(runtime.status);
    if (executable) {
      const cli = await settings
        .readCliUsage?.(executable, location, nowMs, {
          ...(settings.signal ? { signal: settings.signal } : {}),
        })
        .catch(() => undefined);
      if (isUsableSnapshot(cli)) return cli;
    }
    if (acpAuthenticated(runtime.status) && !settings.signal?.aborted) {
      const acp = await settings
        .readAcpUsage?.(runtime, location, nowMs, {
          ...(settings.signal ? { signal: settings.signal } : {}),
        })
        .catch(() => undefined);
      if (isUsableSnapshot(acp)) return acp;
    }
  }
  return local;
}
