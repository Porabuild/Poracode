import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { lookupProviderRegistration } from "./providerRegistry";

/**
 * Parsed, comparable price terms for one token stream: the row's own model
 * rates, or one separately-priced component of it. The provider leaf formatter
 * owns the vendor parsing; this shape is what the shared renderer can aggregate
 * and format without ever reading a vendor payload itself.
 */
export interface ModelPriceTerms {
  /** USD per million tokens: input/output bounds across the parsed variants. */
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
  /** True when every parsed price of this stream is zero — shown as a localized Free, never `$0/$0`. */
  free: boolean;
  /**
   * Optional name for this stream's rates (e.g. a lead model's rates shown
   * beside separately-priced components). Rendered only when the price carries
   * components — a single-stream price stays unlabeled — and matched by
   * {@link MessageDescriptor.id} when aggregating, so prices that name their
   * streams differently never share one range.
   */
  label?: MessageDescriptor;
  /**
   * Additional token streams priced beside — never summed into — the primary
   * rates (their tokens are distinct, only the per-1M unit is shared). Absent
   * when the price describes a single stream. Labels are runtime
   * MessageDescriptors: they live in renderer memory only, never across a
   * serialized boundary.
   */
  components?: readonly ModelPriceComponent[];
}

/** One separately-priced token stream inside a parsed price (e.g. a sidekick model). */
export interface ModelPriceComponent {
  /** Localized runtime label naming this stream's rates. */
  label: MessageDescriptor;
  /** USD-per-1M bounds over THIS stream's tokens only. */
  terms: ModelPriceTerms;
}

export interface ModelDescriptionHint {
  /** Compact provider-owned numeric/rate hint rendered beside the model name. */
  hint: string;
  /** Localized explanation of the hint's units and ordering. */
  explanation: MessageDescriptor;
  /**
   * Structured terms for the parsed prices, present only when the description
   * carried a complete inventory — an aggregate over partial terms must never
   * imply a complete range.
   */
  price?: ModelPriceTerms;
}
type ModelDescriptionFormatter = (description: string) => ModelDescriptionHint | undefined;
const formatters = new Map<string, ModelDescriptionFormatter>();

/** Decode provider-native descriptions without adding vendor formats to the shared picker. */
export function registerModelDescriptionFormatter(
  kind: string,
  formatter: ModelDescriptionFormatter,
) {
  formatters.set(kind, formatter);
}
export function formatProviderModelDescription(kind: string, description: string | undefined) {
  return description ? lookupProviderRegistration(formatters, kind)?.(description) : undefined;
}

/** Localized free-tier label shared by price formatters (a free cost tier carries no rates). */
export const freeModelPriceLabel = msg`Free`;
export const modelPriceExplanation = msg`Input / output prices per 1M tokens for each model. Ranges cover model variants.`;

const priceRange = (min: number, max: number) => (min === max ? `$${min}` : `$${min}–${max}`);

const streamPrice = (terms: ModelPriceTerms): string =>
  terms.free
    ? i18n._(freeModelPriceLabel)
    : `${priceRange(terms.inputMin, terms.inputMax)} / ${priceRange(terms.outputMin, terms.outputMax)}`;

/**
 * Compact USD-per-million hint for parsed price terms (`$5 / $25 · 1M`,
 * `$5–10 / $25–50 · 1M`). Component-bearing prices name every stream so the
 * separate charges read as separate (`Lead: $10 / $50 · 1M · Sidekick: Free`);
 * the shared per-1M unit is stated once.
 */
export function formatModelPriceHint(terms: ModelPriceTerms): string {
  const primary =
    terms.label && terms.components?.length
      ? `${i18n._(terms.label)}: ${streamPrice(terms)}`
      : streamPrice(terms);
  if (!terms.components?.length) return terms.free ? primary : `${primary} · 1M`;
  const components = terms.components
    .map((component) => `${i18n._(component.label)}: ${streamPrice(component.terms)}`)
    .join(" · ");
  return `${primary} · 1M · ${components}`;
}

/**
 * Union bounds over complete price inventories. `undefined` unless every price
 * parses as the same meaning — identical primary label and component streams —
 * because an aggregate over members that price different streams would
 * silently drop the charges that don't fit the shared shape. Members with
 * distinct meanings render no range at all rather than a fabricated one.
 */
export function unionModelPriceTerms(
  prices: ReadonlyArray<ModelPriceTerms>,
): ModelPriceTerms | undefined {
  if (prices.length === 0) return undefined;
  const meaning = (price: ModelPriceTerms) =>
    JSON.stringify([price.label?.id ?? null, (price.components ?? []).map((c) => c.label.id)]);
  const first = prices[0]!;
  if (prices.some((price) => meaning(price) !== meaning(first))) return undefined;
  const unionStream = (terms: (price: ModelPriceTerms) => ModelPriceTerms): ModelPriceTerms => ({
    inputMin: Math.min(...prices.map((price) => terms(price).inputMin)),
    inputMax: Math.max(...prices.map((price) => terms(price).inputMax)),
    outputMin: Math.min(...prices.map((price) => terms(price).outputMin)),
    outputMax: Math.max(...prices.map((price) => terms(price).outputMax)),
    free: prices.every((price) => terms(price).free),
  });
  const components = first.components;
  return {
    ...unionStream((price) => price),
    ...(components?.length
      ? {
          ...(first.label ? { label: first.label } : {}),
          components: components.map((component, index) => ({
            label: component.label,
            terms: unionStream((price) => price.components![index]!.terms),
          })),
        }
      : {}),
  };
}

/**
 * Merge parsed row prices into one honest range. `undefined` unless EVERY hint
 * parsed a complete price inventory — a collapsed row over members with
 * unknown or partial terms must show nothing rather than a fabricated range.
 */
export function aggregateModelPriceTerms(
  hints: ReadonlyArray<ModelDescriptionHint | undefined>,
): ModelPriceTerms | undefined {
  if (hints.length === 0) return undefined;
  const prices: ModelPriceTerms[] = [];
  for (const hint of hints) {
    if (!hint?.price) return undefined;
    prices.push(hint.price);
  }
  return unionModelPriceTerms(prices);
}
