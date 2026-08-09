import type { AgentCapability, AgentTerminalAuthMethod, ProjectLocation } from "@/shared/contracts";
import { QWEN_RETIRED_PREVIEW_MODEL_ID } from "@/shared/agents/qwenModels";
import { humanizeModelId, probeAcpCapabilities, type AcpProbeResult } from "../acp";
import {
  buildAgentCommand,
  envVarAuthProbe,
  type CapabilitiesProbeResult,
  type DetectionSpec,
} from "../base";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";
import { QWEN_DEFAULT_MODEL_ID } from "./argv";

export const qwenDefaultCapabilities: AgentCapability = {
  models: [{ id: QWEN_DEFAULT_MODEL_ID, label: "Qwen3.8 Max" }],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Ask Permissions" },
    { id: "auto-edit", label: "Auto-edit" },
    { id: "auto", label: "Auto" },
    { id: "never", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "auto",
  bypassPermissions: { approvalPolicy: "never" },
  mcpScope: { terminal: "none", gui: "launch" },
  settingDefs: [],
};

export function buildQwenCommand(
  location: ProjectLocation,
  args: string[],
  executablePath?: string,
) {
  return buildAgentCommand(location, "qwen", args, executablePath);
}

const terminalAuthMethod: AgentTerminalAuthMethod = {
  id: "qwen-terminal-login",
  name: "Login",
  type: "terminal",
};

export const QWEN_AUTH_ENV_KEYS = [
  "BAILIAN_CODING_PLAN_API_KEY",
  "BAILIAN_TOKEN_PLAN_API_KEY",
  "ALIBABA_CODING_PLAN_API_KEY",
  "ALIBABA_QWEN_API_KEY",
  "DASHSCOPE_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

const MODEL_PROVIDER_TAG_RE = /^\[([^\]]+)\]\s*/u;
const MODEL_PROVIDER_SUFFIX_RE = /\((openai|qwen-oauth)\)$/u;
const QWEN_MODEL_LABELS: Readonly<Record<string, string>> = {
  "coder-model": "Coder Model",
  "qwen3.8-max": "Qwen3.8 Max",
  "glm-5.2": "GLM 5.2",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "qwen3.5-plus": "Qwen3.5 Plus",
  "qwen3.6-plus": "Qwen3.6 Plus",
  "qwen3.7-plus": "Qwen3.7 Plus",
  "glm-5": "GLM 5",
  "kimi-k2.5": "Kimi K2.5",
  "MiniMax-M2.5": "MiniMax M2.5",
  "qwen3-coder-plus": "Qwen3 Coder Plus",
  "qwen3-coder-next": "Qwen3 Coder Next",
  "qwen3-max-2026-01-23": "Qwen3 Max 2026-01-23",
  "glm-4.7": "GLM 4.7",
};

const QWEN_SUBPROVIDER_LABELS: Readonly<Record<string, string>> = {
  "ModelStudio Coding Plan for Global/Intl": "Alibaba Token Plan",
};

function subProviderId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function normalizeQwenModel(model: NonNullable<AcpProbeResult["models"]>[number]): {
  model: NonNullable<AcpProbeResult["models"]>[number];
  subProvider?: { id: string; label: string };
} {
  const providerSuffix = MODEL_PROVIDER_SUFFIX_RE.exec(model.id)?.[1];
  const id = model.id.replace(MODEL_PROVIDER_SUFFIX_RE, "");
  const providerLabel = MODEL_PROVIDER_TAG_RE.exec(model.label)?.[1]?.trim();
  const rawLabel = model.label.replace(MODEL_PROVIDER_TAG_RE, "").trim();
  const label =
    QWEN_MODEL_LABELS[id] ??
    (rawLabel === id || rawLabel.length === 0 ? humanizeModelId(id) : rawLabel);
  const fallbackProviderLabel =
    providerSuffix === "qwen-oauth"
      ? "Qwen OAuth"
      : providerSuffix === "openai"
        ? "OpenAI-compatible"
        : undefined;
  const resolvedProviderLabel =
    (providerLabel ? (QWEN_SUBPROVIDER_LABELS[providerLabel] ?? providerLabel) : undefined) ??
    fallbackProviderLabel;
  return {
    model: { ...model, id, label },
    ...(resolvedProviderLabel
      ? {
          subProvider: {
            id: subProviderId(resolvedProviderLabel),
            label: resolvedProviderLabel,
          },
        }
      : {}),
  };
}

function withoutRetiredPreview<T>(values: Record<string, T> | undefined): Record<string, T> {
  return Object.fromEntries(
    Object.entries(values ?? {}).filter(
      ([modelId]) =>
        modelId.replace(MODEL_PROVIDER_SUFFIX_RE, "") !== QWEN_RETIRED_PREVIEW_MODEL_ID,
    ),
  );
}

export function buildQwenProbeCapabilities(
  probe: AcpProbeResult | undefined,
): CapabilitiesProbeResult {
  const normalizedModels = (probe?.models ?? [])
    .map(normalizeQwenModel)
    .filter((entry) => entry.model.id !== QWEN_RETIRED_PREVIEW_MODEL_ID);
  const probedModels = normalizedModels.map((entry) => entry.model);
  const defaultModel = probedModels.find((model) => model.id === QWEN_DEFAULT_MODEL_ID) ?? {
    id: QWEN_DEFAULT_MODEL_ID,
    label: "Qwen3.8 Max",
  };
  const models = [
    defaultModel,
    ...probedModels.filter((model) => model.id !== QWEN_DEFAULT_MODEL_ID),
  ];
  const subProviderByModelId = new Map<string, { id: string; label: string }>();
  const modelSubProvider: Record<string, string> = {};
  for (const { model, subProvider } of normalizedModels) {
    if (!subProvider) continue;
    subProviderByModelId.set(model.id, subProvider);
    modelSubProvider[model.id] = subProvider.id;
  }
  const subProviders = new Map<string, { id: string; label: string }>();
  for (const model of models) {
    const subProvider = subProviderByModelId.get(model.id);
    if (subProvider) subProviders.set(subProvider.id, subProvider);
  }
  const contextTokens = new Map<string, number>();
  for (const [modelId, metadata] of Object.entries(probe?.modelMetadata ?? {})) {
    const normalizedModelId = modelId.replace(MODEL_PROVIDER_SUFFIX_RE, "");
    if (normalizedModelId === QWEN_RETIRED_PREVIEW_MODEL_ID) continue;
    const contextLimit = metadata.contextLimit;
    if (typeof contextLimit === "number" && contextLimit > 0) {
      contextTokens.set(normalizedModelId, contextLimit);
    }
  }
  const modelEfforts = withoutRetiredPreview(probe?.modelEfforts);
  const modelDefaultEfforts = withoutRetiredPreview(probe?.modelDefaultEfforts);

  return {
    ...qwenDefaultCapabilities,
    models,
    ...(subProviders.size > 0 ? { subProviders: [...subProviders.values()] } : {}),
    ...(Object.keys(modelSubProvider).length > 0 ? { modelSubProvider } : {}),
    ...(probe?.efforts?.length ? { efforts: probe.efforts } : {}),
    ...(probe?.defaultEffort ? { defaultEffort: probe.defaultEffort } : {}),
    ...(Object.keys(modelEfforts).length > 0 ? { modelEfforts } : {}),
    ...(Object.keys(modelDefaultEfforts).length > 0 ? { modelDefaultEfforts } : {}),
    modes: [...new Set([...qwenDefaultCapabilities.modes, ...(probe?.modes ?? [])])],
    ...(probe?.approvalPolicies?.length ? { approvalPolicies: probe.approvalPolicies } : {}),
    ...(probe?.slashCommands?.length ? { slashCommands: probe.slashCommands } : {}),
    ...buildContextSizeCapabilities(contextTokens),
    authMethods: [terminalAuthMethod],
    preferTerminalLogin: true,
    ...(probe?.authState ? { authState: probe.authState } : {}),
  };
}

async function probeCapabilities(
  location: ProjectLocation,
  executablePath: string,
  signal?: AbortSignal,
): Promise<CapabilitiesProbeResult> {
  const command = buildQwenCommand(location, ["--acp"], executablePath);
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  const probe = await probeAcpCapabilities(
    command.command,
    command.args,
    getAgentProbeCwd(location),
    {
      ...(processCwd ? { processCwd } : {}),
      ...(command.env ? { env: command.env } : {}),
      timeoutMs: 20_000,
      ...(signal ? { signal } : {}),
      label: location.kind === "wsl" ? `qwen:wsl:${location.distro}` : `qwen:${location.kind}`,
    },
  );
  return buildQwenProbeCapabilities(probe);
}

export const qwenDetectionSpec: DetectionSpec = {
  kind: "qwen",
  label: "Qwen Code",
  binary: "qwen",
  loginCommand: "qwen -i /auth",
  capabilities: qwenDefaultCapabilities,
  update: {
    builtIn: { binary: "qwen", args: ["update"] },
    verifyBuiltInVersionChange: true,
    npm: "@qwen-code/qwen-code",
    brew: "qwen-code",
  },
  authProbes: [envVarAuthProbe([...QWEN_AUTH_ENV_KEYS])],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    return probeCapabilities(ctx.location, ctx.executablePath, ctx.signal);
  },
};
