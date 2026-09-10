import { z } from "zod";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { findSelectConfigOption } from "../acp/sessionConfig";

const catalogSchema = z.object({
  families: z.array(
    z.object({
      family_label: z.string().min(1),
      slug: z.string().min(1),
      variants: z
        .array(
          z.object({
            model_uid: z.string().min(1),
            label: z.string().min(1),
            cost_summary: z.string().optional(),
            cost_tier: z.string().optional(),
          }),
        )
        .min(1),
    }),
  ),
});

type Variant = { id: string; effort: string; fast: boolean; thinking: boolean; context: string };
export type DevinModelFamily = {
  id: string;
  label: string;
  description?: string;
  variants: Variant[];
};
const effortOrder = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/** Family membership comes from the CLI, never from opaque model IDs. */
export function parseDevinModelCatalog(raw: string): DevinModelFamily[] {
  const catalog = catalogSchema.parse(JSON.parse(raw));
  return catalog.families.map((family) => ({
    // Keep a real wire ID as the public ID, including when detection is unavailable later.
    id: family.variants[0]!.model_uid,
    label: family.family_label,
    // Preserve provider text, including Free and unknown tiers, so the renderer
    // can show honest ranges without inventing a price for missing variants.
    ...(() => {
      const descriptions = family.variants.map(
        (v) => v.cost_summary?.trim() || v.cost_tier?.trim(),
      );
      return descriptions.every(Boolean)
        ? { description: [...new Set(descriptions)].join("\n") }
        : {};
    })(),
    variants: family.variants.map((variant) => {
      if (!variant.label.startsWith(family.family_label)) {
        throw new Error("Unexpected Devin model family label");
      }
      let suffix = variant.label.slice(family.family_label.length).trim();
      const fast = /\bFast\b/i.test(suffix);
      const context = /\b1M\b/i.test(suffix) ? "1m" : "default";
      suffix = suffix.replace(/\b(Fast|1M)\b/gi, "").trim();
      const thinking = /^Thinking$/i.test(suffix);
      const effort = suffix
        .replace(/No Thinking/i, "none")
        .replace(/\s*Thinking$/i, "")
        .replace(/[-\s]/g, "")
        .toLowerCase();
      if (effort && !effortOrder.includes(effort)) throw new Error("Unknown Devin effort tier");
      return { id: variant.model_uid, effort, fast, thinking, context };
    }),
  }));
}

export function devinModelCapabilities(
  families: DevinModelFamily[],
): Pick<
  AgentCapability,
  | "models"
  | "efforts"
  | "modelEfforts"
  | "modelDefaultEfforts"
  | "fastModels"
  | "thinkingModels"
  | "contextSizes"
  | "modelContextSizes"
> {
  const modelEfforts = Object.fromEntries(
    families.map((f) => [
      f.id,
      effortOrder.filter((effort) => f.variants.some((v) => v.effort === effort)),
    ]),
  );
  return {
    models: families.map(({ id, label, description }) => ({
      id,
      label,
      ...(description ? { description } : {}),
    })),
    efforts: effortOrder.filter((effort) =>
      Object.values(modelEfforts).some((values) => values.includes(effort)),
    ),
    modelEfforts,
    modelDefaultEfforts: Object.fromEntries(
      families.filter((f) => f.variants[0]!.effort).map((f) => [f.id, f.variants[0]!.effort]),
    ),
    fastModels: families.filter((f) => f.variants.some((v) => v.fast)).map((f) => f.id),
    thinkingModels: families.filter((f) => f.variants.some((v) => v.thinking)).map((f) => f.id),
    contextSizes: [
      { id: "default", label: "Default" },
      { id: "1m", label: "1M" },
    ],
    modelContextSizes: Object.fromEntries(
      families.map((f) => [f.id, [...new Set(f.variants.map((v) => v.context))]]),
    ),
  };
}

/** Resolve every control together; private IDs and priority suffixes are provider-owned. */
export function resolveDevinModel(config: ThreadConfig, families: DevinModelFamily[]): string {
  const family = families.find(
    (f) => f.id === config.model || f.variants.some((v) => v.id === config.model),
  );
  if (!family) return config.model;
  const initial = family.variants.find((v) => v.id === config.model) ?? family.variants[0]!;
  const effort = config.effort || initial.effort;
  const match = family.variants.find(
    (v) =>
      v.effort === effort &&
      v.fast === (config.fast ?? initial.fast) &&
      v.thinking === (config.thinking ?? initial.thinking) &&
      v.context === (config.contextSize || initial.context),
  );
  if (!match) throw new Error(`Unsupported model configuration for ${family.label}`);
  return match.id;
}

export function resolveDevinAcpModel(
  families: DevinModelFamily[],
  config: ThreadConfig,
  options: unknown,
) {
  const option = findSelectConfigOption(options, "model");
  if (!option?.id) return undefined;
  return {
    configId: option.id,
    value: resolveDevinModel(config, families),
    ...(option.currentValue ? { currentValue: option.currentValue } : {}),
  };
}
