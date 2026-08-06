import { stripAnsi } from "@/shared/ansi";
import type { AgentCapability, LabeledOption } from "@/shared/contracts";
import { spawnAgentPty } from "@/supervisor/oneShotSpawn";
import { buildAgentCommand, type DetectProbeCtx } from "../base";

const TEXT_MODEL_HINT = /\b(?:claude|gemini|gpt|opus|sonnet|haiku|flash|pro|oss)\b/i;
const MARKER_RE = /^\s*(?:[-*\u2022]\s+|\d+[.)]\s+|\[[ xX]\]\s*)/;
const EFFORT_ORDER = ["Low", "Medium", "High"];
const DEFAULT_EFFORT_SLUGS = ["low", "medium", "high"];

type AntigravityModelCapabilities = Pick<
  AgentCapability,
  "models" | "efforts" | "modelEfforts" | "defaultEffort"
>;

export interface AntigravityLaunchDialect {
  separateModelEffort: boolean;
}

export interface AntigravityProbeResult {
  capabilities?: AntigravityModelCapabilities;
  dialect: AntigravityLaunchDialect;
}

export interface AntigravityModelVariant {
  model: string;
  label?: string;
  effort?: string;
  cliModel: string;
  cliSlug?: string;
  provider?: string;
}

export const ANTIGRAVITY_KNOWN_MODEL_VARIANTS: AntigravityModelVariant[] = [
  {
    model: "Gemini 3.6 Flash",
    effort: "Medium",
    cliModel: "Gemini 3.6 Flash (Medium)",
    cliSlug: "gemini-3.6-flash-medium",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.6 Flash",
    effort: "High",
    cliModel: "Gemini 3.6 Flash (High)",
    cliSlug: "gemini-3.6-flash-high",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.6 Flash",
    effort: "Low",
    cliModel: "Gemini 3.6 Flash (Low)",
    cliSlug: "gemini-3.6-flash-low",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.5 Flash",
    effort: "Medium",
    cliModel: "Gemini 3.5 Flash (Medium)",
    cliSlug: "gemini-3.5-flash-medium",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.5 Flash",
    effort: "High",
    cliModel: "Gemini 3.5 Flash (High)",
    cliSlug: "gemini-3.5-flash-high",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.5 Flash",
    effort: "Low",
    cliModel: "Gemini 3.5 Flash (Low)",
    cliSlug: "gemini-3.5-flash-low",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.1 Pro",
    effort: "Low",
    cliModel: "Gemini 3.1 Pro (Low)",
    cliSlug: "gemini-3.1-pro-low",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.1 Pro",
    effort: "High",
    cliModel: "Gemini 3.1 Pro (High)",
    cliSlug: "gemini-3.1-pro-high",
    provider: "Google DeepMind",
  },
  {
    model: "Claude Sonnet 4.6",
    effort: "Thinking",
    cliModel: "Claude Sonnet 4.6 (Thinking)",
    cliSlug: "claude-sonnet-4-6",
    provider: "Anthropic",
  },
  {
    model: "Claude Opus 4.6",
    effort: "Thinking",
    cliModel: "Claude Opus 4.6 (Thinking)",
    cliSlug: "claude-opus-4-6-thinking",
    provider: "Anthropic",
  },
  {
    model: "GPT-OSS 120B",
    effort: "Medium",
    cliModel: "GPT-OSS 120B (Medium)",
    cliSlug: "gpt-oss-120b-medium",
    provider: "OpenAI",
  },
];

function labelFromId(id: string): string {
  if (/\s|[()]/.test(id)) return id;
  return id
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (/^(gpt|oss|glm|ai)$/.test(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function cleanModelId(value: string): string {
  return value
    .trim()
    .replace(/^`|`$/g, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+\((?:default|current|selected)\)$/i, "")
    .trim();
}

/** Split an `agy` `"Model (Effort)"` display string into its parts. */
export function splitModelEffort(value: string): { model: string; effort: string } | undefined {
  const match = /^(.*?)\s+\(([^()]+)\)$/.exec(value.trim());
  const model = match?.[1]?.trim();
  const effort = match?.[2]?.trim();
  return model && effort ? { model, effort } : undefined;
}

function splitCliModel(
  value: string,
  provider?: string,
  effortSlugs: readonly string[] = DEFAULT_EFFORT_SLUGS,
): AntigravityModelVariant | undefined {
  const cleaned = cleanModelId(value);
  const parts = splitModelEffort(cleaned);
  if (!parts) return splitSlugModel(cleaned, provider, effortSlugs);
  return {
    ...parts,
    cliModel: `${parts.model} (${parts.effort})`,
    ...(provider ? { provider } : {}),
  };
}

function providerFromModel(model: string): string | undefined {
  if (model.startsWith("Gemini ")) return "Google DeepMind";
  if (model.startsWith("Claude ")) return "Anthropic";
  if (model.startsWith("GPT-")) return "OpenAI";
  return undefined;
}

function modelFromSlug(slug: string): string {
  const gemini = /^gemini-(\d+(?:\.\d+)?)-(.+)$/.exec(slug);
  if (gemini) return `Gemini ${gemini[1]} ${labelFromId(gemini[2] ?? "")}`.trim();

  const claude = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)$/.exec(slug);
  if (claude) {
    return `Claude ${labelFromId(claude[1] ?? "")} ${claude[2]}.${claude[3]}`;
  }

  const gptOss = /^gpt-oss-(.+)$/.exec(slug);
  if (gptOss) return `GPT-OSS ${(gptOss[1] ?? "").replace(/b$/i, "B")}`.trim();

  return labelFromId(slug);
}

/** Parse the kebab-case IDs emitted by `agy models` since Agy 1.1.5. */
function splitSlugModel(
  value: string,
  provider?: string,
  effortSlugs: readonly string[] = DEFAULT_EFFORT_SLUGS,
): AntigravityModelVariant | undefined {
  if (!/^[a-z0-9.]+(?:-[a-z0-9.]+)+$/i.test(value)) return undefined;

  const normalized = value.toLowerCase();
  const effortSlug = [...effortSlugs]
    .map((effort) => effort.toLowerCase())
    .sort((left, right) => right.length - left.length)
    .find((effort) => normalized.endsWith(`-${effort}`));
  const effort = effortSlug ? labelFromId(effortSlug) : undefined;
  const baseSlug = effortSlug ? normalized.slice(0, -(effortSlug.length + 1)) : normalized;
  const known = ANTIGRAVITY_KNOWN_MODEL_VARIANTS.find((variant) => variant.cliSlug === normalized);

  if (!effort) {
    if (known) {
      const resolvedProvider = provider ?? known.provider;
      return {
        model: normalized,
        label: known.model,
        cliModel: normalized,
        ...(resolvedProvider ? { provider: resolvedProvider } : {}),
      };
    }

    const label = modelFromSlug(baseSlug);
    const resolvedProvider = provider ?? providerFromModel(label);
    return {
      model: baseSlug,
      label,
      cliModel: normalized,
      ...(resolvedProvider ? { provider: resolvedProvider } : {}),
    };
  }

  const label = known?.model ?? modelFromSlug(baseSlug);
  const resolvedProvider = provider ?? known?.provider ?? providerFromModel(label);
  return {
    model: baseSlug,
    label,
    effort,
    cliModel: normalized,
    ...(resolvedProvider ? { provider: resolvedProvider } : {}),
  };
}

function isSkippableLine(line: string): boolean {
  if (!line || /^[-\u2014_=\s]+$/.test(line)) return true;
  return /^(?:available\s+)?models?\s*:?$/i.test(line) || /^usage\b/i.test(line);
}

function candidateFromObject(
  value: Record<string, unknown>,
  effortSlugs: readonly string[],
): AntigravityModelVariant | undefined {
  const idValue = value.id ?? value.modelId ?? value.model ?? value.value ?? value.name;
  if (typeof idValue !== "string") return undefined;
  const providerValue = value.description ?? value.provider ?? value.vendor;
  const provider =
    typeof providerValue === "string" && providerValue.trim() ? providerValue.trim() : undefined;
  return splitCliModel(idValue, provider, effortSlugs);
}

function collectJsonModels(
  value: unknown,
  out: AntigravityModelVariant[],
  effortSlugs: readonly string[],
): void {
  if (typeof value === "string") {
    const variant = splitCliModel(value, undefined, effortSlugs);
    if (variant) out.push(variant);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonModels(item, out, effortSlugs);
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const candidate = candidateFromObject(obj, effortSlugs);
  if (candidate) out.push(candidate);
  for (const key of ["models", "items", "data", "availableModels"]) {
    if (key in obj) collectJsonModels(obj[key], out, effortSlugs);
  }
}

function candidateFromTextCells(
  cells: string[],
  effortSlugs: readonly string[],
): AntigravityModelVariant | undefined {
  const normalized = cells.map(cleanModelId).filter(Boolean);
  if (normalized.length === 0) return undefined;
  if (normalized.every((cell) => /^:?-{3,}:?$/.test(cell))) return undefined;
  const [id, _labelCandidate, descriptionCandidate] = normalized;
  if (!id || /^(?:id|model|name)$/i.test(id)) return undefined;
  if (!/[\w./-]/.test(id) && !TEXT_MODEL_HINT.test(id)) return undefined;
  return splitCliModel(id, descriptionCandidate, effortSlugs);
}

function textLineToCandidate(
  line: string,
  effortSlugs: readonly string[],
): AntigravityModelVariant | undefined {
  let cleaned = line.replace(MARKER_RE, "").trim();
  cleaned = cleaned.replace(/^\*\s*/, "").trim();
  if (isSkippableLine(cleaned)) return undefined;

  if (cleaned.startsWith("|") && cleaned.endsWith("|")) {
    return candidateFromTextCells(
      cleaned
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
      effortSlugs,
    );
  }

  const columnCells = cleaned.split(/\s{2,}|\t+/).filter(Boolean);
  if (columnCells.length > 1) return candidateFromTextCells(columnCells, effortSlugs);

  const separatorMatch = /^(.*?)\s+(?:[-\u2013\u2014:]|=>)\s+(.*)$/.exec(cleaned);
  if (separatorMatch)
    return candidateFromTextCells([separatorMatch[1] ?? "", separatorMatch[2] ?? ""], effortSlugs);

  const id = cleanModelId(cleaned);
  if (!id || (!TEXT_MODEL_HINT.test(id) && !/[./-]/.test(id))) return undefined;
  return splitCliModel(id, undefined, effortSlugs);
}

function dedupeVariants(variants: AntigravityModelVariant[]): AntigravityModelVariant[] {
  const seen = new Set<string>();
  const result: AntigravityModelVariant[] = [];
  for (const variant of variants) {
    if (seen.has(variant.cliModel)) continue;
    seen.add(variant.cliModel);
    result.push(variant);
  }
  return result;
}

function sortEfforts(efforts: string[]): string[] {
  return [...efforts].sort((left, right) => {
    const leftIndex = EFFORT_ORDER.indexOf(left);
    const rightIndex = EFFORT_ORDER.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (
        (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
      );
    }
    return left.localeCompare(right);
  });
}

export function buildAntigravityModelCapabilities(
  variants: AntigravityModelVariant[],
): Pick<AgentCapability, "models" | "efforts" | "modelEfforts" | "defaultEffort"> {
  const models: LabeledOption[] = [];
  const modelEfforts: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const variant of variants) {
    if (!seen.has(variant.model)) {
      seen.add(variant.model);
      models.push({
        id: variant.model,
        label: variant.label ?? labelFromId(variant.model),
        ...(variant.provider ? { description: variant.provider } : {}),
      });
    }
    const efforts = modelEfforts[variant.model] ?? [];
    if (variant.effort) efforts.push(variant.effort);
    modelEfforts[variant.model] = efforts;
  }
  for (const [model, efforts] of Object.entries(modelEfforts)) {
    modelEfforts[model] = sortEfforts(efforts);
  }
  // Prefer "Medium" as the cross-model default when any model offers it; otherwise
  // fall back to the lowest-ranked effort actually present so the default is never
  // an effort no model supports.
  const allEfforts = sortEfforts([...new Set(Object.values(modelEfforts).flat())]);
  const defaultEffort = allEfforts.includes("Medium") ? "Medium" : allEfforts[0];
  return { models, efforts: [], modelEfforts, defaultEffort };
}

export function parseAntigravityEffortsHelp(raw: string): string[] {
  const effortLine = stripAnsi(raw)
    .split(/\r\n|\r|\n/)
    .find((line) => /--effort\b/.test(line));
  const values = /\(([^()]*\|[^()]*)\)/.exec(effortLine ?? "")?.[1];
  return values
    ? values
        .split("|")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : [];
}

export function detectAntigravityLaunchDialect(
  helpRaw: string,
  modelsRaw: string,
): AntigravityLaunchDialect {
  const help = stripAnsi(helpRaw);
  const effortSlugs = parseAntigravityEffortsHelp(help);
  const variants = parseAntigravityModelVariantsOutput(
    modelsRaw,
    effortSlugs.length > 0 ? effortSlugs : DEFAULT_EFFORT_SLUGS,
  );
  const emitsStableSlugs = variants.some(
    (variant) =>
      variant.cliModel === variant.cliModel.toLowerCase() &&
      /^[a-z0-9.]+(?:-[a-z0-9.]+)+$/.test(variant.cliModel),
  );

  return {
    separateModelEffort:
      /(?:^|\s)--model\b/m.test(help) && effortSlugs.length > 0 && emitsStableSlugs,
  };
}

export function parseAntigravityModelVariantsOutput(
  raw: string,
  effortSlugs: readonly string[] = DEFAULT_EFFORT_SLUGS,
): AntigravityModelVariant[] {
  const text = stripAnsi(raw).trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    const variants: AntigravityModelVariant[] = [];
    collectJsonModels(parsed, variants, effortSlugs);
    if (variants.length > 0) return dedupeVariants(variants);
  } catch {
    // `agy models` is documented as a shell subcommand but not as JSON-only.
  }

  // PTY probes can leave spinner redraws separated by bare carriage returns
  // immediately before the first model row. Treat every redraw boundary as a
  // line boundary so that first row is not swallowed by the spinner text.
  const lines = text.split(/\r\n|\r|\n/);
  return dedupeVariants(
    lines
      .map((line) => textLineToCandidate(line, effortSlugs))
      .filter((variant): variant is AntigravityModelVariant => variant !== undefined),
  );
}

export function parseAntigravityModelsOutput(raw: string): LabeledOption[] {
  return buildAntigravityModelCapabilities(parseAntigravityModelVariantsOutput(raw)).models;
}

export async function probeAntigravityRuntime(
  ctx: DetectProbeCtx,
): Promise<AntigravityProbeResult> {
  if (!ctx.executablePath) {
    return { dialect: { separateModelEffort: false } };
  }
  const executablePath = ctx.executablePath;
  const readProbe = async (args: string[]) => {
    const spec = buildAgentCommand(ctx.location, executablePath, args, undefined, ctx.probeEnv);
    try {
      return {
        ok: true,
        output: await spawnAgentPty(spec, "", 10_000),
      };
    } catch {
      return { ok: false, output: "" };
    }
  };
  const [modelsResult, helpResult] = await Promise.all([
    readProbe(["models"]),
    readProbe(["--help"]),
  ]);
  const helpRaw = helpResult.ok ? helpResult.output : "";
  const modelsRaw = modelsResult.ok ? modelsResult.output : "";
  const dialect = detectAntigravityLaunchDialect(helpRaw, modelsRaw);
  if (!modelsResult.ok) return { dialect };
  const probedEfforts = helpResult.ok ? parseAntigravityEffortsHelp(helpRaw) : [];
  const variants = parseAntigravityModelVariantsOutput(
    modelsRaw,
    probedEfforts.length > 0 ? probedEfforts : DEFAULT_EFFORT_SLUGS,
  );
  return {
    dialect,
    ...(variants.length > 0 ? { capabilities: buildAntigravityModelCapabilities(variants) } : {}),
  };
}

export async function probeAntigravityModels(
  ctx: DetectProbeCtx,
): Promise<AntigravityModelCapabilities | undefined> {
  return (await probeAntigravityRuntime(ctx)).capabilities;
}
