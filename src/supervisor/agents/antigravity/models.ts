import { stripAnsi } from "@/shared/ansi";
import type { AgentCapability, LabeledOption } from "@/shared/contracts";
import { readAgentCommandOutput, type DetectProbeCtx } from "../base";

const TEXT_MODEL_HINT = /\b(?:claude|gemini|gpt|opus|sonnet|haiku|flash|pro|oss)\b/i;
const MARKER_RE = /^\s*(?:[-*\u2022]\s+|\d+[.)]\s+|\[[ xX]\]\s*)/;
const EFFORT_ORDER = ["Low", "Medium", "High"];

export interface AntigravityModelVariant {
  model: string;
  effort: string;
  cliModel: string;
  provider?: string;
}

export const ANTIGRAVITY_KNOWN_MODEL_VARIANTS: AntigravityModelVariant[] = [
  {
    model: "Gemini 3.5 Flash",
    effort: "Medium",
    cliModel: "Gemini 3.5 Flash (Medium)",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.5 Flash",
    effort: "High",
    cliModel: "Gemini 3.5 Flash (High)",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.5 Flash",
    effort: "Low",
    cliModel: "Gemini 3.5 Flash (Low)",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.1 Pro",
    effort: "Low",
    cliModel: "Gemini 3.1 Pro (Low)",
    provider: "Google DeepMind",
  },
  {
    model: "Gemini 3.1 Pro",
    effort: "High",
    cliModel: "Gemini 3.1 Pro (High)",
    provider: "Google DeepMind",
  },
  {
    model: "Claude Sonnet 4.6",
    effort: "Thinking",
    cliModel: "Claude Sonnet 4.6 (Thinking)",
    provider: "Anthropic",
  },
  {
    model: "Claude Opus 4.6",
    effort: "Thinking",
    cliModel: "Claude Opus 4.6 (Thinking)",
    provider: "Anthropic",
  },
  {
    model: "GPT-OSS 120B",
    effort: "Medium",
    cliModel: "GPT-OSS 120B (Medium)",
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

function splitCliModel(value: string, provider?: string): AntigravityModelVariant | undefined {
  const parts = splitModelEffort(cleanModelId(value));
  if (!parts) return undefined;
  return {
    ...parts,
    cliModel: `${parts.model} (${parts.effort})`,
    ...(provider ? { provider } : {}),
  };
}

function isSkippableLine(line: string): boolean {
  if (!line || /^[-\u2014_=\s]+$/.test(line)) return true;
  return /^(?:available\s+)?models?\s*:?$/i.test(line) || /^usage\b/i.test(line);
}

function candidateFromObject(value: Record<string, unknown>): AntigravityModelVariant | undefined {
  const idValue = value.id ?? value.modelId ?? value.model ?? value.value ?? value.name;
  if (typeof idValue !== "string") return undefined;
  const providerValue = value.description ?? value.provider ?? value.vendor;
  const provider =
    typeof providerValue === "string" && providerValue.trim() ? providerValue.trim() : undefined;
  return splitCliModel(idValue, provider);
}

function collectJsonModels(value: unknown, out: AntigravityModelVariant[]): void {
  if (typeof value === "string") {
    const variant = splitCliModel(value);
    if (variant) out.push(variant);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonModels(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const candidate = candidateFromObject(obj);
  if (candidate) out.push(candidate);
  for (const key of ["models", "items", "data", "availableModels"]) {
    if (key in obj) collectJsonModels(obj[key], out);
  }
}

function candidateFromTextCells(cells: string[]): AntigravityModelVariant | undefined {
  const normalized = cells.map(cleanModelId).filter(Boolean);
  if (normalized.length === 0) return undefined;
  if (normalized.every((cell) => /^:?-{3,}:?$/.test(cell))) return undefined;
  const [id, _labelCandidate, descriptionCandidate] = normalized;
  if (!id || /^(?:id|model|name)$/i.test(id)) return undefined;
  if (!/[\w./-]/.test(id) && !TEXT_MODEL_HINT.test(id)) return undefined;
  return splitCliModel(id, descriptionCandidate);
}

function textLineToCandidate(line: string): AntigravityModelVariant | undefined {
  let cleaned = line.replace(MARKER_RE, "").trim();
  cleaned = cleaned.replace(/^\*\s*/, "").trim();
  if (isSkippableLine(cleaned)) return undefined;

  if (cleaned.startsWith("|") && cleaned.endsWith("|")) {
    return candidateFromTextCells(
      cleaned
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
  }

  const columnCells = cleaned.split(/\s{2,}|\t+/).filter(Boolean);
  if (columnCells.length > 1) return candidateFromTextCells(columnCells);

  const separatorMatch = /^(.*?)\s+(?:[-\u2013\u2014:]|=>)\s+(.*)$/.exec(cleaned);
  if (separatorMatch)
    return candidateFromTextCells([separatorMatch[1] ?? "", separatorMatch[2] ?? ""]);

  const id = cleanModelId(cleaned);
  if (!id || (!TEXT_MODEL_HINT.test(id) && !/[./-]/.test(id))) return undefined;
  return splitCliModel(id);
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
        label: labelFromId(variant.model),
        ...(variant.provider ? { description: variant.provider } : {}),
      });
    }
    modelEfforts[variant.model] = [...(modelEfforts[variant.model] ?? []), variant.effort];
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

export function parseAntigravityModelVariantsOutput(raw: string): AntigravityModelVariant[] {
  const text = stripAnsi(raw).trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    const variants: AntigravityModelVariant[] = [];
    collectJsonModels(parsed, variants);
    if (variants.length > 0) return dedupeVariants(variants);
  } catch {
    // `agy models` is documented as a shell subcommand but not as JSON-only.
  }

  return dedupeVariants(
    text
      .split(/\r?\n/)
      .map(textLineToCandidate)
      .filter((variant): variant is AntigravityModelVariant => variant !== undefined),
  );
}

export function parseAntigravityModelsOutput(raw: string): LabeledOption[] {
  return buildAntigravityModelCapabilities(parseAntigravityModelVariantsOutput(raw)).models;
}

export async function probeAntigravityModels(
  ctx: DetectProbeCtx,
): Promise<
  Pick<AgentCapability, "models" | "efforts" | "modelEfforts" | "defaultEffort"> | undefined
> {
  if (!ctx.executablePath) return undefined;
  const result = await readAgentCommandOutput(ctx.location, ctx.executablePath, ["models"], {
    timeoutMs: 10_000,
    wslLinuxCwd: "/tmp",
  });
  if (!result.ok) return undefined;
  const variants = parseAntigravityModelVariantsOutput(result.stdout || result.stderr);
  return variants.length > 0 ? buildAntigravityModelCapabilities(variants) : undefined;
}
