import { describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import { AcpConfigSelectionError, AcpSessionConfigSync } from "../acp/sessionConfigSync";
import { compositeEffortCarriable } from "./compositeModelControls";
import {
  createDevinAcpModelResolver,
  devinAcknowledgedModelCarriesEffort,
  parseDevinModelCatalog,
} from "./models";

function options(currentModel: string, efforts: string[]) {
  return [
    {
      id: "model",
      category: "model",
      type: "select",
      currentValue: currentModel,
      options: [{ value: "pair-a", name: "Pair A" }],
    },
    {
      id: "thought_level",
      category: "thought_level",
      type: "select",
      currentValue: "high",
      options: efforts.map((value) => ({ value, name: value })),
    },
  ];
}

describe("composite ACP effort admission", () => {
  it("validates unchanged saved effort against the current pair's native ladder", () => {
    const native = options("pair-a", ["low", "high"]);
    expect(compositeEffortCarriable({ model: "pair-a", effort: "low" }, native)).toBe(true);
    expect(compositeEffortCarriable({ model: "pair-a", effort: "minimal" }, native)).toBe(false);
  });

  it("defers membership until the target model's ladder is known during a switch", () => {
    const previous = options("other-model", ["low"]);
    expect(compositeEffortCarriable({ model: "pair-a", effort: "max" }, previous)).toBe(true);
    expect(
      compositeEffortCarriable(
        { model: "pair-a", effort: "max" },
        options("pair-a", ["low", "high"]),
      ),
    ).toBe(false);
  });

  it("uses the shared native effort alias rules", () => {
    expect(
      compositeEffortCarriable(
        { model: "pair-a", effort: "xhigh" },
        options("pair-a", ["extra-high"]),
      ),
    ).toBe(true);
  });
});

describe("pair effort across a model switch through the strict shared sync", () => {
  // The captured checkpoint-L shape: switching onto the pair advertises the
  // pair in the model select beside the previous regular model, with the
  // SEPARATE five-level thought_level select as the effort's carrier. The
  // strict shared sync owns the post-acknowledgement validation against the
  // ACKNOWLEDGED target inventory — the switch defers membership until the
  // setter refreshes the target options (compositeEffortCarriable above),
  // and a reduced ladder, a vanished carrier, or an on/off toggle standing
  // in for the graded level must then fail the turn typed instead of
  // silently prompting on a different level. A variant whose identity
  // encodes the level (SWE-2 High) is proven provider-owned through the
  // catalog-membership hook, never through wire-id parsing in shared code.
  const pair = "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium";
  const pairLabel = "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)";
  const catalog = parseDevinModelCatalog(
    JSON.stringify({
      families: [
        {
          family_label: "Fusion",
          slug: "fusion",
          variants: [{ model_uid: pair, label: pairLabel }],
        },
        {
          family_label: "SWE-2",
          slug: "swe-2",
          variants: [
            { model_uid: "swe-2-medium", label: "SWE-2 Medium" },
            { model_uid: "swe-2-high", label: "SWE-2 High" },
          ],
        },
      ],
    }),
  );
  const ladder = ["low", "medium", "high", "xhigh", "max"];
  const fixtureOptions = (modelValue: string, thought: { current: string; values: string[] }) => [
    {
      id: "model",
      type: "select",
      category: "model",
      currentValue: modelValue,
      options: [
        { value: "swe-2-high", name: "SWE-2 High" },
        { value: pair, name: pairLabel },
      ],
    },
    {
      id: "thought_level",
      type: "select",
      category: "thought_level",
      name: "Thinking",
      currentValue: thought.current,
      options: thought.values.map((value) => ({ value })),
    },
  ];
  const threadConfig = (overrides: Partial<ThreadConfig>) =>
    ({
      model: pair,
      effort: "",
      contextSize: "",
      mode: "agent",
      approvalPolicy: "bypass",
      fast: false,
      thinking: false,
      ...overrides,
    }) as ThreadConfig;
  const buildSync = (initial: unknown[], reply: unknown[] | Error) => {
    const setSessionConfigOption = vi.fn<
      (input: { sessionId: string; configId: string; value: string }) => Promise<{
        configOptions: unknown[];
      }>
    >(async () => {
      if (reply instanceof Error) throw reply;
      return { configOptions: reply };
    });
    const sync = new AcpSessionConfigSync(
      { setSessionConfigOption } as never,
      undefined,
      createDevinAcpModelResolver({ families: catalog }),
      {
        strictConfigSelection: true,
        modelCarriesEffort: (config, sessionOptions) =>
          devinAcknowledgedModelCarriesEffort(catalog, config, sessionOptions),
      },
    );
    sync.rememberOptions([], initial);
    return {
      pushIds: () => setSessionConfigOption.mock.calls.map((call) => call[0].configId),
      apply: (next: Partial<ThreadConfig> = {}, previous: Partial<ThreadConfig> = {}) =>
        sync.applyTurnConfig("s1", threadConfig(next), threadConfig(previous)),
    };
  };

  it("fails the switch typed when the target ladder drops the carried level to only Low", async () => {
    // Unchanged requested High; the acknowledged pair advertises Low only.
    const { apply, pushIds } = buildSync(
      fixtureOptions("swe-2-high", { current: "high", values: ladder }),
      fixtureOptions(pair, { current: "low", values: ["low"] }),
    );
    const error = await apply({ effort: "high" }, { model: "swe-2-high", effort: "high" }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AcpConfigSelectionError);
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error).message).toMatch(/reasoning level/);
    // The acknowledged native state is what the reported config keeps: the
    // pair write already took effect, the native level is Low.
    expect(error).toMatchObject({ confirmedConfig: { model: pair, effort: "low" } });
    // No thought-level write ever fires, and the typed failure is what keeps
    // the prompt from continuing on the downgraded level.
    expect(pushIds()).toEqual(["model"]);
  });

  it("fails the switch typed when the target pair drops the reasoning selector entirely", async () => {
    const { apply, pushIds } = buildSync(
      fixtureOptions("swe-2-high", { current: "high", values: ladder }),
      [fixtureOptions(pair, { current: "low", values: ladder })[0]!],
    );
    const error = await apply({ effort: "high" }, { model: "swe-2-high", effort: "high" }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AcpConfigSelectionError);
    // Nothing authoritative contradicts the requested level here, so the
    // reported config keeps it beside the acknowledged model — no imagined
    // rollback, and no prompt.
    expect(error).toMatchObject({ confirmedConfig: { model: pair, effort: "high" } });
    expect(pushIds()).toEqual(["model"]);
  });

  it("fails the switch typed when the requested level was never carried and the pair drops the selector", async () => {
    // The source ladder advertises Low only, so the requested High was never
    // carried there either. Target validation independent of source
    // membership must still reject after the acknowledgement — the older
    // source-scoped guard skipped this transition and the call silently
    // succeeded on the model write alone.
    const { apply, pushIds } = buildSync(
      fixtureOptions("swe-2-high", { current: "low", values: ["low"] }),
      [fixtureOptions(pair, { current: "low", values: ["low"] })[0]!],
    );
    const error = await apply(
      { model: pair, effort: "high" },
      { model: "swe-2-high", effort: "low" },
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AcpConfigSelectionError);
    expect(error).toMatchObject({ confirmedConfig: { model: pair, effort: "low" } });
    expect(pushIds()).toEqual(["model"]);
  });

  it("fails the switch typed when the target replaces graded effort with a thinking toggle", async () => {
    // An on/off thought-level acknowledgement is not a graded-effort
    // acknowledgement. The boolean pair never satisfies the requested High:
    // the typed rejection precedes any toggle write and reports the
    // acknowledged native state — the agent's toggle On folded honestly, the
    // uncarried request refused.
    const toggleThought = {
      id: "thought_level",
      category: "thought_level",
      type: "select",
      name: "Thinking",
      currentValue: "true",
      options: [
        { value: "true", name: "On" },
        { value: "false", name: "Off" },
      ],
    };
    const { apply, pushIds } = buildSync(
      fixtureOptions("swe-2-medium", { current: "high", values: ["low", "high"] }),
      [fixtureOptions(pair, { current: "high", values: ["low", "high"] })[0]!, toggleThought],
    );
    const error = await apply(
      { model: pair, effort: "high" },
      { model: "swe-2-medium", effort: "high" },
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AcpConfigSelectionError);
    expect(error).toMatchObject({
      confirmedConfig: { model: pair, effort: "high", thinking: true },
    });
    expect(pushIds()).toEqual(["model"]);
  });

  it("accepts the acknowledged encoded variant when the independent ladder disappears across a switch", async () => {
    // Independent-to-encoded transitions are valid: the source carried High
    // on the five-level ladder, and the acknowledged `swe-2-high` variant
    // encodes High itself with no target reasoning select. The
    // provider-owned catalog proof accepts the transition that a
    // source-membership guard falsely rejected (an identical retry only
    // succeeded afterwards); no shared UID parsing is involved.
    const { apply, pushIds } = buildSync(
      fixtureOptions(pair, { current: "high", values: ladder }),
      [fixtureOptions("swe-2-high", { current: "high", values: ladder })[0]!],
    );
    const confirmed = await apply(
      { model: "swe-2-high", effort: "high" },
      {
        model: pair,
        effort: "high",
      },
    );
    expect(confirmed).toMatchObject({ model: "swe-2-high", effort: "high" });
    expect(pushIds()).toEqual(["model"]);
  });
});
