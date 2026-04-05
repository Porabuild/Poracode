/**
 * Lightweight Codex app-server capability probe.
 *
 * Spawns a temporary app-server, connects via WebSocket, queries
 * `model/list` and `configRequirements/read`, then kills the process.
 * Falls back gracefully on any failure.
 *
 * Provider-specific — unlike the ACP probe, this speaks the Codex
 * app-server JSON-RPC 2.0 protocol over a loopback WebSocket.
 */

import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import type { ProjectLocation } from "../../../shared/contracts";
import { buildAgentCommand, type CommandSpec } from "../base";

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
  approvalPolicies?: Array<{ id: string; label: string }>;
  sandboxModes?: Array<{ id: string; label: string }>;
}

// ── Label maps ──────────────────────────────────────────────────

/** Default approval policies when no enterprise requirements restrict the list. */
const DEFAULT_APPROVAL_POLICIES: Array<{ id: string; label: string }> = [
  { id: "on-request", label: "On Request" },
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

export function mapCodexModels(
  models: CodexModelEntry[],
): Pick<CodexProbeResult, "models" | "efforts" | "defaultEffort" | "modelEfforts"> {
  const visible = models.filter((m) => !m.hidden);
  if (visible.length === 0) return {};

  const mapped = visible.map((m) => ({
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

  // Default effort from the default model, or first model
  const defaultModel = visible.find((m) => m.isDefault) ?? visible[0]!;
  const defaultEffort = defaultModel.defaultReasoningEffort;

  // modelEfforts: only include models whose efforts differ from global list
  const globalKey = sortedEfforts.join(",");
  const modelEfforts: Record<string, string[]> = {};
  for (const [modelId, efforts] of perModelEfforts) {
    const sorted = [...efforts].sort((a, b) => (EFFORT_ORDER[a] ?? 99) - (EFFORT_ORDER[b] ?? 99));
    if (sorted.join(",") !== globalKey) {
      modelEfforts[modelId] = sorted;
    }
  }

  return {
    models: mapped,
    efforts: sortedEfforts,
    defaultEffort,
    ...(Object.keys(modelEfforts).length > 0 ? { modelEfforts } : {}),
  };
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

function buildAppServerCommand(
  location: ProjectLocation,
  remoteUrl: string,
  wslExecPath?: string,
): CommandSpec {
  const args = ["app-server", "--listen", remoteUrl, "--enable", "tui_app_server"];
  return buildAgentCommand(location, "codex", args, wslExecPath);
}

function allocateLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a loopback port.")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Minimal JSON-RPC 2.0 client over WebSocket for the probe.
 *
 * Lifetime: connect → request/notify → dispose.
 */
class ProbeClient {
  private socket: WebSocket;
  private seq = 0;
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  constructor(socket: WebSocket) {
    this.socket = socket;
    this.socket.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      if (!raw) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
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
    });
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = `probe-${this.seq++}`;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return promise;
  }

  notify(method: string): void {
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", method }));
  }

  dispose(): void {
    for (const entry of this.pending.values()) {
      entry.reject(new Error("Probe disposed."));
    }
    this.pending.clear();
    try {
      this.socket.close();
    } catch {
      // ignore
    }
  }
}

async function connectWebSocket(
  url: string,
  appServer: ChildProcess,
  maxAttempts = 30,
): Promise<WebSocket> {
  const WS = WebSocket;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (appServer.exitCode !== null) {
      throw new Error("Codex app-server exited before WebSocket could connect.");
    }

    try {
      const socket = await new Promise<WebSocket>((resolve, reject) => {
        const candidate = new WS(url);
        const handleOpen = () => {
          candidate.removeEventListener("open", handleOpen);
          candidate.removeEventListener("error", handleError);
          resolve(candidate);
        };
        const handleError = (event: Event) => {
          candidate.removeEventListener("open", handleOpen);
          candidate.removeEventListener("error", handleError);
          reject(event);
        };
        candidate.addEventListener("open", handleOpen);
        candidate.addEventListener("error", handleError);
      });
      return socket;
    } catch (error) {
      lastError = error;
      await sleep(200);
    }
  }

  throw new Error(
    `Unable to connect to Codex app-server probe.${lastError ? ` Last error: ${String(lastError)}` : ""}`,
  );
}

// ── Probe ───────────────────────────────────────────────────────

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
  const timeoutMs = options?.timeoutMs ?? 12_000;
  const tag = options?.label ? `[codex-probe:${options.label}]` : "[codex-probe]";
  let appServer: ChildProcess | undefined;
  let client: ProbeClient | undefined;

  try {
    const port = await allocateLoopbackPort();
    const remoteUrl = `ws://127.0.0.1:${port}`;
    const cmd = buildAppServerCommand(location, remoteUrl, options?.wslExecPath);

    appServer = spawn(cmd.command, cmd.args, {
      cwd: cmd.cwd ?? undefined,
      env: { ...process.env, TERM: "xterm-256color" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    // Bail early if the process fails to start
    const spawnError = await new Promise<Error | undefined>((resolve) => {
      appServer!.once("error", (err) => resolve(err));
      setImmediate(() => resolve(undefined));
    });
    if (spawnError) {
      console.log("%s failed to spawn: %s", tag, spawnError.message);
      return undefined;
    }

    // Drain stdout/stderr to avoid backpressure stalls
    appServer.stdout?.resume();
    appServer.stderr?.resume();

    const result = await Promise.race([
      (async () => {
        const socket = await connectWebSocket(remoteUrl, appServer!);
        client = new ProbeClient(socket);

        // Handshake
        await client.request("initialize", {
          clientInfo: { name: "lightcode-probe", version: "0.1.0" },
          capabilities: { experimentalApi: true },
        });
        client.notify("initialized");

        // Query models and requirements in parallel
        const [modelResult, requirementsResult] = await Promise.all([
          client.request("model/list", { includeHidden: false }),
          client.request("configRequirements/read", {}).catch(() => undefined),
        ]);

        return { modelResult, requirementsResult };
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Codex probe timed out")), timeoutMs),
      ),
    ]);

    // Map model/list response
    const probeResult: CodexProbeResult = {};

    const modelData =
      result.modelResult && typeof result.modelResult === "object" && "data" in result.modelResult
        ? (result.modelResult as { data: CodexModelEntry[] }).data
        : undefined;

    if (modelData?.length) {
      console.log(
        "%s raw model/list (%d entries):\n%s",
        tag,
        modelData.length,
        JSON.stringify(
          modelData.map((m) => ({
            id: m.id,
            model: m.model,
            displayName: m.displayName,
            hidden: m.hidden,
            isDefault: m.isDefault,
            defaultReasoningEffort: m.defaultReasoningEffort,
            supportedReasoningEfforts: m.supportedReasoningEfforts,
          })),
          null,
          2,
        ),
      );
      Object.assign(probeResult, mapCodexModels(modelData));
    }

    // Map configRequirements/read response
    const requirements =
      result.requirementsResult &&
      typeof result.requirementsResult === "object" &&
      "requirements" in result.requirementsResult
        ? (result.requirementsResult as { requirements: CodexConfigRequirements | null })
            .requirements
        : undefined;

    console.log(
      "%s raw configRequirements/read: %s",
      tag,
      JSON.stringify(result.requirementsResult, null, 2),
    );

    Object.assign(probeResult, mapCodexRequirements(requirements));

    console.log(
      "%s success — models: %d, efforts: %s, defaultEffort: %s, modelEfforts: %d, approvalPolicies: %s, sandboxModes: %s",
      tag,
      probeResult.models?.length ?? 0,
      probeResult.efforts?.join(", ") ?? "(default)",
      probeResult.defaultEffort ?? "(default)",
      probeResult.modelEfforts ? Object.keys(probeResult.modelEfforts).length : 0,
      probeResult.approvalPolicies?.map((p) => p.id).join(", ") ?? "(default)",
      probeResult.sandboxModes?.map((m) => m.id).join(", ") ?? "(default)",
    );

    return probeResult;
  } catch (err) {
    console.log("%s failed: %s", tag, err instanceof Error ? err.message : err);
    return undefined;
  } finally {
    client?.dispose();
    if (appServer && !appServer.killed) {
      appServer.kill();
    }
  }
}
