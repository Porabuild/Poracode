import type { AgentCapability, AgentTerminalAuthMethod } from "@/shared/contracts";
import { type AuthProbe, type DetectionSpec } from "../base";
import { commandCodeHasStoredCredentials } from "./session";

// Command Code's CLI default (used with no `-m`). We surface it first so a
// fresh thread mirrors what running `command-code` directly would pick.
// Source: https://commandcode.ai/docs/reference/cli/models (also `command-code
// --list-models` for the live, copy-pasteable set). `--model` matching is
// case-insensitive and accepts either the full id or the part after the `/`.
export const COMMANDCODE_DEFAULT_MODEL_ID = "moonshotai/Kimi-K2.5";

// Vendor groupings for the model picker. The slash-namespaced ids
// (`google/…`, `moonshotai/…`) auto-derive a sub-provider from their prefix;
// the un-namespaced Anthropic/OpenAI ids are mapped explicitly below so every
// model groups consistently by vendor.
const COMMANDCODE_SUB_PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google" },
  { id: "moonshotai", label: "Moonshot" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "zai-org", label: "Z.ai" },
  { id: "MiniMaxAI", label: "MiniMax" },
  { id: "Qwen", label: "Qwen" },
  { id: "stepfun", label: "StepFun" },
  { id: "xiaomi", label: "Xiaomi" },
];

const COMMANDCODE_MODELS = [
  { id: COMMANDCODE_DEFAULT_MODEL_ID, label: "Kimi K2.5", description: "Moonshot AI (default)" },
  { id: "moonshotai/Kimi-K2.6", label: "Kimi K2.6", description: "Moonshot AI" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", description: "Anthropic" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", description: "Anthropic" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", description: "Anthropic" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Anthropic" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Anthropic" },
  { id: "gpt-5.5", label: "GPT-5.5", description: "OpenAI" },
  { id: "gpt-5.4", label: "GPT-5.4", description: "OpenAI" },
  { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", description: "OpenAI" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "OpenAI" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", description: "Google" },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", description: "Google" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", description: "DeepSeek" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", description: "DeepSeek" },
  { id: "zai-org/GLM-5.1", label: "GLM-5.1", description: "Z.ai" },
  { id: "zai-org/GLM-5", label: "GLM-5", description: "Z.ai" },
  { id: "MiniMaxAI/MiniMax-M3", label: "MiniMax M3", description: "MiniMax" },
  { id: "MiniMaxAI/MiniMax-M2.7", label: "MiniMax M2.7", description: "MiniMax" },
  { id: "MiniMaxAI/MiniMax-M2.5", label: "MiniMax M2.5", description: "MiniMax" },
  { id: "Qwen/Qwen3.7-Max", label: "Qwen3.7 Max", description: "Qwen" },
  { id: "Qwen/Qwen3.6-Max-Preview", label: "Qwen3.6 Max Preview", description: "Qwen" },
  { id: "Qwen/Qwen3.6-Plus", label: "Qwen3.6 Plus", description: "Qwen" },
  { id: "stepfun/Step-3.5-Flash", label: "Step 3.5 Flash", description: "StepFun" },
  { id: "xiaomi/mimo-v2.5-pro", label: "MiMo v2.5 Pro", description: "Xiaomi" },
  { id: "xiaomi/mimo-v2.5", label: "MiMo v2.5", description: "Xiaomi" },
];

const COMMANDCODE_MODEL_SUB_PROVIDER: Record<string, string> = {
  "claude-opus-4-8": "anthropic",
  "claude-opus-4-7": "anthropic",
  "claude-opus-4-6": "anthropic",
  "claude-sonnet-4-6": "anthropic",
  "claude-haiku-4-5": "anthropic",
  "gpt-5.5": "openai",
  "gpt-5.4": "openai",
  "gpt-5.3-codex": "openai",
  "gpt-5.4-mini": "openai",
};

export const defaultCommandCodeCapabilities: AgentCapability = {
  models: COMMANDCODE_MODELS,
  efforts: [],
  modelEfforts: {},
  subProviders: COMMANDCODE_SUB_PROVIDERS,
  modelSubProvider: COMMANDCODE_MODEL_SUB_PROVIDER,
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "auto_edit", label: "Auto-accept edits" },
    { id: "yolo", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal"],
  defaultApprovalPolicy: "yolo",
  bypassPermissions: { approvalPolicy: "yolo" },
  settingDefs: [],
};

// Sign-in state comes from the credential file `command-code login` writes
// (`~/.commandcode/auth.json` with an `apiKey`), not the config dir, which is
// created on first run regardless. This keeps a never-signed-in user from
// seeing a false "Re-login" and a signed-in user from being nagged with
// "Login required".
const storedCredentialsAuthProbe: AuthProbe = async (ctx) => {
  return commandCodeHasStoredCredentials(ctx.location) ? "authenticated" : "missing";
};

// Command Code authenticates via `command-code login` (browser OAuth or an API
// key) run in a terminal. There is no ACP/structured probe, so we synthesize
// the terminal auth method when the binary is installed; this is what surfaces
// the Login / Re-login button (the renderer routes `type: "terminal"` methods
// to `runTerminalLogin` → `loginCommand`). `authProbes` above supplies the
// `authState` that decides Login vs Re-login / Signed in.
const COMMANDCODE_TERMINAL_AUTH: AgentTerminalAuthMethod = {
  id: "commandcode-terminal-login",
  name: "Login",
  type: "terminal",
};

export const commandCodeDetectionSpec: DetectionSpec = {
  kind: "commandcode",
  label: "Command Code",
  binary: "command-code",
  loginCommand: "command-code login",
  capabilities: defaultCommandCodeCapabilities,
  versionArgs: ["--version"],
  authProbes: [storedCredentialsAuthProbe],
  // Cheap, no-spawn probe: just advertise the terminal login method when
  // installed so the Settings Login button appears. Does not touch the static
  // model list (detectAgentInstall only merges non-auth capability fields).
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    return { authMethods: [COMMANDCODE_TERMINAL_AUTH] };
  },
  // `command-code update` is the documented self-updater (preferred). `npm`
  // also enables the registry "outdated?" check (getNpmPackageNameForUpdate)
  // and is the automatic fallback if the built-in updater fails, since the CLI
  // is distributed as the `command-code` npm package on every platform.
  update: { builtIn: { binary: "command-code", args: ["update"] }, npm: "command-code" },
};
