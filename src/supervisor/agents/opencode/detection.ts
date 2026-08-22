import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { stripAnsi } from "@/shared/ansi";
import {
  type AgentSlashCommand,
  compactAgentProviderMetadata,
  type AgentCapability,
  type AgentConnectedProvider,
  type ProjectLocation,
} from "@/shared/contracts";
import {
  configFileAuthProbe,
  readAgentCommandOutput,
  type DetectionSpec,
  type StatusProbeResult,
} from "../base";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { getAgentProbeCwd } from "../probeCwd";
import { probeOpenCodeInventoryViaSdk, type OpenCodeSdkInventory } from "./sdkProbe";

/**
 * Minimum OpenCode CLI version we can talk to over the SDK. 1.14.19 is the
 * first build that ships the v2 client surface we depend on (provider.list,
 * app.agents, session.promptAsync with `agent`/`variant`). Older binaries
 * silently miss fields and we crash deserialising responses.
 */
export const OPENCODE_MIN_VERSION = "1.14.19";

// Canonical ordering for the union effort list. Anything OpenCode reports
// outside this set gets appended after these in discovery order so we never
// silently hide a variant. `none` is OpenCode's "skip reasoning" variant on
// GPT-class models — kept first so it sorts ahead of the actual effort
// gradient.
const CANONICAL_EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

// Per-model default — preferred when the model exposes it, falling back to
// the highest-precedence available variant. Mirrors how Claude defaults to
// `high`; OpenCode defaults to `medium` because several Zen models (GPT-5.5,
// Sonnet) make `medium` their lowest paid-effort tier.
const OPENCODE_PREFERRED_DEFAULT_EFFORT = "medium";

export const opencodeDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  // OpenCode exposes two built-in agents: `build` (default) and `plan`. The
  // SDK accepts an `agent` field on `prompt_async`; the renderer's Plan toggle
  // flips `ThreadConfig.mode` and the SDK session translates "plan" → agent.
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "yolo", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  // GUI presentation routes through `OpencodeSdkSession` (long-lived
  // `opencode serve` + SDK SSE stream); terminal stays the default and uses
  // the same SDK helper for one-shot session-id allocation.
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "yolo",
  bypassPermissions: { approvalPolicy: "yolo" },
  // MCP is provider-level for OpenCode: the composer shows the effective set
  // read-only, while changes stay on the provider settings page.
  // built-in server flags come from the OpenCode settings page
  // (`agentSettings.opencode`) at launch. OpenCode applies that set to each
  // project directory inside the shared runtime server instead of hosting
  // per-thread MCP credentials.
  mcpScope: { terminal: "none", gui: "none" },
  mcpConfigSource: "agentSettings",
  agentSettingsDefaults: { crossagentMcp: true },
  // The installed OpenCode plugin injects the trusted provider session id
  // into Crossagents calls, allowing every directory/session in the pooled
  // server to share one MCP credential without losing parent-thread routing.
  crossagentMcpRouting: "provider-session",
  settingDefs: [],
};

/**
 * OpenCode stores its credentials in `~/.local/share/opencode/auth.json`
 * after `opencode auth login`. Existence is good enough as an "authenticated"
 * signal — the host can't validate the token without spending a request.
 */
function opencodeNativeAuthPath(): string {
  return join(homedir(), ".local", "share", "opencode", "auth.json");
}

// `opencode models --verbose` interleaves `provider/model` headers with
// pretty-printed JSON for each model. We split on header lines (column-0,
// non-`{}`, matching the `provider/model` shape) and parse each block to pull
// out the `variants` keys — those are the OpenCode "model variant" names that
// `--variant` (CLI) and `prompt_async.variant` (SDK) accept and that we
// surface as effort options in the composer.
const OPENCODE_MODEL_HEADER_RE = /^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_.-]*$/i;

interface OpenCodeProbedModel {
  id: string;
  variants: string[];
  contextLimit?: number;
}

/**
 * Compare two `x.y.z` semver strings. Returns -1 / 0 / 1 like a normal sort
 * comparator. Pre-release suffixes (`-alpha.1`) are ignored — they only affect
 * tie-breakers between the same `x.y.z`, which we don't care about for a
 * minimum-version gate. Non-numeric segments compare as zero so a malformed
 * "1.14.x" stays less than "1.14.19" without throwing.
 */
export function compareOpencodeSemver(left: string, right: string): number {
  const parse = (input: string): number[] => {
    const core = input.split(/[-+]/, 1)[0] ?? input;
    return core.split(".").map((segment) => {
      const numeric = Number.parseInt(segment, 10);
      return Number.isFinite(numeric) ? numeric : 0;
    });
  };
  const a = parse(left);
  const b = parse(right);
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai !== bi) return ai < bi ? -1 : 1;
  }
  return 0;
}

interface OpenCodeCommandLike {
  name?: string;
  description?: string;
  hints?: string[];
  source?: string;
  template?: string;
}

export function mapOpenCodeSlashCommands(
  commands: readonly OpenCodeCommandLike[],
): AgentSlashCommand[] {
  return commands.flatMap((command) => {
    const id = command.name?.trim();
    if (!id) return [];
    const description = command.description?.trim();
    const argumentHint = command.hints
      ?.map((hint) => hint.trim())
      .filter(Boolean)
      .join(" ");
    return [
      {
        id,
        label: description ? `${id} — ${description}` : id,
        ...(description ? { description } : {}),
        ...(argumentHint ? { argumentHint } : {}),
      },
    ];
  });
}

export function parseOpenCodeVerboseModels(stdout: string): OpenCodeProbedModel[] {
  const lines = stdout.split(/\r?\n/g);
  const entries: { id: string; jsonLines: string[] }[] = [];
  let currentId: string | undefined;
  let buf: string[] = [];
  for (const line of lines) {
    if (OPENCODE_MODEL_HEADER_RE.test(line)) {
      if (currentId) entries.push({ id: currentId, jsonLines: buf });
      currentId = line;
      buf = [];
    } else if (currentId) {
      buf.push(line);
    }
  }
  if (currentId) entries.push({ id: currentId, jsonLines: buf });

  return entries.map(({ id, jsonLines }) => {
    const json = jsonLines.join("\n").trim();
    if (!json) return { id, variants: [] };
    try {
      const obj = JSON.parse(json) as {
        variants?: Record<string, unknown>;
        limit?: { context?: unknown };
      };
      const variants =
        obj.variants && typeof obj.variants === "object" ? Object.keys(obj.variants) : [];
      const rawContext = obj.limit?.context;
      const contextLimit =
        typeof rawContext === "number" && Number.isFinite(rawContext) && rawContext > 0
          ? Math.trunc(rawContext)
          : undefined;
      return {
        id,
        variants,
        ...(contextLimit !== undefined ? { contextLimit } : {}),
      };
    } catch {
      return { id, variants: [] };
    }
  });
}

async function probeOpenCodeModels(
  location: ProjectLocation,
  executablePath: string,
  signal?: AbortSignal,
): Promise<OpenCodeProbedModel[] | undefined> {
  const result = await readAgentCommandOutput(location, executablePath, ["models", "--verbose"], {
    // Verbose mode prints a JSON object per model — slower than the bare
    // `models` listing but still bounded by OpenCode's local cache.
    timeoutMs: 15_000,
    posixCwd: getAgentProbeCwd(location),
    ...(signal ? { signal } : {}),
  });
  if (!result.ok || !result.stdout) return undefined;
  const parsed = parseOpenCodeVerboseModels(result.stdout);
  return parsed.length > 0 ? parsed : undefined;
}

const OPENCODE_TITLE_TOKEN_OVERRIDES: Record<string, string> = {
  api: "API",
  aws: "AWS",
  chatgpt: "ChatGPT",
  claude: "Claude",
  codestral: "Codestral",
  copilot: "Copilot",
  deepseek: "DeepSeek",
  devstral: "Devstral",
  gemini: "Gemini",
  github: "GitHub",
  glm: "GLM",
  gpt: "GPT",
  grok: "Grok",
  groq: "Groq",
  haiku: "Haiku",
  kimi: "Kimi",
  llama: "Llama",
  llm: "LLM",
  max: "Max",
  mini: "Mini",
  mistral: "Mistral",
  ollama: "Ollama",
  openai: "OpenAI",
  opencode: "OpenCode",
  openrouter: "OpenRouter",
  opus: "Opus",
  oss: "OSS",
  pro: "Pro",
  qwen: "Qwen",
  sonnet: "Sonnet",
  xai: "xAI",
};

function titleizeOpenCodeToken(token: string): string {
  const lower = token.toLowerCase();
  const override = OPENCODE_TITLE_TOKEN_OVERRIDES[lower];
  if (override) return override;
  if (/^o\d/.test(lower)) return lower;
  if (/^[a-z]\d/.test(lower)) return lower.charAt(0).toUpperCase() + lower.slice(1);
  const size = /^(\d+)([bkmt])$/i.exec(token);
  if (size) {
    const [, amount, unit] = size;
    return `${amount}${unit!.toUpperCase()}`;
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

function titleizeOpenCodeName(name: string): string {
  const rawParts = name.split(/[-_\s]+/g).filter(Boolean);
  const parts: string[] = [];

  for (let i = 0; i < rawParts.length; i += 1) {
    const part = rawParts[i]!;
    const next = rawParts[i + 1];
    if (/^\d{1,2}$/.test(part) && next && /^\d{1,2}$/.test(next)) {
      parts.push(`${part}.${next}`);
      i += 1;
      continue;
    }
    parts.push(titleizeOpenCodeToken(part));
  }

  return parts.join(" ");
}

function openCodeModelNamePart(id: string): string {
  const slash = id.indexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}

function openCodeModelSubProvider(id: string): string | undefined {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : undefined;
}

function formatOpenCodeCredentialType(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed === "api") return "API";
  if (trimmed === "oauth") return "OAuth";
  return trimmed;
}

export function parseOpenCodeProvidersList(output: string): AgentConnectedProvider[] {
  const providers: AgentConnectedProvider[] = [];
  for (const rawLine of stripAnsi(output).split(/\r?\n/g)) {
    const line = rawLine.trim();
    const bullet = /^[●•]\s+(.+)$/.exec(line);
    if (!bullet) continue;
    const text = bullet[1]!.trim();
    const match = /^(.*?)\s+(api|oauth)$/i.exec(text);
    const label = (match?.[1] ?? text).trim();
    providers.push({
      label: label === "GitHub Copilot" ? "Copilot" : label,
      ...(formatOpenCodeCredentialType(match?.[2])
        ? { detail: formatOpenCodeCredentialType(match?.[2]) }
        : {}),
    });
  }
  return providers;
}

/**
 * Read the configured-provider ids straight from OpenCode's `auth.json` (the
 * object keys — e.g. `opencode`, `github-copilot`). Values are never read, so no
 * secret material is touched. Returns `[]` on any read/parse failure (missing
 * file = no providers). Only valid for the host: WSL distros keep their own copy.
 */
async function readOpenCodeNativeProviderIds(): Promise<string[]> {
  try {
    const raw = await readFile(opencodeNativeAuthPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.keys(parsed as Record<string, unknown>);
  } catch {
    return [];
  }
}

/**
 * Zip the auth.json provider ids onto the parsed `providers list` entries.
 *
 * `opencode providers list` renders exactly the auth.json credentials in file
 * order, so the bullet list lines up 1:1 with `Object.keys(auth.json)` by index
 * — that's how we recover a stable id (which the CLI text omits) for each
 * connected provider. We only attach when the counts match: a mismatch means the
 * CLI surfaced something not keyed in auth.json (e.g. an env-var credential), in
 * which case guessing an id risks logging out the wrong provider, so we leave the
 * ids off and let the UI fall back to interactive removal.
 */
export function attachOpenCodeProviderIds(
  providers: readonly AgentConnectedProvider[],
  ids: readonly string[],
): AgentConnectedProvider[] {
  if (providers.length === 0 || ids.length !== providers.length) {
    return providers.map((provider) => ({ ...provider }));
  }
  return providers.map((provider, index) => {
    const id = ids[index]?.trim();
    return id ? { ...provider, id } : { ...provider };
  });
}

async function probeOpenCodeStatusViaCli(
  ctx: Parameters<NonNullable<DetectionSpec["statusProbe"]>>[0],
): Promise<StatusProbeResult | undefined> {
  if (!ctx.executablePath) return undefined;
  const result = await readAgentCommandOutput(
    ctx.location,
    ctx.executablePath,
    ["providers", "list"],
    {
      posixCwd: getAgentProbeCwd(ctx.location),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    },
  );
  const text = `${result.stdout}\n${result.stderr}`.trim();
  const parsedProviders = parseOpenCodeProvidersList(text);
  // Recover a stable logout id per provider from the host auth.json. WSL distros
  // keep their own auth.json we can't read from here, so they stay id-less and
  // fall back to OpenCode's interactive removal flow.
  const providerIds = ctx.location.kind === "wsl" ? [] : await readOpenCodeNativeProviderIds();
  const connectedProviders = attachOpenCodeProviderIds(parsedProviders, providerIds);
  const credentialsCountMatch = /(\d+)\s+credentials\b/i.exec(text);
  const credentialsCount = credentialsCountMatch ? Number(credentialsCountMatch[1]) : undefined;
  const providerMetadata = compactAgentProviderMetadata({
    ...(connectedProviders.length > 0 ? { connectedProviders } : {}),
  });

  return {
    ...(connectedProviders.length > 0 || (credentialsCount ?? 0) > 0
      ? { authState: "authenticated" as const }
      : /0\s+credentials\b/i.test(text)
        ? { authState: "missing" as const }
        : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

export function buildOpenCodeStatusFromSdkInventory(
  inventory: OpenCodeSdkInventory,
): StatusProbeResult {
  const providersById = new Map(inventory.providers.map((provider) => [provider.id, provider]));
  const connectedProviders = inventory.connected.map((id) => {
    const label = providersById.get(id)?.name.trim();
    return { id, label: label || humanizeOpenCodeSubProviderId(id) };
  });
  const providerMetadata = compactAgentProviderMetadata({
    ...(connectedProviders.length > 0 ? { connectedProviders } : {}),
  });
  return {
    authState: connectedProviders.length > 0 ? "authenticated" : "missing",
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

interface OpenCodeDetectionProbeResult {
  capabilities?: Partial<AgentCapability>;
  status?: StatusProbeResult;
}

type OpenCodeDetectionProbeContext = Parameters<NonNullable<DetectionSpec["capabilitiesProbe"]>>[0];

interface PendingOpenCodeDetectionProbe {
  signal: AbortSignal | undefined;
  promise: Promise<OpenCodeDetectionProbeResult>;
}

const pendingOpenCodeDetectionProbes = new Map<string, PendingOpenCodeDetectionProbe>();

function openCodeDetectionProbeKey(ctx: OpenCodeDetectionProbeContext): string {
  return JSON.stringify([ctx.location, ctx.executablePath, ctx.version, ctx.probeEnv]);
}

async function runOpenCodeDetectionProbe(
  ctx: OpenCodeDetectionProbeContext,
): Promise<OpenCodeDetectionProbeResult> {
  if (!ctx.executablePath) return {};

  if (ctx.version && compareOpencodeSemver(ctx.version, OPENCODE_MIN_VERSION) < 0) {
    const status = await probeOpenCodeStatusViaCli(ctx);
    return status ? { status } : {};
  }

  const sdkInventory = await probeOpenCodeInventoryViaSdk(ctx.location, ctx.signal).catch(
    (cause) => {
      console.warn(
        `[opencode] SDK capabilities probe failed, falling back to CLI parser: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
      return undefined;
    },
  );
  ctx.signal?.throwIfAborted();
  if (sdkInventory) {
    return {
      capabilities: buildCapabilityPartialFromSdkInventory(sdkInventory),
      status: buildOpenCodeStatusFromSdkInventory(sdkInventory),
    };
  }

  // OpenCode's CLI and server share a SQLite database. Keep the two fallback
  // commands serial so startup never races `models --verbose` against
  // `providers list` and surfaces a spurious "database is locked" failure.
  const probedModels = await probeOpenCodeModels(ctx.location, ctx.executablePath, ctx.signal);
  const status = await probeOpenCodeStatusViaCli(ctx);
  return {
    ...(probedModels ? { capabilities: buildCapabilityPartialFromProbedModels(probedModels) } : {}),
    ...(status ? { status } : {}),
  };
}

function probeOpenCodeDetection(
  ctx: OpenCodeDetectionProbeContext,
): Promise<OpenCodeDetectionProbeResult> {
  const key = openCodeDetectionProbeKey(ctx);
  const existing = pendingOpenCodeDetectionProbes.get(key);
  if (existing && existing.signal === ctx.signal) return existing.promise;

  const pending = runOpenCodeDetectionProbe(ctx);
  pendingOpenCodeDetectionProbes.set(key, { signal: ctx.signal, promise: pending });
  const clearPending = () => {
    if (pendingOpenCodeDetectionProbes.get(key)?.promise === pending) {
      pendingOpenCodeDetectionProbes.delete(key);
    }
  };
  void pending.then(clearPending, clearPending);
  return pending;
}

export function humanizeOpenCodeModelId(id: string): string {
  return titleizeOpenCodeName(openCodeModelNamePart(id));
}

export function humanizeOpenCodeSubProviderId(id: string): string {
  if (id === "github-copilot") return "Copilot";
  return titleizeOpenCodeName(id);
}

export const opencodeDetectionSpec: DetectionSpec = {
  kind: "opencode",
  label: "OpenCode",
  binary: "opencode",
  loginCommand: "opencode providers login",
  capabilities: opencodeDefaultCapabilities,
  update: {
    builtIn: { binary: "opencode", args: ["upgrade"] },
    npm: "opencode-ai",
  },
  statusProbe: async (ctx) => (await probeOpenCodeDetection(ctx)).status,
  authProbes: [
    // Auth file lives on the host; for WSL projects we report "unknown"
    // (`undefined` skips the probe) because the WSL distro has its own
    // copy under `$HOME/.local/share/opencode/auth.json`.
    configFileAuthProbe((loc) => (loc.kind === "wsl" ? undefined : opencodeNativeAuthPath())),
  ],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;

    // Block old binaries before either probe path: parseOpenCodeVerboseModels
    // happens to handle pre-1.14 output but the SDK call would silently
    // misbehave, and the GUI session can't recover. Surface the issue early.
    if (ctx.version && compareOpencodeSemver(ctx.version, OPENCODE_MIN_VERSION) < 0) {
      console.warn(
        `[opencode] detected version ${ctx.version} is below the supported minimum ${OPENCODE_MIN_VERSION}. ` +
          `Models and chat will be disabled until OpenCode is upgraded (run \`opencode upgrade\` or reinstall).`,
      );
      return undefined;
    }

    return (await probeOpenCodeDetection(ctx)).capabilities;
  },
};

function orderEffortsCanonically(seen: Set<string>): string[] {
  const ordered: string[] = [];
  for (const effort of CANONICAL_EFFORT_ORDER) {
    if (seen.has(effort)) {
      ordered.push(effort);
      seen.delete(effort);
    }
  }
  // Append any non-canonical variant names OpenCode reported, preserving
  // discovery order — keeps us forward-compatible with new variants.
  for (const effort of seen) ordered.push(effort);
  return ordered;
}

function defaultEffortFor(ordered: readonly string[]): { defaultEffort?: string } {
  if (ordered.includes(OPENCODE_PREFERRED_DEFAULT_EFFORT)) {
    return { defaultEffort: OPENCODE_PREFERRED_DEFAULT_EFFORT };
  }
  return ordered.length > 0 ? { defaultEffort: ordered[0]! } : {};
}

/**
 * Build the `capabilitiesProbe` return value from the CLI-parsed model list.
 * Used as the fallback when the SDK probe is unavailable.
 */
export function buildCapabilityPartialFromProbedModels(
  probed: readonly OpenCodeProbedModel[],
): Partial<AgentCapability> {
  const modelIds = probed.map((m) => m.id);
  const subProviderIds = [...new Set(modelIds.map(openCodeModelSubProvider).filter(isString))];

  // Per-model variant lists feed the composer effort picker via
  // `getAvailableEfforts(capabilities, model)` — empty arrays mean "no
  // effort selector for this model", which is the right default for free
  // models like `opencode/big-pickle` whose `variants: {}` we already saw.
  const modelEfforts: Record<string, string[]> = {};
  const seenEfforts = new Set<string>();
  for (const m of probed) {
    modelEfforts[m.id] = m.variants;
    for (const v of m.variants) seenEfforts.add(v);
  }
  const ordered = orderEffortsCanonically(seenEfforts);

  // Map each model to its registry-reported context limit so the renderer's
  // context-usage dock can show "X / Y tokens" before any message has flowed
  // through `context.updated`.
  const modelTokens = new Map<string, number>();
  for (const m of probed) {
    if (m.contextLimit !== undefined) modelTokens.set(m.id, m.contextLimit);
  }

  return {
    models: modelIds.map((id) => ({ id, label: humanizeOpenCodeModelId(id) })),
    subProviders: subProviderIds.map((id) => ({
      id,
      label: humanizeOpenCodeSubProviderId(id),
    })),
    efforts: ordered,
    modelEfforts,
    ...defaultEffortFor(ordered),
    ...buildContextSizeCapabilities(modelTokens),
  };
}

/**
 * Build the `capabilitiesProbe` return value from a successful SDK inventory.
 *
 * The SDK gives us richer data than the CLI parser:
 *   - per-provider model names (so we don't need slug-titleization heuristics)
 *   - `connected` provider ids (we filter out providers with no upstream auth)
 *   - per-model `variants` keyed by id (same shape as the CLI parser)
 *   - per-model `limit.context` token counts
 *   - the list of user-defined agents (custom `~/.config/opencode/agent/*`)
 *
 * Returned shape exactly matches `buildCapabilityPartialFromProbedModels` so
 * the renderer treats the two paths interchangeably.
 */
export function buildCapabilityPartialFromSdkInventory(
  inventory: OpenCodeSdkInventory,
): Partial<AgentCapability> {
  const connected = new Set(inventory.connected);
  const models: Array<{ id: string; label: string }> = [];
  const subProviderIds = new Set<string>();
  const modelEfforts: Record<string, string[]> = {};
  const seenEfforts = new Set<string>();
  const modelTokens = new Map<string, number>();

  for (const provider of inventory.providers) {
    // OpenCode reports both authenticated and pseudo "available" providers in
    // `all`. The renderer's picker should only show models the user can
    // actually call right now, so filter to the `connected` set.
    if (!connected.has(provider.id)) continue;
    subProviderIds.add(provider.id);
    for (const model of provider.models) {
      const slug = `${provider.id}/${model.id}`;
      const label =
        model.name.trim().length > 0 ? model.name.trim() : humanizeOpenCodeModelId(slug);
      models.push({ id: slug, label });
      modelEfforts[slug] = [...model.variants];
      for (const variant of model.variants) seenEfforts.add(variant);
      if (model.contextLimit !== undefined) modelTokens.set(slug, model.contextLimit);
    }
  }

  const ordered = orderEffortsCanonically(seenEfforts);

  return {
    models: models.toSorted((left, right) => left.label.localeCompare(right.label)),
    subProviders: [...subProviderIds].map((id) => ({
      id,
      label: humanizeOpenCodeSubProviderId(id),
    })),
    efforts: ordered,
    modelEfforts,
    ...defaultEffortFor(ordered),
    ...buildContextSizeCapabilities(modelTokens),
  };
}
