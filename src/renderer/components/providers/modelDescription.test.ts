import { describe, expect, it } from "vitest";
import {
  aggregateModelPriceTerms,
  formatModelPriceHint,
  unionModelPriceTerms,
  type ModelDescriptionHint,
  type ModelPriceTerms,
} from "./modelDescription";

const terms = (input: number, output: number, free = false): ModelPriceTerms => ({
  inputMin: input,
  inputMax: input,
  outputMin: output,
  outputMax: output,
  free,
});
const hint = (price: ModelPriceTerms): ModelDescriptionHint => ({
  hint: formatModelPriceHint(price),
  explanation: { id: "test.units", message: "units" },
  price,
});

describe("model price terms", () => {
  it("renders single prices and honest ranges, with free tiers localized instead of $0/$0", () => {
    expect(formatModelPriceHint(terms(5, 25))).toBe("$5 / $25 · 1M");
    expect(formatModelPriceHint({ ...terms(5, 25), inputMax: 10, outputMax: 50 })).toBe(
      "$5–10 / $25–50 · 1M",
    );
    const free = formatModelPriceHint(terms(0, 0, true));
    expect(free).not.toMatch(/\$/);
    expect(free.length).toBeGreaterThan(0);
  });

  it("aggregates complete inventories into the union range, free only when every member is free", () => {
    expect(aggregateModelPriceTerms([hint(terms(5, 25)), hint(terms(10, 50))])).toMatchObject({
      inputMin: 5,
      inputMax: 10,
      outputMin: 25,
      outputMax: 50,
      free: false,
    });
    const mixed = aggregateModelPriceTerms([hint(terms(0, 0, true)), hint(terms(5, 25))]);
    expect(mixed).toMatchObject({ inputMin: 0, inputMax: 5, free: false });
    expect(
      aggregateModelPriceTerms([hint(terms(0, 0, true)), hint(terms(0, 0, true))]),
    ).toMatchObject({ free: true });
  });

  it("never fabricates a range over empty or partial inventories", () => {
    expect(aggregateModelPriceTerms([])).toBeUndefined();
    expect(aggregateModelPriceTerms([hint(terms(1, 2)), undefined])).toBeUndefined();
    // A hint without parsed terms (unknown cost text) blocks the range too.
    expect(
      aggregateModelPriceTerms([
        hint(terms(1, 2)),
        { hint: "x", explanation: { id: "e", message: "e" } },
      ]),
    ).toBeUndefined();
  });
});

describe("named price components", () => {
  // A second, separately-priced token stream: its rates describe its own
  // tokens, so they stay beside — never summed into — the primary rates.
  const sidekick = (input: number, output: number, free = false): ModelPriceTerms => ({
    ...terms(input, output, free),
  });
  const componentPrice = (
    primary: ModelPriceTerms,
    label: string,
    componentTerms: ModelPriceTerms,
  ): ModelPriceTerms => ({
    ...primary,
    label: { id: "Lead", message: "Lead" },
    components: [{ label: { id: label, message: label }, terms: componentTerms }],
  });

  it("names every stream so separate charges read as separate", () => {
    expect(
      formatModelPriceHint(componentPrice(terms(10, 50), "Sidekick", sidekick(0, 0, true))),
    ).toBe("Lead: $10 / $50 · 1M · Sidekick: Free");
    expect(
      formatModelPriceHint(componentPrice(terms(10, 50), "Sidekick", sidekick(0.2, 1.2))),
    ).toBe("Lead: $10 / $50 · 1M · Sidekick: $0.2 / $1.2");
  });

  it("keeps single-stream prices unlabeled", () => {
    expect(formatModelPriceHint({ ...terms(5, 25), label: { id: "Lead", message: "Lead" } })).toBe(
      "$5 / $25 · 1M",
    );
  });

  it("unions matching component streams per label, folding free members into paid ranges", () => {
    const union = unionModelPriceTerms([
      componentPrice(terms(2, 10), "Sidekick", sidekick(0, 0, true)),
      componentPrice(terms(10, 50), "Sidekick", sidekick(4, 20)),
    ]);
    expect(union).toMatchObject({
      inputMin: 2,
      inputMax: 10,
      outputMin: 10,
      outputMax: 50,
      free: false,
    });
    expect(union?.components).toHaveLength(1);
    expect(union?.components?.[0]?.terms).toMatchObject({
      inputMin: 0,
      inputMax: 4,
      outputMin: 0,
      outputMax: 20,
      free: false,
    });
    expect(formatModelPriceHint(union!)).toBe("Lead: $2–10 / $10–50 · 1M · Sidekick: $0–4 / $0–20");
    const allFree = unionModelPriceTerms([
      componentPrice(terms(0, 0, true), "Sidekick", sidekick(0, 0, true)),
      componentPrice(terms(0, 0, true), "Sidekick", sidekick(0, 0, true)),
    ]);
    expect(allFree?.components?.[0]?.terms.free).toBe(true);
    expect(formatModelPriceHint(allFree!)).toBe("Lead: Free · 1M · Sidekick: Free");
  });

  it("refuses to merge prices that describe different streams instead of dropping charges", () => {
    // One member prices a sidekick, the other doesn't: a shared range would
    // silently drop the sidekick charge, so there is no range at all.
    expect(
      unionModelPriceTerms([
        componentPrice(terms(2, 10), "Sidekick", sidekick(1, 2)),
        terms(2, 10),
      ]),
    ).toBeUndefined();
    // Differently-named streams never share a range either.
    expect(
      unionModelPriceTerms([
        componentPrice(terms(2, 10), "Sidekick", sidekick(1, 2)),
        componentPrice(terms(2, 10), "Booster", sidekick(1, 2)),
      ]),
    ).toBeUndefined();
    // A differently-named primary means the rates don't describe the same thing.
    expect(
      unionModelPriceTerms([
        componentPrice(terms(2, 10), "Sidekick", sidekick(1, 2)),
        {
          ...terms(2, 10),
          label: { id: "Solo", message: "Solo" },
          components: [{ label: { id: "Sidekick", message: "Sidekick" }, terms: sidekick(1, 2) }],
        },
      ]),
    ).toBeUndefined();
    expect(unionModelPriceTerms([])).toBeUndefined();
  });

  it("aggregates component-bearing hints through the same completeness gate", () => {
    const a = hint(componentPrice(terms(2, 10), "Sidekick", sidekick(0, 0, true)));
    const b = hint(componentPrice(terms(10, 50), "Sidekick", sidekick(4, 20)));
    expect(aggregateModelPriceTerms([a, b])?.components?.[0]?.terms).toMatchObject({
      inputMax: 4,
      outputMax: 20,
    });
    // One member without parsed terms still blocks the whole range.
    expect(aggregateModelPriceTerms([a, undefined])).toBeUndefined();
  });
});
