import { stripAnsi } from "@/shared/ansi";
import type {
  AgentCapability,
  AgentAuthMethod,
  AgentProviderMetadata,
  AuthState,
  LabeledOption,
  ProjectLocation,
} from "@/shared/contracts";
import { compactAgentProviderMetadata } from "@/shared/contracts";
import { parseCursorModelId } from "@/shared/cursorModelId";
import {
  buildAgentCommand,
  readAgentCommandOutput,
  readCommandOutputAsync,
  readWslLoginShellCommandOutputAsync,
  type AgentEnvContext,
  type CapabilitiesProbeResult,
  type CommandSpec,
  type DetectionSpec,
} from "../base";
import { dedupeAcpAuthMethods, probeAcpCapabilities } from "../acp";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";

export const cursorDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default Approvals" },
    { id: "never", label: "YOLO" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "never",
  bypassPermissions: { approvalPolicy: "never" },
  settingDefs: [],
};

const CURSOR_EXISTING_LOGIN_METHOD_ID = "cursor_login";

export function buildCursorTerminalAuthMethod(location: ProjectLocation): AgentAuthMethod {
  return {
    type: "terminal",
    id: "cursor-agent-login",
    name: "Cursor login",
    args: ["login"],
    ...(location.kind === "wsl" ? { env: { NO_OPEN_BROWSER: "1" } } : {}),
  };
}

function cursorAuthMethods(
  location: ProjectLocation,
  acpAuthMethods: AgentAuthMethod[] | undefined,
): AgentAuthMethod[] {
  return [
    buildCursorTerminalAuthMethod(location),
    ...(acpAuthMethods?.filter((method) => method.id !== CURSOR_EXISTING_LOGIN_METHOD_ID) ?? []),
  ];
}

const MODEL_LINE_RE = /^([^\s-]+(?:-[^\s-]+)*)\s+-\s+(.+)$/;

export function buildCursorProbeSpec(
  executablePath: string,
  args: string[],
  cwd?: string,
): CommandSpec {
  // When no cwd is supplied, posix callers spawn from the contained probe dir
  // (see probeCwd.ts) rather than process.cwd() — cursor-agent indexes its cwd
  // at probe time and would otherwise trip macOS TCC prompts. Windows callers
  // still default to process.cwd() since TCC is macOS-only.
  const isWindows = process.platform === "win32";
  const resolvedCwd =
    cwd ?? (isWindows ? process.cwd() : getAgentProbeCwd({ kind: "posix", path: process.cwd() }));
  const location: ProjectLocation = isWindows
    ? { kind: "windows", path: resolvedCwd }
    : { kind: "posix", path: resolvedCwd };
  return buildAgentCommand(location, executablePath, args);
}

async function readCursorProbeOutputAsync(
  executablePath: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const spec = buildCursorProbeSpec(executablePath, args);
  return readCommandOutputAsync(spec.command, spec.args, {
    ...(spec.cwd ? { cwd: spec.cwd } : {}),
    ...(spec.env ? { env: spec.env } : {}),
  });
}

export function parseCursorLogoutHelpOutput(output: string): boolean {
  const text = stripAnsi(output);
  return /Usage:\s+agent\s+logout\b/i.test(text) && /clear stored authentication/i.test(text);
}

async function probeCursorLogoutSupport(
  ctx: Parameters<NonNullable<DetectionSpec["capabilitiesProbe"]>>[0],
): Promise<boolean> {
  if (!ctx.executablePath) return false;
  const probeCwd = getAgentProbeCwd(ctx.location);
  const result = await readAgentCommandOutput(
    ctx.location,
    ctx.executablePath,
    ["logout", "--help"],
    {
      timeoutMs: 5_000,
      wslLinuxCwd: "/tmp",
      posixCwd: probeCwd,
    },
  );
  return parseCursorLogoutHelpOutput(`${result.stdout}\n${result.stderr}`);
}

export function parseCursorModels(output: string): LabeledOption[] {
  const models: LabeledOption[] = [];
  const seen = new Set<string>();

  for (const rawLine of stripAnsi(output).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(Available|Tip:|Loading)/i.test(line)) continue;

    const match = MODEL_LINE_RE.exec(line);
    if (!match) continue;

    const id = match[1]!;
    const label = match[2]!.replace(/\s*\([^)]*\)\s*/g, "").trim();
    if (!id || !label) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    models.push({ id, label });
  }

  if (!seen.has("auto")) {
    models.unshift({ id: "auto", label: "Auto" });
  } else {
    const idx = models.findIndex((m) => m.id === "auto");
    if (idx > 0) {
      const [auto] = models.splice(idx, 1);
      models.unshift(auto!);
    }
  }

  return models.length > 0 ? sortCursorModels(models) : [{ id: "auto", label: "Auto" }];
}

function stripCursorModelModifiers(label: string): string {
  const cleaned = label
    .replace(/\bFast\b/gi, "")
    .replace(/\b1M\b/gi, "")
    .replace(/\bThinking\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : label;
}

function cursorBaseModelId(id: string): string {
  return parseCursorModelId(id).baseId;
}

function isCursorFastModel(model: LabeledOption): boolean {
  return /\bfast\b/i.test(model.label) || /-fast$/i.test(model.id);
}

function cursorDefaultContextId(baseId: string, label: string): string {
  if (/^gpt-/i.test(baseId)) return "272k";
  if (/^claude-opus-4-7\b/i.test(baseId) || /\bopus\s+4\.7\b/i.test(label)) return "300k";
  if (/^claude-/i.test(baseId) || /\b(?:opus|sonnet|haiku)\b/i.test(label)) return "200k";
  return "default";
}

function cursorContextId(baseId: string, model: LabeledOption): string {
  return /\b1M\b/i.test(model.label) ? "1m" : cursorDefaultContextId(baseId, model.label);
}

function cursorEffortId(model: LabeledOption): string | undefined {
  const label = model.label.toLowerCase();
  if (/-max(?=$|-thinking(?:-fast)?$|-fast$)/i.test(model.id)) {
    return "max";
  }
  if (
    /\bextra\s+high\b/.test(label) ||
    /-(?:xhigh|extra-high)(?=$|-thinking(?:-fast)?$|-fast$)/i.test(model.id)
  ) {
    return "xhigh";
  }
  if (/\bhigh\b/.test(label) || /-high(?=$|-thinking(?:-fast)?$|-fast$)/i.test(model.id)) {
    return "high";
  }
  if (/\blow\b/.test(label) || /-low(?=$|-thinking(?:-fast)?$|-fast$)/i.test(model.id)) {
    return "low";
  }
  if (/\bnone\b/.test(label) || /-none(?=$|-thinking(?:-fast)?$|-fast$)/i.test(model.id)) {
    return "none";
  }
  if (/\bmedium\b/.test(label) || /-medium(?=$|-thinking(?:-fast)?$|-fast$)/i.test(model.id)) {
    return "medium";
  }
  return undefined;
}

function stripCursorEffort(label: string, effort?: string): string {
  const pattern =
    effort === "xhigh"
      ? /\bExtra\s+High\b/gi
      : effort === "max"
        ? /\bMax\b/gi
        : effort
          ? new RegExp(`\\b${effort}\\b`, "gi")
          : undefined;
  const cleaned = (pattern ? label.replace(pattern, "") : label).replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : label;
}

function isCursorThinkingModel(model: LabeledOption): boolean {
  return /\bthinking\b/i.test(model.label) || /-thinking(?:-fast)?$/i.test(model.id);
}

export function buildCursorModelPickerCapabilities(
  models: LabeledOption[],
): Pick<
  AgentCapability,
  | "models"
  | "efforts"
  | "defaultEffort"
  | "modelEfforts"
  | "contextSizes"
  | "modelContextSizes"
  | "defaultContextSize"
  | "fastModels"
  | "thinkingModels"
> {
  const grouped = new Map<
    string,
    {
      model: LabeledOption;
      contexts: string[];
      efforts: string[];
      fast: boolean;
      thinking: boolean;
    }
  >();

  for (const model of models) {
    const baseId = cursorBaseModelId(model.id);
    const context = cursorContextId(baseId, model);
    const effort = cursorEffortId(model);
    let group = grouped.get(baseId);
    if (!group) {
      group = {
        model: {
          id: baseId,
          label: stripCursorEffort(stripCursorModelModifiers(model.label), effort),
        },
        contexts: [],
        efforts: [],
        fast: false,
        thinking: false,
      };
      grouped.set(baseId, group);
    }
    if (!group.contexts.includes(context)) {
      group.contexts.push(context);
    }
    if (isCursorFastModel(model)) {
      group.fast = true;
    }
    if (isCursorThinkingModel(model)) {
      group.thinking = true;
    }
    if (effort && !group.efforts.includes(effort)) {
      group.efforts.push(effort);
    }
  }

  const displayModels = [...grouped.values()].map((group) => group.model);
  const contextIds = new Set<string>();
  const effortIds = new Set<string>();
  const modelEfforts: Record<string, string[]> = {};
  const modelContextSizes: Record<string, string[]> = {};
  const fastModels: string[] = [];
  const thinkingModels: string[] = [];
  for (const [modelId, group] of grouped) {
    const defaultContext = cursorDefaultContextId(modelId, group.model.label);
    if (
      defaultContext !== "default" &&
      group.contexts.includes("1m") &&
      !group.contexts.includes(defaultContext)
    ) {
      group.contexts.push(defaultContext);
    }
    const orderedEfforts = sortCursorEffortIds(group.efforts);
    modelEfforts[modelId] = orderedEfforts;
    for (const effort of orderedEfforts) {
      effortIds.add(effort);
    }
    if (group.contexts.length > 1) {
      const orderedContexts = sortCursorContextIds(group.contexts);
      modelContextSizes[modelId] = orderedContexts;
      for (const context of orderedContexts) {
        contextIds.add(context);
      }
    } else if (group.contexts.length === 1 && group.contexts[0] !== "default") {
      // Single-context models get a display-only mapping (the concrete size
      // id like "200k"); we deliberately don't add it to `contextIds`, so the
      // composer's filter on `contextSizes` yields empty and no single-option
      // picker shows. The renderer's model row falls back to `id.toUpperCase()`
      // to render "200K" / "1M" in the muted description.
      modelContextSizes[modelId] = [group.contexts[0]!];
    }
    if (group.fast) {
      fastModels.push(modelId);
    }
    if (group.thinking) {
      thinkingModels.push(modelId);
    }
  }

  const contextSizes = [
    ...(contextIds.has("default") ? [{ id: "default", label: "Default" }] : []),
    ...(contextIds.has("200k") ? [{ id: "200k", label: "200K" }] : []),
    ...(contextIds.has("272k") ? [{ id: "272k", label: "272K" }] : []),
    ...(contextIds.has("300k") ? [{ id: "300k", label: "300K" }] : []),
    ...(contextIds.has("1m") ? [{ id: "1m", label: "1M" }] : []),
  ];

  return {
    models: displayModels,
    efforts: sortCursorEffortIds([...effortIds]),
    ...(effortIds.has("medium") ? { defaultEffort: "medium" } : {}),
    modelEfforts,
    ...(contextSizes.length > 1 ? { contextSizes } : {}),
    ...(Object.keys(modelContextSizes).length > 0 ? { modelContextSizes } : {}),
    defaultContextSize: "default",
    ...(fastModels.length > 0 ? { fastModels } : {}),
    ...(thinkingModels.length > 0 ? { thinkingModels } : {}),
  };
}

function parseCursorAcpModelParams(id: string): Record<string, string> {
  const match = /\[([^\]]*)\]/.exec(id);
  const raw = match?.[1]?.trim();
  if (!raw) return {};

  const params: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [rawKey, rawValue] = part.split("=");
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (key && value) params[key] = value;
  }
  return params;
}

function cursorAcpBaseModelId(id: string): string {
  return id.replace(/\[[^\]]*\]/g, "");
}

function formatCursorAcpBaseLabel(baseId: string, fallbackLabel: string): string {
  if (baseId === "default") return "Auto";
  if (/^composer-(\d+)$/i.test(baseId)) {
    return baseId.replace(/^composer-(\d+)$/i, "Composer $1");
  }

  const codexMatch = /^gpt-(\d+(?:\.\d+)?)-codex(?:-(spark|max|mini))?$/i.exec(baseId);
  if (codexMatch) {
    const suffix = codexMatch[2]
      ? ` ${codexMatch[2].charAt(0).toUpperCase()}${codexMatch[2].slice(1)}`
      : "";
    return `Codex ${codexMatch[1]}${suffix}`;
  }

  const gptMatch = /^gpt-(\d+(?:\.\d+)?)(?:-(mini|nano))?$/i.exec(baseId);
  if (gptMatch) {
    const suffix = gptMatch[2]
      ? ` ${gptMatch[2].charAt(0).toUpperCase()}${gptMatch[2].slice(1)}`
      : "";
    return `GPT-${gptMatch[1]}${suffix}`;
  }

  const claudeMatch = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?$/i.exec(baseId);
  if (claudeMatch) {
    const family = claudeMatch[1]!;
    const version = claudeMatch[3] ? `${claudeMatch[2]}.${claudeMatch[3]}` : claudeMatch[2]!;
    return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version}`;
  }

  const familyMatch = /^(gemini|grok|kimi)-(.+)$/i.exec(baseId);
  const labelSource = familyMatch ? `${familyMatch[1]}-${familyMatch[2]}` : fallbackLabel || baseId;
  return labelSource
    .replace(/\[[^\]]*\]/g, "")
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCursorAcpParamLabel(key: string, value: string): string | undefined {
  if (key === "context") return value.toUpperCase();
  if (key === "reasoning" || key === "effort") {
    if (value === "xhigh") return "Extra High";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  if (key === "thinking") return undefined;
  if (key === "fast") return value === "true" ? "Fast" : undefined;
  return undefined;
}

function formatCursorAcpModelLabel(model: LabeledOption): string {
  const baseId = cursorAcpBaseModelId(model.id);
  const baseLabel = formatCursorAcpBaseLabel(baseId, model.label);
  const params = parseCursorAcpModelParams(model.id);
  const paramLabels = ["context", "reasoning", "effort", "thinking", "fast"]
    .map((key) => {
      const value = params[key];
      return value ? formatCursorAcpParamLabel(key, value) : undefined;
    })
    .filter((label): label is string => Boolean(label));
  return paramLabels.length > 0 ? `${baseLabel} · ${paramLabels.join(" · ")}` : baseLabel;
}

export function buildCursorAcpModelPickerCapabilities(
  models: LabeledOption[],
): Pick<AgentCapability, "models" | "efforts" | "modelEfforts"> {
  const displayModels = models.map((model) => ({
    id: model.id,
    label: formatCursorAcpModelLabel(model),
  }));
  const sortedModels = sortCursorModels(displayModels);

  return {
    models: sortedModels,
    efforts: [],
    modelEfforts: Object.fromEntries(sortedModels.map((model) => [model.id, []])),
  };
}

async function probeCursorAcpCapabilities(
  ctx: Parameters<NonNullable<DetectionSpec["capabilitiesProbe"]>>[0],
): Promise<CapabilitiesProbeResult | undefined> {
  if (!ctx.executablePath) return undefined;
  const spec = buildAgentCommand(ctx.location, "cursor-agent", ["acp"], ctx.executablePath);
  const probeCwd = getAgentProbeCwd(ctx.location);
  const processCwd = resolveProbeSpawnCwd(ctx.location, spec.cwd);
  const result = await probeAcpCapabilities(spec.command, spec.args, probeCwd, {
    ...(processCwd ? { processCwd } : {}),
    timeoutMs: 15_000,
    label:
      ctx.location.kind === "wsl"
        ? `cursor-acp:wsl:${ctx.location.distro}`
        : `cursor-acp:${ctx.location.kind}`,
  });
  if (!result) return undefined;
  const capabilities = result.models?.length
    ? buildCursorAcpModelPickerCapabilities(result.models)
    : undefined;
  const dedupedAuthMethods = result.authMethods?.length
    ? dedupeAcpAuthMethods(result.authMethods)
    : undefined;
  if (
    !capabilities &&
    !dedupedAuthMethods?.length &&
    !result.authLogoutSupported &&
    !result.authState
  ) {
    return undefined;
  }
  return {
    ...(capabilities ?? {}),
    ...(dedupedAuthMethods?.length ? { authMethods: dedupedAuthMethods } : {}),
    ...(result.authLogoutSupported ? { authLogoutSupported: true } : {}),
    ...(result.authState ? { authState: result.authState } : {}),
  };
}

const CURSOR_EFFORT_ORDER: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
};

function sortCursorEffortIds(efforts: string[]): string[] {
  return [...efforts].sort(
    (left, right) =>
      (CURSOR_EFFORT_ORDER[left] ?? 99) - (CURSOR_EFFORT_ORDER[right] ?? 99) ||
      left.localeCompare(right),
  );
}

function sortCursorContextIds(contexts: string[]): string[] {
  const order: Record<string, number> = {
    default: 0,
    "200k": 1,
    "272k": 2,
    "300k": 3,
    "1m": 4,
  };
  return [...contexts].sort(
    (left, right) => (order[left] ?? 99) - (order[right] ?? 99) || left.localeCompare(right),
  );
}

/**
 * Sort models: Auto first, then Composer, then all others grouped by family.
 * Groups sorted by version descending. Within each group:
 * Thinking > non-Thinking, 1M > non-1M, effort descending
 * (Extra High > High > Medium > Low > None > base), Fast before non-Fast
 * within the same tier.
 */
export function sortCursorModels(models: LabeledOption[]): LabeledOption[] {
  const isAutoModel = (model: LabeledOption): boolean =>
    model.id === "auto" || model.label === "Auto";
  const auto = models.filter(isAutoModel);
  const rest = models.filter((m) => !isAutoModel(m));

  const versionOf = (label: string): number => {
    const m = /(\d+(?:\.\d+)?)/.exec(label);
    return m ? Number(m[1]) : 0;
  };

  const groupOf = (label: string): string =>
    label
      .replace(/\b(1M|Max|Fast|Thinking|None|Low|Medium|High|Extra\s+High)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const isComposer = (label: string): boolean => /^Composer\b/i.test(label);
  const isFast = (label: string): boolean => /\bFast\b/i.test(label);
  const is1M = (label: string): boolean => /\b1M\b/i.test(label);
  const isMax = (label: string): boolean => /\bMax\b/i.test(label);
  const isThinking = (label: string): boolean => /\bThinking\b/i.test(label);

  const effortRank = (label: string): number => {
    if (/\bExtra\s+High\b/i.test(label)) return 5;
    if (/\bHigh\b/i.test(label)) return 4;
    if (/\bMedium\b/i.test(label)) return 3;
    if (/\bLow\b/i.test(label)) return 2;
    if (/\bNone\b/i.test(label)) return 1;
    return 3; // no qualifier = medium
  };

  const compareWithinGroup = (a: LabeledOption, b: LabeledOption): number => {
    const x = (isMax(b.label) ? 1 : 0) - (isMax(a.label) ? 1 : 0);
    if (x !== 0) return x;
    const t = (isThinking(b.label) ? 1 : 0) - (isThinking(a.label) ? 1 : 0);
    if (t !== 0) return t;
    const c = (is1M(b.label) ? 1 : 0) - (is1M(a.label) ? 1 : 0);
    if (c !== 0) return c;
    const e = effortRank(b.label) - effortRank(a.label);
    if (e !== 0) return e;
    return (isFast(b.label) ? 1 : 0) - (isFast(a.label) ? 1 : 0);
  };

  // Separate Composer from others
  const composers = rest.filter((m) => isComposer(m.label));
  const others = rest.filter((m) => !isComposer(m.label));

  composers.sort((a, b) => {
    const v = versionOf(b.label) - versionOf(a.label);
    return v !== 0 ? v : compareWithinGroup(a, b);
  });

  // Provider name: leading alpha chars ("GPT-5.4 Mini" → "GPT", "Opus 4.6" → "Opus")
  const providerOf = (key: string): string => key.match(/^[A-Za-z]+/)?.[0] ?? key;

  // Group by model family preserving insertion order
  const groups = new Map<string, LabeledOption[]>();
  for (const m of others) {
    const key = groupOf(m.label);
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(m);
  }

  // Collect sub-groups by provider, preserving insertion order
  const providerGroups = new Map<string, Array<[string, LabeledOption[]]>>();
  const providerMaxVer = new Map<string, number>();
  for (const entry of groups) {
    const p = providerOf(entry[0]);
    const v = versionOf(entry[0]);
    if (v > (providerMaxVer.get(p) ?? 0)) providerMaxVer.set(p, v);
    let arr = providerGroups.get(p);
    if (!arr) {
      arr = [];
      providerGroups.set(p, arr);
    }
    arr.push(entry);
  }

  // Sort providers by max version desc, then sub-groups by version desc within each
  const sortedProviders = [...providerGroups.entries()].sort(
    (a, b) => (providerMaxVer.get(b[0]) ?? 0) - (providerMaxVer.get(a[0]) ?? 0),
  );

  // If a group contains models with explicit effort qualifiers, label bare models as "Medium"
  const hasExplicitEffort = (label: string): boolean =>
    /\b(Extra\s+High|High|Medium|Low|None)\b/i.test(label);
  const needsMediumLabel = (label: string): boolean =>
    !hasExplicitEffort(label) && !isThinking(label);
  const addMediumLabel = (label: string): string =>
    isFast(label) ? label.replace(/\bFast\b/i, "Medium Fast") : `${label} Medium`;

  const sorted: LabeledOption[] = [];
  for (const [, subGroups] of sortedProviders) {
    subGroups.sort((a, b) => versionOf(b[0]) - versionOf(a[0]));
    for (const [, items] of subGroups) {
      if (items.some((m) => hasExplicitEffort(m.label))) {
        for (const m of items) {
          if (needsMediumLabel(m.label)) m.label = addMediumLabel(m.label);
        }
      }
      items.sort(compareWithinGroup);
      sorted.push(...items);
    }
  }

  return [...auto, ...composers, ...sorted];
}

function normalizeCursorField(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseCursorAboutField(output: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}\\s+(.+)$`, "im").exec(stripAnsi(output));
  return normalizeCursorField(match?.[1]);
}

export function parseCursorWhoamiOutput(output: string): {
  authState?: AuthState;
  authenticatedAs?: string;
} {
  const text = stripAnsi(output).trim();
  if (!text) return {};

  const emailMatch = /logged in as\s+(.+)$/im.exec(text);
  if (emailMatch) {
    const authenticatedAs = normalizeCursorField(emailMatch[1]);
    return {
      authState: "authenticated",
      ...(authenticatedAs ? { authenticatedAs } : {}),
    };
  }

  if (/not\s+logged\s+in|login required|sign in/i.test(text)) {
    return { authState: "unknown" };
  }

  return {};
}

export function parseCursorAboutOutput(output: string): AgentProviderMetadata | undefined {
  const authenticatedAs = parseCursorAboutField(output, "User Email");
  const plan = parseCursorAboutField(output, "Subscription Tier");
  return compactAgentProviderMetadata({
    ...(authenticatedAs ? { authenticatedAs } : {}),
    ...(plan ? { plan } : {}),
  });
}

async function probeCursorStatus(ctx: Parameters<NonNullable<DetectionSpec["statusProbe"]>>[0]) {
  if (!ctx.executablePath) return undefined;
  const probeCwd = getAgentProbeCwd(ctx.location);
  const [whoamiResult, aboutResult] = await Promise.all([
    readAgentCommandOutput(ctx.location, ctx.executablePath, ["whoami"], { posixCwd: probeCwd }),
    readAgentCommandOutput(ctx.location, ctx.executablePath, ["about"], { posixCwd: probeCwd }),
  ]);

  const whoami = parseCursorWhoamiOutput(`${whoamiResult.stdout}\n${whoamiResult.stderr}`);
  const about = parseCursorAboutOutput(`${aboutResult.stdout}\n${aboutResult.stderr}`);
  const providerMetadata = compactAgentProviderMetadata({
    ...(about ?? {}),
    ...(whoami.authenticatedAs ? { authenticatedAs: whoami.authenticatedAs } : {}),
  });

  return {
    authState: whoami.authState ?? (whoamiResult.ok ? "authenticated" : "unknown"),
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

export const cursorDetectionSpec: DetectionSpec = {
  kind: "cursor",
  label: "Cursor",
  binary: "cursor-agent",
  loginCommand: "cursor-agent login",
  capabilities: cursorDefaultCapabilities,
  update: {
    builtIn: { binary: "cursor-agent", args: ["update"] },
    homebrewCask: "cursor-cli",
  },
  statusProbe: probeCursorStatus,
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    const cliResultPromise =
      ctx.location.kind === "wsl"
        ? readWslLoginShellCommandOutputAsync(ctx.location.distro, "/tmp", ctx.executablePath, [
            "--list-models",
          ])
        : readCursorProbeOutputAsync(ctx.executablePath, ["--list-models"]);
    const [cliResult, acpProbeResult, logoutSupported] = await Promise.all([
      cliResultPromise,
      probeCursorAcpCapabilities(ctx).catch(() => undefined),
      probeCursorLogoutSupport(ctx).catch(() => false),
    ]);
    const cliModels = cliResult.ok ? parseCursorModels(cliResult.stdout) : [];
    const terminalCapabilities =
      cliModels.length > 0 ? buildCursorModelPickerCapabilities(cliModels) : undefined;
    // The ACP probe carries both presentation-specific model picker capabilities
    // (which belong under `presentationCapabilities.gui`) and adapter-wide auth
    // metadata (which lives at the top level — auth is per-binary, not
    // per-presentation). Split the two so each lands in the right slot.
    const {
      authMethods: acpAuthMethods,
      authLogoutSupported: acpAuthLogoutSupported,
      authState: acpAuthState,
      ...acpGuiCapabilities
    } = acpProbeResult ?? {};
    const authMethods = cursorAuthMethods(ctx.location, acpAuthMethods);
    const hasGuiCapabilities = Object.keys(acpGuiCapabilities).length > 0;
    if (
      !terminalCapabilities &&
      !hasGuiCapabilities &&
      authMethods.length === 0 &&
      !acpAuthLogoutSupported &&
      !logoutSupported &&
      !acpAuthState
    ) {
      return undefined;
    }
    return {
      ...(terminalCapabilities ?? {}),
      ...(hasGuiCapabilities ? { presentationCapabilities: { gui: acpGuiCapabilities } } : {}),
      authMethods,
      ...(acpAuthLogoutSupported || logoutSupported ? { authLogoutSupported: true } : {}),
      ...(acpAuthState ? { authState: acpAuthState } : {}),
    };
  },
};

/**
 * Hooks were introduced in Cursor 1.7. The minimum here is the floor at which
 * `sessionStart` and the agent-loop hooks fire reliably in headless CLI mode.
 * Bump if testing reveals 1.7.x has gaps.
 */
const MIN_CURSOR_SEMVER = [1, 7, 0] as const;

const CURSOR_SEMVER_RE = /(\d+)\.(\d+)\.(\d+)/;

export function parseCursorVersionLine(line: string): [number, number, number] | null {
  const m = CURSOR_SEMVER_RE.exec(stripAnsi(line).trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function semverGte(a: [number, number, number], b: readonly [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] >= b[2];
}

export function isCursorSemverSupportedForHooks(v: [number, number, number] | null): boolean {
  if (!v) return false;
  return semverGte(v, MIN_CURSOR_SEMVER);
}

async function probeCursorCliSemverNative(): Promise<[number, number, number] | null> {
  const result = await readCursorProbeOutputAsync("cursor-agent", ["--version"]);
  const text = result.stdout || result.stderr;
  return text ? parseCursorVersionLine(text) : null;
}

async function probeCursorCliSemverWsl(distro: string): Promise<[number, number, number] | null> {
  const result = await readWslLoginShellCommandOutputAsync(distro, "/tmp", "cursor-agent", [
    "--version",
  ]);
  const text = result.stdout || result.stderr;
  return text ? parseCursorVersionLine(text) : null;
}

export async function probeCursorCliSemver(
  ctx: AgentEnvContext | undefined,
): Promise<[number, number, number] | null> {
  if (ctx?.envKind === "wsl" && ctx.wslDistro) {
    return probeCursorCliSemverWsl(ctx.wslDistro);
  }
  return probeCursorCliSemverNative();
}

export async function isCursorVersionSupportedForHooks(
  ctx: AgentEnvContext | undefined,
): Promise<boolean> {
  return isCursorSemverSupportedForHooks(await probeCursorCliSemver(ctx));
}
