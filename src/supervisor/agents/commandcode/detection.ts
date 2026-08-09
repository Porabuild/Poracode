import { stripAnsi } from "@/shared/ansi";
import type { AgentCapability, AgentTerminalAuthMethod, LabeledOption } from "@/shared/contracts";
import {
  envVarAuthProbe,
  type AuthProbe,
  type DetectionSpec,
  readAgentCommandOutput,
} from "../base";
import { getAgentProbeCwd } from "../probeCwd";
import { commandCodeHasStoredCredentials } from "./session";

// Command Code's CLI runs a background self-updater on EVERY invocation: when a
// newer npm version exists it spawns a detached `cmd.exe`/`npm i <tgz>` (see the
// CLI's `spawnBackgroundUpdate`), which Windows 11 surfaces as a stray terminal
// window — re-triggered by each launch-time detection probe. Poracode owns
// agent updates (Settings update button → `command-code update`), so we set
// `COMMANDCODE_SKIP_UPDATES` on every command-code spawn we make (detection
// probes, PTY launches, one-shots) to suppress the CLI's own updater. The CLI
// also honors `CI`, but that flips broader non-interactive behavior, so we use
// the dedicated switch. `command-code update` runs without this env (separate
// path), so explicit updates still work.
export const COMMANDCODE_SKIP_UPDATES_ENV: Record<string, string> = {
  COMMANDCODE_SKIP_UPDATES: "1",
};

// Command Code's CLI default (used with no `-m`). We surface it first so a
// fresh thread mirrors what running `command-code` directly would pick.
// Source: https://commandcode.ai/docs/reference/cli/models (also `command-code
// --list-models` for the live, copy-pasteable set). `--model` matching is
// case-insensitive and accepts either the full id or the part after the `/`.
export const COMMANDCODE_DEFAULT_MODEL_ID = "deepseek/deepseek-v4-flash";

// Curated sub-provider labels + canonical display order for the model picker.
// The slash-namespaced ids (`google/…`, `moonshotai/…`) auto-derive a
// sub-provider from their prefix; the un-namespaced Anthropic/OpenAI ids map
// explicitly (see `commandCodeModelSubProviderId`). Any namespace the CLI
// surfaces that isn't listed here still groups — it just falls back to a
// humanized label and sorts after the curated ones.
const COMMANDCODE_SUB_PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  moonshotai: "Moonshot",
  deepseek: "DeepSeek",
  "zai-org": "Z.ai",
  minimaxai: "MiniMax",
  qwen: "Qwen",
  stepfun: "StepFun",
  xiaomi: "Xiaomi",
  tencent: "Tencent",
  nvidia: "NVIDIA",
  thinkingmachines: "Thinking Machines",
  poolside: "Poolside",
  inclusionai: "InclusionAI",
  sakana: "Sakana AI",
  meta: "Meta",
  xai: "xAI",
};

const COMMANDCODE_SUB_PROVIDER_ORDER = [
  "anthropic",
  "openai",
  "google",
  "moonshotai",
  "deepseek",
  "zai-org",
  "minimaxai",
  "qwen",
  "stepfun",
  "xiaomi",
  "tencent",
  "nvidia",
  "thinkingmachines",
  "poolside",
  "inclusionai",
  "sakana",
  "meta",
  "xai",
];

// Hand-tuned display labels keyed by model id. These exist only to render known
// ids prettily (correct casing, `4.6` vs `4-6`, dropping a noisy param suffix
// like `nemotron-3-ultra-550b-a55b`). They are NOT the source of truth for
// which models exist — that comes from `command-code --list-models` at
// detection time. A brand-new id we haven't curated still appears, labeled by
// `humanizeCommandCodeModelLabel` until an override is added here.
const COMMANDCODE_MODEL_LABELS: Record<string, string> = {
  "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek/deepseek-v4-flash": "DeepSeek V4 Flash",
  "moonshotai/kimi-k3": "Kimi K3",
  "moonshotai/kimi-k2.7-code": "Kimi K2.7 Code",
  "moonshotai/kimi-k2.7-code-highspeed": "Kimi K2.7 Code Highspeed",
  "moonshotai/kimi-k2.6": "Kimi K2.6",
  "moonshotai/kimi-k2.5": "Kimi K2.5",
  "zai-org/glm-5.2": "GLM-5.2",
  "zai-org/glm-5.2-fast": "GLM-5.2 Fast",
  "zai-org/glm-5.1": "GLM-5.1",
  "zai-org/glm-5": "GLM-5",
  "minimaxai/minimax-m3": "MiniMax M3",
  "minimaxai/minimax-m2.7": "MiniMax M2.7",
  "minimaxai/minimax-m2.5": "MiniMax M2.5",
  "xiaomi/mimo-v2.5-pro": "MiMo v2.5 Pro",
  "xiaomi/mimo-v2.5": "MiMo v2.5",
  "qwen/qwen3.6-max-preview": "Qwen3.6 Max Preview",
  "qwen/qwen3.6-plus": "Qwen3.6 Plus",
  "qwen/qwen3.7-max": "Qwen3.7 Max",
  "qwen/qwen3.7-plus": "Qwen3.7 Plus",
  "qwen/qwen3.7-flash": "Qwen3.7 Flash",
  "stepfun/step-3.7-flash": "Step 3.7 Flash",
  "stepfun/step-3.5-flash": "Step 3.5 Flash",
  "tencent/hy3-paid": "Hunyuan 3",
  "nvidia/nemotron-3-ultra-550b-a55b": "Nemotron 3 Ultra",
  "thinkingmachines/inkling": "Inkling",
  "thinkingmachines/inkling-small": "Inkling Small",
  "poolside/laguna-s-2.1-free": "Laguna S 2.1",
  "inclusionai/ling-3.0-flash-free": "Ling 3.0 Flash",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-fable-5": "Claude Fable 5",
  "claude-opus-5": "Claude Opus 5",
  "claude-opus-4-8": "Claude Opus 4.8",
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-5.5": "GPT-5.5",
  "gpt-5.4": "GPT-5.4",
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "gpt-5.4-mini": "GPT-5.4 Mini",
  "google/gemini-3.6-flash": "Gemini 3.6 Flash",
  "google/gemini-3.5-flash": "Gemini 3.5 Flash",
  "google/gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
  "google/gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
  "sakana/fugu-ultra": "Fugu Ultra",
  "meta/muse-spark-1.1": "Muse Spark 1.1",
  "xai/grok-4.5": "Grok 4.5",
};

// Offline fallback model ids (a known-good snapshot of `--list-models`). Used to
// build `defaultCommandCodeCapabilities` so the picker still has a sensible set
// before/without a successful probe. The live probe replaces this whenever
// `command-code --list-models` succeeds, so it never has to stay current.
const COMMANDCODE_FALLBACK_MODEL_IDS = [
  "deepseek/deepseek-v4-pro",
  COMMANDCODE_DEFAULT_MODEL_ID,
  "moonshotai/kimi-k3",
  "moonshotai/kimi-k2.7-code",
  "moonshotai/kimi-k2.7-code-highspeed",
  "moonshotai/kimi-k2.6",
  "moonshotai/kimi-k2.5",
  "zai-org/glm-5.2",
  "zai-org/glm-5.2-fast",
  "zai-org/glm-5.1",
  "zai-org/glm-5",
  "minimaxai/minimax-m3",
  "minimaxai/minimax-m2.7",
  "minimaxai/minimax-m2.5",
  "xiaomi/mimo-v2.5-pro",
  "xiaomi/mimo-v2.5",
  "qwen/qwen3.6-max-preview",
  "qwen/qwen3.6-plus",
  "qwen/qwen3.7-max",
  "qwen/qwen3.7-plus",
  "qwen/qwen3.7-flash",
  "stepfun/step-3.7-flash",
  "stepfun/step-3.5-flash",
  "tencent/hy3-paid",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "thinkingmachines/inkling",
  "thinkingmachines/inkling-small",
  "poolside/laguna-s-2.1-free",
  "inclusionai/ling-3.0-flash-free",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-fable-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-haiku-4-5",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.4-mini",
  "google/gemini-3.6-flash",
  "google/gemini-3.5-flash",
  "google/gemini-3.5-flash-lite",
  "google/gemini-3.1-flash-lite",
  "sakana/fugu-ultra",
  "meta/muse-spark-1.1",
  "xai/grok-4.5",
];

const COMMANDCODE_MODEL_EFFORTS: Record<string, string[]> = {
  "claude-sonnet-5": ["low", "medium", "high", "xhigh", "max"],
  "claude-sonnet-4-6": ["low", "medium", "high", "xhigh", "max"],
  "claude-fable-5": ["low", "medium", "high", "xhigh", "max"],
  "claude-opus-5": ["low", "medium", "high", "xhigh", "max"],
  "claude-opus-4-8": ["low", "medium", "high", "xhigh", "max"],
  "claude-opus-4-7": ["low", "medium", "high", "xhigh", "max"],
  "gpt-5.6-sol": ["low", "medium", "high", "xhigh", "max"],
  "gpt-5.6-terra": ["low", "medium", "high", "xhigh", "max"],
  "gpt-5.6-luna": ["low", "medium", "high", "xhigh", "max"],
  "gpt-5.5": ["low", "medium", "high", "xhigh"],
  "gpt-5.4": ["low", "medium", "high", "xhigh"],
  "gpt-5.3-codex": ["low", "medium", "high", "xhigh"],
  "gpt-5.4-mini": ["low", "medium", "high"],
  "deepseek/deepseek-v4-pro": ["high", "max"],
  "deepseek/deepseek-v4-flash": ["high", "max"],
  "zai-org/glm-5.2": ["high", "max"],
  "google/gemini-3.6-flash": ["low", "medium", "high"],
  "google/gemini-3.5-flash": ["low", "medium", "high"],
  "google/gemini-3.5-flash-lite": ["low", "medium", "high"],
  "google/gemini-3.1-flash-lite": ["low", "medium", "high"],
  "sakana/fugu-ultra": ["high", "xhigh"],
  "xai/grok-4.5": ["low", "medium", "high"],
};

export interface ParsedCommandCodeModel {
  id: string;
  description?: string;
  isDefault?: boolean;
}

// A model row is `<id><2+ spaces><tagline>`; section headers ("Open Source",
// "Anthropic") have no 2-space gap and so never match. The id guard rejects the
// `Docs:`/usage footer lines (the leading prefix skip below covers them too).
const COMMANDCODE_MODEL_LINE_RE = /^(\S+)\s{2,}(.+)$/;
const COMMANDCODE_MODEL_ID_RE = /^[A-Za-z0-9][\w./-]*$/;
const COMMANDCODE_NOISE_LINE_RE = /^(?:Available\b|Pass\b|cmd\b|Docs:|Tip:|Loading\b|Usage:)/i;

/**
 * Parse `command-code --list-models` stdout into `{id, description, isDefault}`.
 * Tolerant by design: anything that isn't a recognizable `id  tagline` row
 * (headers, blank lines, the trailing usage/docs footer) is skipped, and the
 * `(default)` / `(recommended)` markers are stripped out of the tagline.
 */
export function parseCommandCodeModels(output: string): ParsedCommandCodeModel[] {
  const parsed: ParsedCommandCodeModel[] = [];
  const seen = new Set<string>();
  for (const rawLine of stripAnsi(output).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || COMMANDCODE_NOISE_LINE_RE.test(line)) continue;

    const match = COMMANDCODE_MODEL_LINE_RE.exec(line);
    if (!match) continue;
    const id = match[1]!;
    if (!COMMANDCODE_MODEL_ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);

    const rawDescription = match[2]!.trim();
    const isDefault = /\(default\)/i.test(rawDescription);
    const description = rawDescription
      .replace(/\s*\((?:default|recommended)\)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    parsed.push({
      id,
      ...(description ? { description } : {}),
      ...(isDefault ? { isDefault: true } : {}),
    });
  }
  return parsed;
}

function humanizeCommandCodeModelLabel(id: string): string {
  // Drop any namespace prefix, then turn `-` separators into spaces and
  // title-case each segment. Fallback only — curated ids use the override map.
  const tail = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return tail
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function commandCodeModelSubProviderId(id: string): string | undefined {
  const slash = id.indexOf("/");
  if (slash > 0) return id.slice(0, slash).toLowerCase();
  if (/^claude/i.test(id)) return "anthropic";
  if (/^(?:gpt|o\d|codex)/i.test(id)) return "openai";
  return undefined;
}

/**
 * Turn parsed models into the picker's model capabilities: the labeled model
 * list plus the sub-provider grouping (labels + per-model mapping). Shared by
 * the static fallback and the live `--list-models` probe so labels and grouping
 * stay consistent across both paths.
 */
export function buildCommandCodeModelPickerCapabilities(
  parsed: ParsedCommandCodeModel[],
): Pick<AgentCapability, "models" | "subProviders" | "modelSubProvider" | "modelEfforts"> {
  const models: LabeledOption[] = [];
  const modelSubProvider: Record<string, string> = {};
  const modelEfforts: Record<string, string[]> = {};
  const usedSubProviders = new Set<string>();
  const seen = new Set<string>();
  let defaultId: string | undefined;

  for (const { id, description, isDefault } of parsed) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (isDefault && !defaultId) defaultId = id;

    const model: LabeledOption = {
      id,
      label: COMMANDCODE_MODEL_LABELS[id.toLowerCase()] ?? humanizeCommandCodeModelLabel(id),
    };
    const desc = description?.trim();
    if (desc) model.description = desc;
    models.push(model);
    const efforts = COMMANDCODE_MODEL_EFFORTS[id.toLowerCase()];
    if (efforts) modelEfforts[id] = efforts;

    const sub = commandCodeModelSubProviderId(id);
    if (sub) {
      modelSubProvider[id] = sub;
      usedSubProviders.add(sub);
    }
  }

  // Surface Command Code's own default first so a fresh thread (one with no
  // saved model) mirrors what running `command-code` directly would pick —
  // `resolveModelValue` falls back to `models[0]`.
  if (defaultId) {
    const idx = models.findIndex((m) => m.id === defaultId);
    if (idx > 0) models.unshift(models.splice(idx, 1)[0]!);
  }

  const subProviders: LabeledOption[] = [];
  const emitted = new Set<string>();
  const pushSubProvider = (subId: string) => {
    if (emitted.has(subId)) return;
    emitted.add(subId);
    subProviders.push({
      id: subId,
      label: COMMANDCODE_SUB_PROVIDER_LABELS[subId] ?? humanizeCommandCodeModelLabel(subId),
    });
  };
  for (const subId of COMMANDCODE_SUB_PROVIDER_ORDER) {
    if (usedSubProviders.has(subId)) pushSubProvider(subId);
  }
  // Any namespace the CLI introduced that we don't have a curated order for.
  for (const subId of usedSubProviders) pushSubProvider(subId);

  return { models, subProviders, modelSubProvider, modelEfforts };
}

export const defaultCommandCodeCapabilities: AgentCapability = {
  ...buildCommandCodeModelPickerCapabilities(
    COMMANDCODE_FALLBACK_MODEL_IDS.map((id) => ({
      id,
      ...(id === COMMANDCODE_DEFAULT_MODEL_ID ? { isDefault: true } : {}),
    })),
  ),
  efforts: [],
  defaultEffort: "high",
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "auto_edit", label: "Auto-accept edits" },
    { id: "dont-ask", label: "Don't ask (deny)" },
    { id: "yolo", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  // Command Code sandboxes file reads to its working directory, so picked
  // screenshots / attachments must be copied into the project before use.
  requiresWorkspaceLocalAttachments: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal"],
  defaultApprovalPolicy: "yolo",
  bypassPermissions: { approvalPolicy: "yolo" },
  // No dedicated-server hosting path in any presentation.
  mcpScope: { terminal: "none", gui: "none" },
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
  // `runTerminalLogin` forwards `env` into the login command; suppress the
  // CLI's background self-updater so `command-code login` doesn't spawn a
  // detached `npm i` terminal alongside the login overlay.
  env: COMMANDCODE_SKIP_UPDATES_ENV,
};

export const commandCodeDetectionSpec: DetectionSpec = {
  kind: "commandcode",
  label: "Command Code",
  binary: "command-code",
  loginCommand: "command-code login",
  capabilities: defaultCommandCodeCapabilities,
  versionArgs: ["--version"],
  authProbes: [envVarAuthProbe(["COMMAND_CODE_API_KEY"]), storedCredentialsAuthProbe],
  // Two cheap, no-TUI jobs in one probe: advertise the terminal login method so
  // the Settings Login button appears, and refresh the model list from
  // `command-code --list-models` (instant, no auth needed) so newly shipped
  // models show up without an app release. If the list call fails or parses to
  // nothing we return auth only, leaving the static fallback models in place
  // (detectAgentInstall shallow-merges this partial over spec.capabilities).
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    const result = await readAgentCommandOutput(
      ctx.location,
      ctx.executablePath,
      ["--list-models"],
      {
        timeoutMs: 8_000,
        wslLinuxCwd: "/tmp",
        posixCwd: getAgentProbeCwd(ctx.location),
        // Suppress the CLI's background self-updater (sourced from spec.probeEnv).
        ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
    ).catch((error) => {
      console.warn("[commandcode] model list probe failed:", error);
      return undefined;
    });
    const parsed = result?.ok ? parseCommandCodeModels(result.stdout) : [];
    const modelCapabilities =
      parsed.length > 0 ? buildCommandCodeModelPickerCapabilities(parsed) : undefined;
    return { authMethods: [COMMANDCODE_TERMINAL_AUTH], ...modelCapabilities };
  },
  // `command-code update` is the documented self-updater (preferred). `npm`
  // also enables the registry "outdated?" check (getNpmPackageNameForUpdate)
  // and is the automatic fallback if the built-in updater fails, since the CLI
  // is distributed as the `command-code` npm package on every platform.
  update: { builtIn: { binary: "command-code", args: ["update"] }, npm: "command-code" },
  // Suppress the CLI's own background self-updater on the `--version` probe.
  probeEnv: COMMANDCODE_SKIP_UPDATES_ENV,
};
