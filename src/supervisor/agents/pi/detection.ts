import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentCapability, AgentProviderMetadata, ProjectLocation } from "@/shared/contracts";
import {
  batchWslCommandsAsync,
  envVarAuthProbe,
  readAgentCommandOutput,
  type AuthProbe,
  type CapabilitiesProbeResult,
  type DetectionSpec,
} from "../base";

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
    const [result] = await batchWslCommandsAsync(ctx.location.distro, [
      'test -s "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/auth.json"',
    ]);
    return result?.ok ? "authenticated" : "missing";
  }
  return existsSync(nativePiAuthPath()) && nativeAuthProviders().length > 0
    ? "authenticated"
    : "missing";
};

export const piDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
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
  mcpScope: { terminal: "none", gui: "launch" },
  settingDefs: [],
};

export interface PiCliModel {
  id: string;
  reasoning: boolean;
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
): Promise<CapabilitiesProbeResult> {
  // Native and WSL alike probe the installed CLI's model table — no bundled Pi
  // SDK. The GUI structured session likewise drives the installed `pi --mode rpc`.
  const output = await readAgentCommandOutput(location, executablePath, ["--list-models"], {
    timeoutMs: 15_000,
  });
  const models = output.ok ? parsePiModelList(output.stdout) : [];
  const modelEfforts = Object.fromEntries(
    models.map((model) => [model.id, model.reasoning ? [...PI_CLI_REASONING_LEVELS] : ["off"]]),
  );
  const base: CapabilitiesProbeResult = {
    ...piDefaultCapabilities,
    models: models.map((model) => ({ id: model.id, label: model.id.split("/", 2)[1]! })),
    efforts: [...new Set(Object.values(modelEfforts).flat())],
    modelEfforts,
    ...(models.length > 0 ? { authState: "authenticated" as const } : {}),
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
    return probePiCapabilities(ctx.location, ctx.executablePath);
  },
};

const PI_CLI_REASONING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export function piAgentHomePath(): string {
  return process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
}
