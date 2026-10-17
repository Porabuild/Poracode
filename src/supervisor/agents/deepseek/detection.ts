import type { AgentCapability } from "@/shared/contracts";
import {
  DEEPSEEK_ACCOUNT_FLASH_MODEL_ID,
  DEEPSEEK_OFFICIAL_FLASH_MODEL_ID,
} from "@/shared/agents/deepseekModels";
import { humanizeModelId, probeAcpCapabilities, type AcpProbeResult } from "../acp";
import { type CapabilitiesProbeResult, type DetectionSpec } from "../base";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";
import { probeDeepSeekAuth } from "./auth";
import { buildDeepSeekCommand } from "./argv";

export const deepSeekDefaultCapabilities: AgentCapability = {
  models: [{ id: DEEPSEEK_OFFICIAL_FLASH_MODEL_ID, label: "DeepSeek V4.1 Flash" }],
  efforts: [],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [
    { id: "default", label: "Ask Permissions" },
    { id: "never", label: "Bypass Permissions" },
  ],
  defaultApprovalPolicy: "never",
  bypassPermissions: { approvalPolicy: "never" },
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  // ACP fixes its image admission capability from the profile's initial
  // route. Later model choices can differ, so let the selected model read
  // attached files with its own tools instead of sending rejected ACP images.
  readsImageAttachmentsFromHost: false,
  liveInputMode: "server",
  presentationMode: "gui",
  presentationModes: ["gui"],
  mcpScope: { gui: "launch" },
  settingDefs: [],
};

export function buildDeepSeekProbeCapabilities(
  probe: AcpProbeResult | undefined,
): CapabilitiesProbeResult {
  const models = probe?.models ?? [];
  // ACP inserts its initial route even when that route has no credentials.
  // Prefer a discovered Account route after browser login; API-key-only
  // profiles fall back to the current official catalog model.
  const preferred =
    models.find((model) => model.id === DEEPSEEK_ACCOUNT_FLASH_MODEL_ID) ??
    models.find((model) => probe?.modelSubProvider?.[model.id] === "deepseek-account") ??
    models.find((model) => model.id === DEEPSEEK_OFFICIAL_FLASH_MODEL_ID) ??
    models.find((model) => model.id !== '["deepseek-official","deepseek-v4-flash"]');
  const orderedModels = preferred
    ? [preferred, ...models.filter((model) => model !== preferred)]
    : models;
  return {
    ...(orderedModels?.length
      ? {
          models: orderedModels.map((model) => ({
            ...model,
            label: /^deepseek-/i.test(model.label)
              ? humanizeModelId(model.label).replace(/^Deepseek\b/, "DeepSeek")
              : model.label,
          })),
        }
      : {}),
    ...(probe?.subProviders ? { subProviders: probe.subProviders } : {}),
    ...(probe?.modelSubProvider ? { modelSubProvider: probe.modelSubProvider } : {}),
    ...(probe?.efforts ? { efforts: probe.efforts } : {}),
    ...(probe?.defaultEffort ? { defaultEffort: probe.defaultEffort } : {}),
    ...(probe?.modelEfforts ? { modelEfforts: probe.modelEfforts } : {}),
    ...(probe?.modelDefaultEfforts ? { modelDefaultEfforts: probe.modelDefaultEfforts } : {}),
    ...(probe?.thinkingModels ? { thinkingModels: probe.thinkingModels } : {}),
    ...(probe?.supportsResume !== undefined ? { supportsResume: probe.supportsResume } : {}),
    // Authentication and route setup belong to Harness's browser settings,
    // not ACP authenticate (which always succeeds without checking a key).
    authMethods: [{ id: "deepseek-web-setup", name: "Login", type: "terminal" }],
    preferTerminalLogin: true,
  };
}

const installNext = { binary: "npm", args: ["install", "-g", "@deepseek-ai/dsh@next"] };

export const deepSeekDetectionSpec: DetectionSpec = {
  kind: "deepseek",
  label: "DeepSeek Harness",
  binary: "dsh",
  versionArgs: ["--version"],
  loginCommand: "dsh web --port 0",
  capabilities: deepSeekDefaultCapabilities,
  // The npm resolver always installs @latest, which currently predates ACP
  // persistence/config options. Use the existing installer/version-URL seam
  // to keep installs, updates, and their previews on the next release channel.
  update: {
    installer: { posix: installNext, windows: installNext },
    latestVersionUrls: ["https://registry.npmjs.org/%40deepseek-ai%2Fdsh/next"],
  },
  authProbes: [probeDeepSeekAuth],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    const command = buildDeepSeekCommand(ctx.location, ctx.executablePath);
    const processCwd = resolveProbeSpawnCwd(ctx.location, command.cwd);
    const probe = await probeAcpCapabilities(
      command.command,
      command.args,
      getAgentProbeCwd(ctx.location),
      {
        ...(processCwd ? { processCwd } : {}),
        ...(command.env ? { env: command.env } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        preserveEmptyModelEfforts: true,
        timeoutMs: 25_000,
        label: `deepseek:${ctx.location.kind}`,
      },
    );
    return buildDeepSeekProbeCapabilities(probe);
  },
};
