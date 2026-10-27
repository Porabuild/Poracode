import type { AgentTerminalAuthMethod } from "@/shared/contracts";
import { type CapabilitiesProbeResult, type DetectProbeCtx, readAgentCommandOutput } from "../base";
import { getAgentProbeCwd } from "../probeCwd";
import { commandCodeSupportsAcp, probeCommandCodeAcp } from "./acp";
import {
  buildCommandCodeModelPickerCapabilities,
  createCommandCodeEffortProbeCache,
  createCommandCodeModelNameLoader,
  parseCommandCodeModels,
} from "./models";

const COMMANDCODE_EFFORT_PROBE_VALUE = "__poracode_capability_probe__";

const COMMANDCODE_TERMINAL_AUTH: AgentTerminalAuthMethod = {
  id: "commandcode-terminal-login",
  name: "Login",
  type: "terminal",
  // No `env` needed: `detectAgentInstall` merges `baseSpawnEnv` into every
  // terminal auth method as it assembles the status.
};

const readCachedCommandCodeModelEfforts = createCommandCodeEffortProbeCache();
const loadCommandCodeModelNames = createCommandCodeModelNameLoader();

async function probeCommandCodeModelEfforts(
  ctx: DetectProbeCtx & { executablePath: string },
  modelsOutput: string,
  modelIds: readonly string[],
): Promise<Record<string, string[]>> {
  const cacheKey = JSON.stringify([ctx.location, ctx.executablePath, ctx.version, modelsOutput]);
  return readCachedCommandCodeModelEfforts(cacheKey, modelIds, async (modelId) => {
    const probe = await readAgentCommandOutput(
      ctx.location,
      ctx.executablePath,
      [
        "--model",
        modelId,
        "--effort",
        COMMANDCODE_EFFORT_PROBE_VALUE,
        "--no-session",
        "-p",
        "capability probe",
      ],
      {
        timeoutMs: 4_000,
        wslLinuxCwd: "/tmp",
        posixCwd: getAgentProbeCwd(ctx.location),
        ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
    ).catch(() => undefined);
    return probe ? `${probe.stdout}\n${probe.stderr}` : "";
  });
}

export async function probeCommandCodeCapabilities(
  ctx: DetectProbeCtx,
): Promise<CapabilitiesProbeResult | undefined> {
  if (!ctx.executablePath) return undefined;
  const supportsAcp = commandCodeSupportsAcp(ctx.version);
  const acpPromise = supportsAcp
    ? probeCommandCodeAcp({ ...ctx, executablePath: ctx.executablePath })
    : Promise.resolve(undefined);
  const result = await readAgentCommandOutput(ctx.location, ctx.executablePath, ["--list-models"], {
    timeoutMs: 8_000,
    wslLinuxCwd: "/tmp",
    posixCwd: getAgentProbeCwd(ctx.location),
    // Suppress the CLI's background self-updater (ctx.probeEnv is the
    // shared `baseSpawnEnv` + `probeEnv` merge from detectAgentInstall).
    ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  }).catch((error) => {
    console.warn("[commandcode] model list probe failed:", error);
    return undefined;
  });
  const parsed = result?.ok ? parseCommandCodeModels(result.stdout) : [];
  const modelNamesPromise =
    parsed.length > 0 ? loadCommandCodeModelNames(ctx.signal) : Promise.resolve({});
  const executablePath = ctx.executablePath;
  const modelEffortsPromise = acpPromise.then(async (acp) => {
    // --list-models prints lower-case IDs; the native catalog owns GUI casing.
    const acpEffortsById = new Map(
      Object.entries(acp?.modelEfforts ?? {}).map(([id, efforts]) => [id.toLowerCase(), efforts]),
    );
    const terminalAcpEfforts = Object.fromEntries(
      parsed.flatMap(({ id }) => {
        const efforts = acpEffortsById.get(id.toLowerCase());
        return efforts ? [[id, efforts]] : [];
      }),
    );
    const unprobedModelIds = parsed.map(({ id }) => id).filter((id) => !(id in terminalAcpEfforts));
    const fallback =
      unprobedModelIds.length > 0
        ? await probeCommandCodeModelEfforts(
            { ...ctx, executablePath },
            result?.stdout ?? "",
            unprobedModelIds,
          )
        : {};
    return { ...terminalAcpEfforts, ...fallback };
  });
  // Observe cancellation immediately without making independent effort
  // discovery wait for display-name HTTP loading.
  const [acp, modelNames, modelEfforts] = await Promise.all([
    acpPromise,
    modelNamesPromise,
    modelEffortsPromise,
  ]);
  const nativeModelEfforts = { ...acp?.modelEfforts };
  for (const { id } of acp?.models ?? []) {
    const fallback = modelEfforts[id.toLowerCase()];
    if (!(id in nativeModelEfforts) && fallback !== undefined) nativeModelEfforts[id] = fallback;
  }
  const modelCapabilities =
    parsed.length > 0
      ? buildCommandCodeModelPickerCapabilities(parsed, modelEfforts, modelNames)
      : undefined;
  return {
    authMethods: [COMMANDCODE_TERMINAL_AUTH],
    preferTerminalLogin: true,
    ...(acp?.authState ? { authState: acp.authState } : {}),
    ...modelCapabilities,
    // Models found only by the terminal effort probe declare no default; their
    // ladders start at "low". ACP model defaults still take precedence.
    defaultEffort: "medium",
    reportsSkillCatalog: supportsAcp,
    presentationModes: supportsAcp ? ["terminal", "gui"] : ["terminal"],
    mcpScope: { terminal: "launch", gui: supportsAcp ? "launch" : "none" },
    ...(supportsAcp
      ? {
          presentationCapabilities: {
            gui: {
              presentationMode: "gui",
              liveInputMode: "server",
              ...(acp?.approvalPolicies?.length ? { approvalPolicies: acp.approvalPolicies } : {}),
              defaultApprovalPolicy: "bypass",
              bypassPermissions: { approvalPolicy: "bypass" },
              ...(acp?.supportsResume !== undefined ? { supportsResume: acp.supportsResume } : {}),
              ...(acp?.models?.length ? { models: acp.models } : {}),
              // Efforts are model-scoped; an unprobed model must not inherit
              // the probe session's effort ladder from another model.
              efforts: [],
              modelEfforts: nativeModelEfforts,
              ...(acp?.modelDefaultEfforts ? { modelDefaultEfforts: acp.modelDefaultEfforts } : {}),
              ...(acp?.slashCommands ? { slashCommands: acp.slashCommands } : {}),
            },
          },
        }
      : {}),
  };
}
