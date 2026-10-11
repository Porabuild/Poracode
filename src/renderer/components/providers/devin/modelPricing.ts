import { msg } from "@lingui/core/macro";
import {
  formatModelPriceHint,
  modelPriceExplanation,
  unionModelPriceTerms,
  type ModelDescriptionHint,
  type ModelPriceTerms,
} from "../modelDescription";

/**
 * The native catalog names the primary stream only when a separately-priced
 * sidekick model joins it; these reuse the existing family-selection labels so
 * the price line reads like the rest of the app.
 */
const leadPriceLabel = msg`Lead`;
const sidekickPriceLabel = msg`Sidekick`;

const freePriceExplanation = msg`Input / output prices per 1M tokens. Ranges cover model variants.`;

const rate = (label: string) => new RegExp(`^\\$(\\d+(?:\\.\\d+)?) \\/ 1M ${label}$`);
const INPUT_RATE = rate("Input");
const CACHED_RATE = rate("Cached input");
const OUTPUT_RATE = rate("Output");
const SIDEKICK_INPUT_RATE = rate("Sidekick input");
const SIDEKICK_CACHED_RATE = rate("Sidekick cached input");
const SIDEKICK_OUTPUT_RATE = rate("Sidekick output");
const SIDEKICK_FREE = "Sidekick: Free";

const usd = (value: string): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const freeTerms = (): ModelPriceTerms => ({
  inputMin: 0,
  inputMax: 0,
  outputMin: 0,
  outputMax: 0,
  free: true,
});

const pricedTerms = (input: number, output: number): ModelPriceTerms => ({
  inputMin: input,
  inputMax: input,
  outputMin: output,
  outputMax: output,
  free: input === 0 && output === 0,
});

/**
 * Parse one native catalog cost line. Known shapes:
 * `Free`, `$in / 1M Input · $cached / 1M Cached input · $out / 1M Output`, and
 * either sidekick appendix on the priced form — `Sidekick: Free` or three
 * `Sidekick` rates. The sidekick's rates describe ITS OWN tokens, so they stay
 * a named component beside the lead rates instead of being summed into them.
 * Unknown appendices or changed formats return `undefined` — no rates invented.
 */
function parseDevinPriceLine(line: string): ModelPriceTerms | undefined {
  const trimmed = line.trim();
  if (trimmed === "Free") return freeTerms();
  const segments = trimmed.split(" · ");
  const input = segments[0] ? INPUT_RATE.exec(segments[0])?.[1] : undefined;
  const cached = segments[1] ? CACHED_RATE.exec(segments[1]) : undefined;
  const output = segments[2] ? OUTPUT_RATE.exec(segments[2])?.[1] : undefined;
  // The cached-input rate is real but has no slot in the compact input/output hint.
  if (!input || !cached || !output) return undefined;
  const inputUsd = usd(input);
  const outputUsd = usd(output);
  if (inputUsd === undefined || outputUsd === undefined) return undefined;

  const appendix = segments.slice(3);
  if (appendix.length === 0) {
    return pricedTerms(inputUsd, outputUsd);
  }
  const sidekickTerms = (() => {
    if (appendix.length === 1 && appendix[0] === SIDEKICK_FREE) return freeTerms();
    if (appendix.length === 3) {
      const sidekickInput = appendix[0] ? SIDEKICK_INPUT_RATE.exec(appendix[0])?.[1] : undefined;
      const sidekickCached = appendix[1] ? SIDEKICK_CACHED_RATE.exec(appendix[1]) : undefined;
      const sidekickOutput = appendix[2] ? SIDEKICK_OUTPUT_RATE.exec(appendix[2])?.[1] : undefined;
      if (!sidekickInput || !sidekickCached || !sidekickOutput) return undefined;
      const inUsd = usd(sidekickInput);
      const outUsd = usd(sidekickOutput);
      return inUsd !== undefined && outUsd !== undefined ? pricedTerms(inUsd, outUsd) : undefined;
    }
    return undefined;
  })();
  if (!sidekickTerms) return undefined;
  return {
    ...pricedTerms(inputUsd, outputUsd),
    label: leadPriceLabel,
    components: [{ label: sidekickPriceLabel, terms: sidekickTerms }],
  };
}

/** The CLI reports USD per million tokens, sometimes with different rates for variants. */
export function formatDevinModelPricing(description: string): ModelDescriptionHint | undefined {
  const lines = description.split("\n").map(parseDevinPriceLine);
  // Do not imply a complete price range when some variant prices are unknown,
  // and never merge variants that price different streams (a sidekick on one
  // variant and none on another has no honest single range).
  if (lines.some((line) => !line)) return undefined;
  const terms = unionModelPriceTerms(lines.filter((line): line is ModelPriceTerms => !!line));
  if (!terms) return undefined;
  return {
    hint: formatModelPriceHint(terms),
    explanation: terms.components?.length ? modelPriceExplanation : freePriceExplanation,
    price: terms,
  };
}
