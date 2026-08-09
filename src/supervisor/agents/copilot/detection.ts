import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { AgentCapability, ProjectLocation } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import {
  dedupeAcpAuthMethods,
  probeAcpCapabilities,
  readUnstableSessionModels,
  setUnstableSessionModel,
  type AcpProbeResult,
} from "../acp";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  envVarAuthProbe,
  readCommandOutputAsync,
  resolveExecutablePathAsync,
  type AuthProbe,
  type CapabilitiesProbeResult,
  type DetectionSpec,
} from "../base";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";

export const copilotDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: ["low", "medium", "high", "xhigh"],
  defaultEffort: "high",
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default Approvals" },
    { id: "never", label: "Bypass Approvals" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  requiresTerminalFocusBeforeInput: true,
  defaultApprovalPolicy: "never",
  bypassPermissions: { approvalPolicy: "never" },
  settingDefs: [],
};

const COPILOT_MODEL_EFFORT_PROBE_TIMEOUT_MS = 15_000;

export function buildCopilotCommand(
  location: ProjectLocation,
  args: string[],
  wslExecPath?: string,
) {
  return buildAgentCommand(location, "copilot", args, wslExecPath);
}

/**
 * Copilot accepts `gh` CLI auth as equivalent to env-var auth.
 * WSL: one batched command inside the distro. Native: check that `gh` is on
 * PATH then query its `auth status`.
 */
const ghAuthProbe: AuthProbe = async (ctx) => {
  if (ctx.location.kind === "wsl") {
    const [result] = await batchWslCommandsAsync(
      ctx.location.distro,
      ["command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && echo yes"],
      ctx.signal,
    );
    return result?.ok && result.stdout.trim() === "yes" ? "authenticated" : "unknown";
  }
  const ghPath = await resolveExecutablePathAsync("gh");
  if (!ghPath) return "unknown";
  const result = await readCommandOutputAsync(ghPath, ["auth", "status"], {
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
  return result.ok ? "authenticated" : "unknown";
};

async function probeCopilotModelEfforts(
  location: ProjectLocation,
  executablePath: string | undefined,
  models: { id: string }[],
  signal?: AbortSignal,
): Promise<{ defaultEffort?: string; modelEfforts?: Record<string, string[]> }> {
  if (signal?.aborted) return {};
  const spec = buildCopilotCommand(location, ["--acp", "--stdio"], executablePath);
  const sessionCwd = getAgentProbeCwd(location);
  const spawnCwd = resolveProbeSpawnCwd(location, spec.cwd);
  const ownedProcessGroup = process.platform !== "win32";
  const child = spawn(spec.command, spec.args, {
    ...(spawnCwd ? { cwd: spawnCwd } : {}),
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
    detached: ownedProcessGroup,
  });
  child.on("error", (err) => {
    console.log("[copilot-probe] spawn error:", err.message);
  });

  const updates: unknown[] = [];
  const stream = ndJsonStream(
    Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
  );
  const connection = new ClientSideConnection(
    () => ({
      requestPermission: () => Promise.resolve({ outcome: { outcome: "cancelled" as const } }),
      sessionUpdate: (params) => {
        updates.push(params.update);
        return Promise.resolve();
      },
    }),
    stream,
  );

  let timeout: NodeJS.Timeout | undefined;
  let abortProbe: (() => void) | undefined;
  const stop = () => {
    try {
      child.stdin?.destroy();
    } catch {
      // Ignore cleanup races.
    }
    terminateChildProcessTree(child, { ownedProcessGroup });
  };

  try {
    const runProbe = async () => {
      await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "poracode-probe", version: "0.1.0" },
        clientCapabilities: {},
      });
      const session = await connection.newSession({ cwd: sessionCwd, mcpServers: [] });

      const baseUpdate = session.configOptions
        ? { sessionUpdate: "config_option_update", configOptions: session.configOptions }
        : undefined;

      function extractThoughtLevelConfig(update: unknown):
        | {
            currentValue?: string;
            options: string[];
          }
        | undefined {
        if (!update || typeof update !== "object" || !("configOptions" in update)) {
          return undefined;
        }
        const configOptions = (update as { configOptions?: unknown }).configOptions;
        if (!Array.isArray(configOptions)) {
          return undefined;
        }
        const thoughtLevel = configOptions.find((candidate) => {
          if (typeof candidate !== "object" || candidate === null) {
            return false;
          }
          const option = candidate as {
            category?: string;
            currentValue?: string;
            options?: unknown;
          };
          return option.category === "thought_level";
        }) as
          | {
              currentValue?: string;
              options?: Array<{ value?: string }> | Array<{ options?: Array<{ value?: string }> }>;
            }
          | undefined;
        if (!thoughtLevel) {
          return undefined;
        }
        const flattened = (Array.isArray(thoughtLevel.options) ? thoughtLevel.options : []).flatMap(
          (entry) => {
            if (typeof entry !== "object" || entry === null) {
              return [];
            }
            if ("value" in entry) {
              return [entry as { value?: string }];
            }
            if ("options" in entry && Array.isArray((entry as { options?: unknown }).options)) {
              return (entry as { options: Array<{ value?: string }> }).options;
            }
            return [];
          },
        );
        const options = flattened
          .map((entry) => entry.value)
          .filter((value): value is string => typeof value === "string" && value.length > 0);
        return {
          options,
          ...(thoughtLevel.currentValue ? { currentValue: thoughtLevel.currentValue } : {}),
        };
      }

      const initialThoughtLevel = baseUpdate ? extractThoughtLevelConfig(baseUpdate) : undefined;
      const modelEfforts: Record<string, string[]> = {};
      const defaultEffort = initialThoughtLevel?.currentValue;

      // Unstable pre-1.0 model state (see unstableModelCompat.ts) — the SDK no
      // longer types the `models` field on the session response.
      const sessionModels = readUnstableSessionModels(session);
      if (sessionModels?.currentModelId && initialThoughtLevel?.options.length) {
        modelEfforts[sessionModels.currentModelId] = initialThoughtLevel.options;
      }

      for (const model of models) {
        try {
          updates.length = 0;
          await setUnstableSessionModel(connection, {
            sessionId: session.sessionId,
            modelId: model.id,
          });
          await new Promise((resolve) => setTimeout(resolve, 300));
          const update = updates
            .filter(
              (entry) =>
                typeof entry === "object" &&
                entry !== null &&
                "sessionUpdate" in entry &&
                (entry as { sessionUpdate?: string }).sessionUpdate === "config_option_update",
            )
            .at(-1);
          const thoughtLevel = extractThoughtLevelConfig(update);
          if (!thoughtLevel || thoughtLevel.options.length === 0) {
            continue;
          }
          modelEfforts[model.id] = thoughtLevel.options;
        } catch (err) {
          console.log(
            `[copilot-probe] model effort probe failed at ${model.id}:`,
            err instanceof Error ? err.message : err,
          );
          break;
        }
      }

      return {
        ...(defaultEffort ? { defaultEffort } : {}),
        ...(Object.keys(modelEfforts).length > 0 ? { modelEfforts } : {}),
      };
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        stop();
        reject(new Error("Copilot model-effort probe timed out"));
      }, COPILOT_MODEL_EFFORT_PROBE_TIMEOUT_MS);
      if (typeof timeout.unref === "function") timeout.unref();
    });
    const abortPromise = signal
      ? new Promise<never>((_, reject) => {
          abortProbe = () => {
            stop();
            reject(new Error("Copilot model-effort probe aborted"));
          };
          signal.addEventListener("abort", abortProbe, { once: true });
          if (signal.aborted) abortProbe();
        })
      : undefined;
    return await Promise.race([
      runProbe(),
      timeoutPromise,
      ...(abortPromise ? [abortPromise] : []),
    ]);
  } catch {
    return {};
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortProbe) signal?.removeEventListener("abort", abortProbe);
    try {
      stop();
    } catch {
      // Ignore cleanup races.
    }
  }
}

function readCopilotUsageRate(metadata: Record<string, unknown> | undefined): string | undefined {
  const usage = metadata?.copilotUsage;
  return typeof usage === "string" && /^\d+(?:\.\d+)?x$/iu.test(usage.trim())
    ? usage.trim()
    : undefined;
}

function withCopilotModelRates(
  models: NonNullable<AgentCapability["models"]>,
  metadataByModelId: AcpProbeResult["modelMetadata"],
): NonNullable<AgentCapability["models"]> {
  return models.map((model) => {
    const usageRate = readCopilotUsageRate(metadataByModelId?.[model.id]);
    return usageRate ? { ...model, description: usageRate } : model;
  });
}

async function probeCapabilities(
  location: ProjectLocation,
  executablePath?: string,
  signal?: AbortSignal,
): Promise<CapabilitiesProbeResult> {
  const spec = buildCopilotCommand(location, ["--acp", "--stdio"], executablePath);
  const sessionCwd = getAgentProbeCwd(location);
  const processCwd = resolveProbeSpawnCwd(location, spec.cwd);
  const probe = await probeAcpCapabilities(spec.command, spec.args, sessionCwd, {
    ...(processCwd ? { processCwd } : {}),
    timeoutMs: 15_000,
    label: location.kind === "wsl" ? `copilot:wsl:${location.distro}` : `copilot:${location.kind}`,
    ...(signal ? { signal } : {}),
  });

  const modelEffortProbe =
    probe?.models?.length && executablePath !== undefined
      ? await probeCopilotModelEfforts(location, executablePath, probe.models, signal)
      : {};

  // Merge probe approval policies with defaults (probe labels take precedence,
  // new probe-only entries are appended). This is needed because Copilot's ACP
  // only exposes autopilot as a session mode — Default/Bypass are CLI-only flags.
  const mergedPolicies = new Map(copilotDefaultCapabilities.approvalPolicies.map((p) => [p.id, p]));
  for (const policy of probe?.approvalPolicies ?? []) {
    mergedPolicies.set(policy.id, policy);
  }

  const dedupedAuthMethods = probe?.authMethods?.length
    ? dedupeAcpAuthMethods(probe.authMethods)
    : undefined;

  return {
    ...copilotDefaultCapabilities,
    ...(probe?.models?.length
      ? { models: withCopilotModelRates(probe.models, probe.modelMetadata) }
      : {}),
    ...(probe?.efforts?.length ? { efforts: probe.efforts } : {}),
    ...((modelEffortProbe.defaultEffort ?? probe?.defaultEffort)
      ? { defaultEffort: modelEffortProbe.defaultEffort ?? probe?.defaultEffort }
      : {}),
    ...(modelEffortProbe.modelEfforts ? { modelEfforts: modelEffortProbe.modelEfforts } : {}),
    ...(probe?.modes?.length ? { modes: probe.modes } : {}),
    ...(probe?.slashCommands?.length ? { slashCommands: probe.slashCommands } : {}),
    approvalPolicies: [...mergedPolicies.values()],
    ...(dedupedAuthMethods?.length ? { authMethods: dedupedAuthMethods } : {}),
    ...(probe?.authLogoutSupported ? { authLogoutSupported: true } : {}),
    ...(probe?.authState ? { authState: probe.authState } : {}),
  };
}

export const copilotDetectionSpec: DetectionSpec = {
  kind: "copilot",
  label: "GitHub Copilot",
  binary: "copilot",
  loginCommand: "copilot login",
  capabilities: copilotDefaultCapabilities,
  update: {
    builtIn: { binary: "copilot", args: ["update"] },
    npm: "@github/copilot",
    homebrewCask: "copilot-cli",
    winget: "GitHub.Copilot",
  },
  authProbes: [envVarAuthProbe(["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]), ghAuthProbe],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    return probeCapabilities(ctx.location, ctx.executablePath, ctx.signal);
  },
};
