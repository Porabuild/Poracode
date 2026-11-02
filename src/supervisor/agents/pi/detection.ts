import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentCapability, AgentProviderMetadata, ProjectLocation } from "@/shared/contracts";
import { formatCursorBaseModelLabel } from "@/shared/modelLabels";
import {
  batchWslCommandsAsync,
  envVarAuthProbe,
  readAgentCommandOutput,
  type AuthProbe,
  type CapabilitiesProbeResult,
  type DetectionSpec,
} from "../base";
import { PI_THINKING_LEVELS, splitPiModelId } from "./argv";

const PI_AUTH_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "XAI_API_KEY",
] as const;

function nativeAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
}

export function nativePiAuthPath(): string {
  return join(nativeAgentDir(), "auth.json");
}

function nativeAuthProviders(): string[] {
  try {
    const parsed = JSON.parse(readFileSync(nativePiAuthPath(), "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? Object.keys(parsed) : [];
  } catch {
    return [];
  }
}

const piAuthFileProbe: AuthProbe = async (ctx) => {
  if (ctx.location.kind === "wsl") {
    const [result] = await batchWslCommandsAsync(
      ctx.location.distro,
      ['test -s "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/auth.json"'],
      ctx.signal,
    );
    return result?.ok ? "authenticated" : "missing";
  }
  return existsSync(nativePiAuthPath()) && nativeAuthProviders().length > 0
    ? "authenticated"
    : "missing";
};

export const piDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  // Reasoning ladders list "off" first; start them thinking at a moderate tier.
  defaultEffort: "medium",
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsTextOnlyOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "never",
  bypassPermissions: { approvalPolicy: "never" },
  mcpScope: { terminal: "launch", gui: "launch" },
  settingDefs: [],
};

export interface PiCliModel {
  id: string;
  reasoning?: boolean;
}

async function readPiSettings(location: ProjectLocation, signal?: AbortSignal) {
  try {
    signal?.throwIfAborted();
    const content =
      location.kind === "wsl"
        ? (
            await batchWslCommandsAsync(
              location.distro,
              ['cat "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"'],
              signal,
            )
          )[0]?.stdout
        : await readFile(join(nativeAgentDir(), "settings.json"), { encoding: "utf8", signal });
    const parsed = JSON.parse(content?.replace(/^\uFEFF/u, "") ?? "") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const settings = parsed as Record<string, unknown>;
    const models: PiCliModel[] = Array.isArray(settings.enabledModels)
      ? [...new Set(settings.enabledModels.filter((id): id is string => typeof id === "string"))]
          .map((id) => id.trim())
          // Globs and bare aliases need Pi's catalogue to resolve; never publish them as IDs.
          .filter((id) => splitPiModelId(id) && !/[*?[\]{}()!]/u.test(id))
          .map((id) => ({ id }))
      : [];
    const defaultProvider =
      typeof settings.defaultProvider === "string" ? settings.defaultProvider.trim() : "";
    const defaultModel =
      typeof settings.defaultModel === "string" ? settings.defaultModel.trim() : "";
    return {
      models,
      ...(defaultProvider && defaultModel
        ? { defaultModel: `${defaultProvider}/${defaultModel}` }
        : {}),
    };
  } catch {
    signal?.throwIfAborted();
    return undefined;
  }
}

/** Display label for a Pi model id ("anthropic/claude-sonnet-4-5" → "Sonnet 4.5"). */
export function humanizePiModelId(id: string): string {
  // Take the segment after the last "/" so nested router ids
  // ("openrouter/anthropic/claude-sonnet-4-5") still hit the canonical rules.
  const slash = id.lastIndexOf("/");
  return formatCursorBaseModelLabel(slash >= 0 ? id.slice(slash + 1) : id);
}

export function parsePiModelList(stdout: string): PiCliModel[] {
  return stdout
    .split(/\r?\n/u)
    .slice(1)
    .flatMap((line) => {
      const columns = line.trim().split(/\s{2,}/u);
      const provider = columns[0];
      const model = columns[1];
      if (!provider || !model || columns.length < 6) return [];
      return [{ id: `${provider}/${model}`, reasoning: columns[4]?.toLowerCase() === "yes" }];
    });
}

async function probePiCapabilities(
  location: ProjectLocation,
  executablePath: string,
  signal?: AbortSignal,
): Promise<CapabilitiesProbeResult> {
  const settings = await readPiSettings(location, signal);
  let models = settings?.models ?? [];
  let authenticated = false;
  // Exact scoped IDs are usable without waiting for Pi's potentially huge catalogue.
  if (models.length === 0) {
    const output = await readAgentCommandOutput(location, executablePath, ["--list-models"], {
      timeoutMs: 15_000,
      ...(signal ? { signal } : {}),
    });
    models = output.ok ? parsePiModelList(output.stdout) : [];
    authenticated = models.length > 0;
  }
  if (settings?.defaultModel) {
    models = [
      models.find((model) => model.id === settings.defaultModel) ?? { id: settings.defaultModel },
      ...models.filter((model) => model.id !== settings.defaultModel),
    ];
  }
  const modelEfforts = Object.fromEntries(
    // Settings have no reasoning metadata; let Pi validate its native thinking levels.
    models.map((model) => [
      model.id,
      model.reasoning === false ? ["off"] : [...PI_THINKING_LEVELS],
    ]),
  );
  const base: CapabilitiesProbeResult = {
    ...piDefaultCapabilities,
    models: models.map((model) => ({ id: model.id, label: humanizePiModelId(model.id) })),
    efforts: [...new Set(Object.values(modelEfforts).flat())],
    modelEfforts,
    ...(authenticated ? { authState: "authenticated" as const } : {}),
    authMethods: [{ id: "pi-login", name: "Pi login", type: "terminal" }],
    preferTerminalLogin: true,
  };
  if (location.kind === "wsl") {
    return { ...base, presentationModes: ["terminal"] };
  }
  const providers = [
    ...new Set([...nativeAuthProviders(), ...models.map((model) => model.id.split("/", 1)[0]!)]),
  ];
  const providerMetadata: AgentProviderMetadata | undefined = providers.length
    ? { connectedProviders: providers.map((provider) => ({ id: provider, label: provider })) }
    : undefined;
  return { ...base, ...(providerMetadata ? { providerMetadata } : {}) };
}

export const piDetectionSpec: DetectionSpec = {
  kind: "pi",
  label: "Pi",
  binary: "pi",
  loginCommand: "pi",
  capabilities: piDefaultCapabilities,
  update: {
    builtIn: { binary: "pi", args: ["update", "self"] },
    npm: "@earendil-works/pi-coding-agent",
    installer: {
      posix: { binary: "sh", args: ["-c", "curl -fsSL https://pi.dev/install.sh | sh"] },
      windows: {
        binary: "powershell.exe",
        args: ["-NoProfile", "-Command", "irm https://pi.dev/install.ps1 | iex"],
      },
    },
  },
  authProbes: [envVarAuthProbe([...PI_AUTH_ENV_KEYS]), piAuthFileProbe],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    return probePiCapabilities(ctx.location, ctx.executablePath, ctx.signal);
  },
};

export function piAgentHomePath(): string {
  return process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
}
