import { msg } from "@lingui/core/macro";
import type { ModelDescriptionHint } from "../modelDescription";

/** The CLI reports USD per million tokens, sometimes with different rates for variants. */
export function formatDevinModelPricing(description: string): ModelDescriptionHint | undefined {
  const rates = description.split("\n").map((line) => {
    if (line.trim() === "Free") return { input: 0, output: 0 };
    const match =
      /^\$(\d+(?:\.\d+)?) \/ 1M Input · \$\d+(?:\.\d+)? \/ 1M Cached input · \$(\d+(?:\.\d+)?) \/ 1M Output$/.exec(
        line.trim(),
      );
    return match ? { input: Number(match[1]), output: Number(match[2]) } : undefined;
  });
  // Do not imply a complete price range when some variant prices are unknown.
  if (
    !rates.length ||
    rates.some((rate) => !rate || !Number.isFinite(rate.input) || !Number.isFinite(rate.output))
  )
    return undefined;
  const valid = rates.filter((rate) => rate !== undefined);
  const range = (values: number[]) => {
    const min = Math.min(...values),
      max = Math.max(...values);
    return min === max ? `$${min}` : `$${min}–${max}`;
  };
  return {
    hint: `${range(valid.map((r) => r.input))} / ${range(valid.map((r) => r.output))} · 1M`,
    explanation: msg`Input / output prices per 1M tokens. Ranges cover model variants.`,
  };
}
