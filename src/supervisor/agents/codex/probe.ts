/**
 * Lightweight Codex app-server capability probe.
 *
 * Spawns a temporary app-server, speaks JSON-RPC over stdio, queries
 * `model/list` and `configRequirements/read`, then kills the process.
 * Falls back gracefully on any failure.
 *
 * Provider-specific — unlike the ACP probe, this speaks the Codex
 * app-server JSON-RPC 2.0 protocol over newline-delimited stdio.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { AgentSlashCommand, ProjectLocation } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import { resolveNodeForDistro } from "../../wsl/runtime";
import { resolveProbeSpawnCwd } from "../probeCwd";
import { buildCodexAppServerCommand } from "./argv";
import { CodexStdioTransport } from "./stdioTransport";

// ── Types ────────────────────────────────────────────────────────

/** Raw model entry from the Codex `model/list` response. */
interface CodexModelEntry {
  id: string;
  model: string;
  displayName: string;
  hidden: boolean;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>;
  // Fast/priority service-tier signals (Codex CLI 0.143.0+). Loosely typed —
  // older CLIs omit both fields, so treat the payload defensively. `["fast"]`
  // marks a model that honors `service_tier="fast"`; the `serviceTiers` list
  // carries the matching tier descriptor (e.g. the "priority"/Fast tier).
  additionalSpeedTiers?: string[];
  serviceTiers?: Array<{ id: string }>;
}

/** Raw requirements from `configRequirements/read`. */
interface CodexConfigRequirements {
  allowedApprovalPolicies?: string[] | null;
  allowedSandboxModes?: string[] | null;
}

export interface CodexProbeResult {
  models?: Array<{ id: string; label: string }>;
  efforts?: string[];
  defaultEffort?: string;
  modelEfforts?: Record<string, string[]>;
  /** Visible model ids that support the Fast/priority service tier. */
  fastModels?: string[];
  approvalPolicies?: Array<{ id: string; label: string }>;
  sandboxModes?: Array<{ id: string; label: string }>;
  slashCommands?: AgentSlashCommand[];
}

/** Account info from Codex `account/read`. */
export interface CodexAccountInfo {
  /** "chatgpt" | "apiKey" | "amazonBedrock" | other future variants. */
  type?: string;
  /** Present when `type === "chatgpt"` and the user signed in via ChatGPT. */
  email?: string;
  /** Raw plan type token from `account/read` (`pro`, `plus`, `team`, ...). */
  planType?: string;
}

// ── Label maps ──────────────────────────────────────────────────

/** Default approval policies when no enterprise requirements restrict the list. */
const DEFAULT_APPROVAL_POLICIES: Array<{ id: string; label: string }> = [
  { id: "on-request", label: "On Request" },
  { id: "on-failure", label: "On Failure" },
  { id: "never", label: "Full Access" },
  { id: "untrusted", label: "Untrusted" },
];

const APPROVAL_POLICY_LABELS: Record<string, string> = {
  "on-request": "On Request",
  "on-failure": "On Failure",
  never: "Full Access",
  untrusted: "Untrusted",
};

/** Default sandbox modes when no enterprise requirements restrict the list. */
const DEFAULT_SANDBOX_MODES: Array<{ id: string; label: string }> = [
  { id: "workspace-write", label: "Workspace Write" },
  { id: "read-only", label: "Read Only" },
  { id: "danger-full-access", label: "Full Access" },
];

const SANDBOX_MODE_LABELS: Record<string, string> = {
  "workspace-write": "Workspace Write",
  "read-only": "Read Only",
  "danger-full-access": "Full Access",
};

const EFFORT_ORDER: Record<string, number> = {
  none: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
};

const PREFERRED_CODEX_DEFAULT_MODEL = "gpt-5.5";

// ── Mapping helpers ─────────────────────────────────────────────

/**
 * Build a human-friendly label from a Codex model entry.
 *
 * When the server returns a `displayName` that looks like a raw model ID
 * (e.g. "gpt-5.4-mini", "GPT-5.4-Mini"), strip the "gpt-" prefix and
 * title-case dash-separated segments so the UI shows "5.4 Mini".
 *
 * If the `displayName` is meaningfully different from the `id`, use it
 * as-is (the server provided a curated label).
 */
export function humanizeCodexModelName(id: string, displayName: string): string {
  // If the displayName differs from the id in more than just casing, trust it
  if (displayName.toLowerCase() !== id.toLowerCase()) {
    return displayName;
  }

  // Strip "gpt-" prefix and title-case segments
  const stripped = id.replace(/^gpt-/i, "");
  return stripped
    .split("-")
    .map((seg) => (seg.length <= 1 ? seg : seg[0]!.toUpperCase() + seg.slice(1)))
    .join(" ");
}

/**
 * Whether a single model entry advertises the Fast/priority service tier.
 *
 * Prefer the explicit `additionalSpeedTiers` list when present; only fall
 * back to `serviceTiers` (non-empty ⇒ a tier like "priority"/Fast exists)
 * when `additionalSpeedTiers` is absent.
 */
function codexModelSupportsFast(entry: CodexModelEntry): boolean {
  if (entry.additionalSpeedTiers !== undefined) {
    return Array.isArray(entry.additionalSpeedTiers) && entry.additionalSpeedTiers.includes("fast");
  }
  return Array.isArray(entry.serviceTiers) && entry.serviceTiers.length > 0;
}

export function mapCodexModels(
  models: CodexModelEntry[],
): Pick<CodexProbeResult, "models" | "efforts" | "defaultEffort" | "modelEfforts" | "fastModels"> {
  const visible = models.filter((m) => !m.hidden);
  if (visible.length === 0) return {};

  const ordered = [...visible].sort((a, b) => {
    if (a.id === PREFERRED_CODEX_DEFAULT_MODEL) return -1;
    if (b.id === PREFERRED_CODEX_DEFAULT_MODEL) return 1;
    return 0;
  });

  const mapped = ordered.map((m) => ({
    id: m.id,
    label: humanizeCodexModelName(m.id, m.displayName),
  }));

  // Collect per-model effort arrays
  const perModelEfforts = new Map<string, string[]>();
  const allEfforts = new Set<string>();
  for (const m of visible) {
    const efforts = m.supportedReasoningEfforts.map((e) => e.reasoningEffort);
    perModelEfforts.set(m.id, efforts);
    for (const e of efforts) allEfforts.add(e);
  }

  // Sort efforts by canonical order
  const sortedEfforts = [...allEfforts].sort(
    (a, b) => (EFFORT_ORDER[a] ?? 99) - (EFFORT_ORDER[b] ?? 99),
  );

  // Prefer high for Codex threads when the default model supports it.
  // The CLI may report medium as its built-in default, but Poracode's
  // Codex UX should start at high unless the model can't use it.
  const defaultModel =
    visible.find((m) => m.id === PREFERRED_CODEX_DEFAULT_MODEL) ??
    visible.find((m) => m.isDefault) ??
    visible[0]!;
  const defaultModelEfforts = perModelEfforts.get(defaultModel.id) ?? [];
  const defaultEffort = defaultModelEfforts.includes("high")
    ? "high"
    : defaultModel.defaultReasoningEffort;

  // modelEfforts: only include models whose efforts differ from global list
  const globalKey = sortedEfforts.join(",");
  const modelEfforts: Record<string, string[]> = {};
  for (const [modelId, efforts] of perModelEfforts) {
    const sorted = [...efforts].sort((a, b) => (EFFORT_ORDER[a] ?? 99) - (EFFORT_ORDER[b] ?? 99));
    if (sorted.join(",") !== globalKey) {
      modelEfforts[modelId] = sorted;
    }
  }

  // Fast-mode capability. When the payload reports tier data on any visible
  // model, advertise Fast only for the models that actually support it.
  // Older Codex CLIs omit both tier fields entirely — in that case keep the
  // prior behavior and treat every visible model as fast-capable so the Fast
  // toggle isn't silently dropped after a downgrade.
  const reportsTierData = visible.some(
    (m) => m.additionalSpeedTiers !== undefined || m.serviceTiers !== undefined,
  );
  const fastModels = reportsTierData
    ? visible.filter((m) => codexModelSupportsFast(m)).map((m) => m.id)
    : visible.map((m) => m.id);

  return {
    models: mapped,
    efforts: sortedEfforts,
    defaultEffort,
    ...(Object.keys(modelEfforts).length > 0 ? { modelEfforts } : {}),
    ...(fastModels.length > 0 ? { fastModels } : {}),
  };
}

export interface CodexRawSlashCommand {
  name?: string;
  id?: string;
  description?: string;
  argumentHint?: string;
}

export function readCodexInitCommands(initResult: unknown): CodexRawSlashCommand[] {
  if (!initResult || typeof initResult !== "object") return [];
  const commands = (initResult as { commands?: unknown }).commands;
  if (!Array.isArray(commands)) return [];
  return commands.filter((c): c is CodexRawSlashCommand => typeof c === "object" && c !== null);
}

export function mapCodexSlashCommands(
  commands: readonly CodexRawSlashCommand[],
): AgentSlashCommand[] {
  return commands.flatMap((c) => {
    const id = (c.name ?? c.id ?? "").trim();
    if (!id) return [];
    const description = c.description?.trim();
    return [
      {
        id,
        label: description ? `${id} — ${description}` : id,
        ...(description ? { description } : {}),
        ...(c.argumentHint?.trim() ? { argumentHint: c.argumentHint.trim() } : {}),
      },
    ];
  });
}

/**
 * Map `configRequirements/read` response to approval policies and sandbox modes.
 *
 * When requirements are null (no enterprise/MDM restrictions), returns the
 * full default lists. When requirements restrict the allowed values, filters
 * down to only those.
 */
export function mapCodexRequirements(
  requirements: CodexConfigRequirements | null | undefined,
): Pick<CodexProbeResult, "approvalPolicies" | "sandboxModes"> {
  // No enterprise restrictions — return full default lists
  if (!requirements) {
    return {
      approvalPolicies: DEFAULT_APPROVAL_POLICIES,
      sandboxModes: DEFAULT_SANDBOX_MODES,
    };
  }

  return {
    approvalPolicies: requirements.allowedApprovalPolicies?.length
      ? requirements.allowedApprovalPolicies
          .filter((p) => typeof p === "string")
          .map((id) => ({ id, label: APPROVAL_POLICY_LABELS[id] ?? id }))
      : DEFAULT_APPROVAL_POLICIES,
    sandboxModes: requirements.allowedSandboxModes?.length
      ? requirements.allowedSandboxModes
          .filter((m) => typeof m === "string")
          .map((id) => ({ id, label: SANDBOX_MODE_LABELS[id] ?? id }))
      : DEFAULT_SANDBOX_MODES,
  };
}

// ── JSON-RPC helpers ────────────────────────────────────────────

/**
 * Minimal JSON-RPC 2.0 client over app-server stdio for the probe.
 *
 * Lifetime: spawn → request/notify → dispose.
 */
class ProbeClient {
  private seq = 0;
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  constructor(private readonly transport: CodexStdioTransport) {
    this.transport.setListener({
      onMessage: (message) => {
        if (!message || typeof message !== "object") return;
        const msg = message as Record<string, unknown>;
        if ("id" in msg && typeof msg.id === "string") {
          const entry = this.pending.get(msg.id);
          if (!entry) return;
          this.pending.delete(msg.id);
          if (msg.error !== undefined) {
            const err = msg.error;
            const errMsg =
              typeof err === "object" && err !== null && "message" in err
                ? String((err as Record<string, unknown>).message)
                : String(err);
            entry.reject(new Error(errMsg));
          } else {
            entry.resolve(msg.result);
          }
        }
      },
      onClose: () => {
        this.rejectAll(new Error(`Codex app-server exited.${this.transport.formatOutput()}`));
      },
      onError: (error) => {
        this.rejectAll(error);
      },
    });
  }

  private rejectAll(error: Error): void {
    for (const entry of this.pending.values()) {
      entry.reject(error);
    }
    this.pending.clear();
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = `probe-${this.seq++}`;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.transport.write({ jsonrpc: "2.0", id, method, params });
    return promise;
  }

  notify(method: string): void {
    this.transport.write({ jsonrpc: "2.0", method });
  }

  dispose(): void {
    this.rejectAll(new Error("Probe disposed."));
    this.transport.dispose();
  }
}

// ── Probe ───────────────────────────────────────────────────────

interface CodexAppServerSession {
  client: ProbeClient;
  initResult: unknown;
}

interface RunWithCodexAppServerOptions {
  wslExecPath?: string;
  timeoutMs?: number;
  label?: string;
}

/**
 * Spawn a temporary Codex app-server, run `initialize` + `initialized`, then
 * hand the connected client to `fn`. Tears the process down on success or
 * failure. Returns `undefined` on any failure (spawn error, init timeout,
 * exception thrown by `fn`).
 */
async function runWithCodexAppServer<T>(
  location: ProjectLocation,
  options: RunWithCodexAppServerOptions | undefined,
  fn: (session: CodexAppServerSession) => Promise<T>,
): Promise<T | undefined> {
  const timeoutMs = options?.timeoutMs ?? 12_000;
  const tag = options?.label ? `[codex-probe:${options.label}]` : "[codex-probe]";
  let appServer: ChildProcess | undefined;
  let client: ProbeClient | undefined;

  try {
    const wslNodePath =
      location.kind === "wsl" ? (await resolveNodeForDistro(location.distro)).nodePath : undefined;
    const cmd = buildCodexAppServerCommand(location, {
      ...(options?.wslExecPath !== undefined ? { wslExecPath: options.wslExecPath } : {}),
      ...(wslNodePath !== undefined ? { wslNodePath } : {}),
    });
    const spawnCwd = resolveProbeSpawnCwd(location, cmd.cwd);

    appServer = spawn(cmd.command, cmd.args, {
      cwd: spawnCwd ?? undefined,
      env: { ...process.env, ...cmd.env, TERM: "xterm-256color" },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });
    const transport = new CodexStdioTransport(appServer);

    const spawnError = await new Promise<Error | undefined>((resolve) => {
      appServer!.once("error", (err) => resolve(err));
      setImmediate(() => resolve(undefined));
    });
    if (spawnError) {
      console.log("%s failed to spawn: %s", tag, spawnError.message);
      return undefined;
    }
    if (appServer.exitCode !== null) {
      console.log("%s exited before probe:%s", tag, transport.formatOutput());
      return undefined;
    }

    return await Promise.race([
      (async () => {
        client = new ProbeClient(transport);
        const initResult = await client.request("initialize", {
          clientInfo: { name: "lightcode-probe", version: "0.1.0" },
          capabilities: { experimentalApi: true },
        });
        client.notify("initialized");
        return await fn({ client, initResult });
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Codex probe timed out")), timeoutMs),
      ),
    ]);
  } catch (err) {
    console.log("%s failed: %s", tag, err instanceof Error ? err.message : err);
    return undefined;
  } finally {
    client?.dispose();
    if (appServer && !appServer.killed) {
      terminateChildProcessTree(appServer);
    }
  }
}

function extractCodexAccountInfo(rawResponse: unknown): CodexAccountInfo | undefined {
  if (!rawResponse || typeof rawResponse !== "object") return undefined;
  const account = (rawResponse as { account?: unknown }).account;
  if (!account || typeof account !== "object") return undefined;
  const accountObj = account as Record<string, unknown>;
  const type = typeof accountObj.type === "string" ? accountObj.type : undefined;
  const email = typeof accountObj.email === "string" ? accountObj.email.trim() : undefined;
  const planType = typeof accountObj.planType === "string" ? accountObj.planType.trim() : undefined;
  if (!type && !email && !planType) return undefined;
  return {
    ...(type ? { type } : {}),
    ...(email ? { email } : {}),
    ...(planType ? { planType } : {}),
  };
}

/**
 * Spawn a temporary Codex app-server, query `account/read`, then kill it.
 * Returns the (typed but loosely-validated) account info, or `undefined` on
 * any failure.
 */
export async function probeCodexAccount(
  location: ProjectLocation,
  options?: RunWithCodexAppServerOptions,
): Promise<CodexAccountInfo | undefined> {
  return runWithCodexAppServer(
    location,
    { ...options, label: options?.label ?? "account" },
    async ({ client }) => {
      const response = await client.request("account/read", {});
      return extractCodexAccountInfo(response);
    },
  );
}

/**
 * Spawn a temporary Codex app-server, discover its capabilities,
 * then kill it.
 *
 * Returns `undefined` on any failure (timeout, auth issues,
 * missing CLI, etc.).
 */
export async function probeCodexCapabilities(
  location: ProjectLocation,
  options?: { wslExecPath?: string; timeoutMs?: number; label?: string },
): Promise<CodexProbeResult | undefined> {
  const result = await runWithCodexAppServer(location, options, async ({ client, initResult }) => {
    const [modelResult, requirementsResult] = await Promise.all([
      client.request("model/list", { includeHidden: false }),
      client.request("configRequirements/read", {}).catch((error) => {
        console.warn("[codex] configRequirements/read failed:", error);
        return undefined;
      }),
    ]);
    return { initResult, modelResult, requirementsResult };
  });

  if (!result) return undefined;

  const probeResult: CodexProbeResult = {};

  const initCommands = readCodexInitCommands(result.initResult);
  if (initCommands.length > 0) {
    probeResult.slashCommands = mapCodexSlashCommands(initCommands);
  }

  const modelData =
    result.modelResult && typeof result.modelResult === "object" && "data" in result.modelResult
      ? (result.modelResult as { data: CodexModelEntry[] }).data
      : undefined;

  if (modelData?.length) {
    Object.assign(probeResult, mapCodexModels(modelData));
  }

  const requirements =
    result.requirementsResult &&
    typeof result.requirementsResult === "object" &&
    "requirements" in result.requirementsResult
      ? (result.requirementsResult as { requirements: CodexConfigRequirements | null }).requirements
      : undefined;

  Object.assign(probeResult, mapCodexRequirements(requirements));

  return probeResult;
}
