import { describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import acpModelSelection from "./fixtures/contracts/acp-model-selection.json";
import {
  createDevinAcpModelResolver,
  DEVIN_CLOUD_DEFAULT_MODEL_ID,
  DevinAcpModelSelectionRejectedError,
  devinAcknowledgedModelCarriesEffort,
  devinModelCapabilities,
  parseDevinModelCatalog,
  resolveDevinAcpLaunchModel,
  resolveDevinAcpModel,
  resolveDevinAcpModelNegotiation,
  resolveDevinModel,
  type DevinAcpModelNegotiation,
  type DevinModelFamily,
} from "./models";

const fixtures = { acpModelSelection };

const families = parseDevinModelCatalog(
  JSON.stringify({
    families: [
      {
        family_label: "GPT-5.6 Sol",
        slug: "gpt-5.6-sol",
        variants: [
          { model_uid: "gpt-5-6-sol-medium", label: "GPT-5.6 Sol Medium Thinking" },
          { model_uid: "gpt-5-6-sol-none", label: "GPT-5.6 Sol No Thinking" },
          { model_uid: "gpt-5-6-sol-medium-priority", label: "GPT-5.6 Sol Medium Thinking Fast" },
          { model_uid: "gpt-5-6-sol-none-priority", label: "GPT-5.6 Sol No Thinking Fast" },
        ],
      },
      {
        family_label: "Claude Opus 4.5",
        slug: "claude-opus-4.5",
        variants: [
          { model_uid: "MODEL_CLAUDE_4_5_OPUS", label: "Claude Opus 4.5" },
          { model_uid: "MODEL_CLAUDE_4_5_OPUS_THINKING", label: "Claude Opus 4.5 Thinking" },
        ],
      },
      {
        family_label: "GLM-5.2",
        slug: "glm-5.2",
        variants: [
          { model_uid: "glm-5-2", label: "GLM-5.2 High" },
          { model_uid: "glm-5-2-max", label: "GLM-5.2 Max" },
          { model_uid: "glm-5-2-max-1m", label: "GLM-5.2 Max 1M" },
        ],
      },
      {
        family_label: "SWE-1.6 Fast",
        slug: "swe-1.6-fast",
        variants: [{ model_uid: "swe-1-6-fast", label: "SWE-1.6 Fast" }],
      },
    ],
  }),
);

// Live 3000.11.3 shape: one Fusion family whose variants are exact model
// pairs ("Left + Right"), each a first-class choice on the wire.
const fusionFamily = (label: string, uid: string) => ({
  model_uid: uid,
  label: `Fusion ${label}`,
});
const fusionCatalog = parseDevinModelCatalog(
  JSON.stringify({
    families: [
      {
        family_label: "Fusion",
        slug: "fusion",
        variants: [
          fusionFamily(
            "(Claude Fable 5.1 Medium + SWE-2 Medium)",
            "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
          ),
          fusionFamily(
            "(Claude Fable 5.1 High + SWE-2 High)",
            "fusion-claude-fable-5-1-high-sidekick-swe-2-high",
          ),
          fusionFamily(
            "(GPT-5.6 Sol Max + SWE-2 Max)",
            "fusion-gpt-5-6-sol-max-sidekick-swe-2-max",
          ),
        ],
      },
    ],
  }),
);

describe("Devin model families", () => {
  it("shows families once and declares independent effort, speed, thinking and context controls", () => {
    const caps = devinModelCapabilities(families);
    expect(caps.models.map((m) => m.label)).toEqual([
      "GPT-5.6 Sol",
      "Claude Opus 4.5",
      "GLM-5.2",
      "SWE-1.6 Fast",
    ]);
    expect(caps.modelEfforts["gpt-5-6-sol-medium"]).toEqual(["none", "medium"]);
    expect(caps.modelDefaultEfforts?.["gpt-5-6-sol-medium"]).toBe("medium");
    expect(caps.fastModels).toEqual(["gpt-5-6-sol-medium"]);
    expect(caps.thinkingModels).toEqual(["MODEL_CLAUDE_4_5_OPUS"]);
    expect(caps.modelContextSizes?.["glm-5-2"]).toEqual(["default", "1m"]);
  });
  it("maps effort and speed to actual priority IDs and reverses both controls", () => {
    expect(
      resolveDevinModel({ model: "gpt-5-6-sol-medium", effort: "none", fast: true }, families),
    ).toBe("gpt-5-6-sol-none-priority");
    expect(
      resolveDevinModel({ model: "gpt-5-6-sol-medium", effort: "medium", fast: false }, families),
    ).toBe("gpt-5-6-sol-medium");
  });
  it("resolves opaque IDs, context, and persisted legacy variants", () => {
    expect(resolveDevinModel({ model: "MODEL_CLAUDE_4_5_OPUS", thinking: true }, families)).toBe(
      "MODEL_CLAUDE_4_5_OPUS_THINKING",
    );
    // An explicit `false` is a REAL selection on a regular variant — it must
    // land on the plain non-thinking variant, never read as an unset control.
    expect(
      resolveDevinModel({ model: "MODEL_CLAUDE_4_5_OPUS_THINKING", thinking: false }, families),
    ).toBe("MODEL_CLAUDE_4_5_OPUS");
    expect(
      resolveDevinModel({ model: "glm-5-2", effort: "max", contextSize: "1m" }, families),
    ).toBe("glm-5-2-max-1m");
    expect(resolveDevinModel({ model: "gpt-5-6-sol-none-priority" }, families)).toBe(
      "gpt-5-6-sol-none-priority",
    );
  });
  it("never silently runs an unsupported control combination", () => {
    expect(() =>
      resolveDevinModel({ model: "glm-5-2", effort: "high", contextSize: "1m" }, families),
    ).toThrow("Unsupported model configuration");
    expect(() => parseDevinModelCatalog('{"families": [{"variants": []}]}')).toThrow(
      /invalid_type/,
    );
  });
  it("keeps every Fusion pair as its own exact picker choice instead of an empty effort", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const caps = devinModelCapabilities(fusionCatalog);
      // No pair is collapsed to an effort-less variant, and none of the exact
      // composite labels is dropped or reclassified as an unknown effort tier.
      expect(caps.models.map((m) => m.id)).toEqual([
        "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
        "fusion-claude-fable-5-1-high-sidekick-swe-2-high",
        "fusion-gpt-5-6-sol-max-sidekick-swe-2-max",
      ]);
      expect(caps.models.map((m) => m.label)).toEqual([
        "(Claude Fable 5.1 Medium + SWE-2 Medium)",
        "(Claude Fable 5.1 High + SWE-2 High)",
        "(GPT-5.6 Sol Max + SWE-2 Max)",
      ]);
      expect(caps.modelEfforts["fusion-claude-fable-5-1-medium-sidekick-swe-2-medium"]).toEqual([]);
      expect(caps.efforts).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
      for (const family of fusionCatalog as readonly DevinModelFamily[])
        for (const variant of family.variants) expect(variant.composite).toBeTruthy();
    } finally {
      warn.mockRestore();
    }
  });
  it("keeps the full native Fast/1M suffix on composite labels so distinct pairs never collide", () => {
    // Live checkpoint shape: a Fusion pair and its Fast sibling differ ONLY by
    // the Fast marker (distinct wire UIDs). Stripping the marker before
    // display collapsed both to one label, distinguishable only by a leftover
    // double space — 150 such collisions on the live 3000.11.3 catalog.
    const catalog = parseDevinModelCatalog(
      JSON.stringify({
        families: [
          {
            family_label: "Fusion",
            slug: "fusion",
            variants: [
              fusionFamily(
                "(GPT-6.1 Sol High Thinking + SWE-2 Medium)",
                "fusion-gpt-6-1-sol-high-sidekick-swe-2-medium",
              ),
              fusionFamily(
                "(GPT-6.1 Sol High Thinking Fast + SWE-2 Medium)",
                "fusion-gpt-6-1-sol-high-fast-sidekick-swe-2-medium",
              ),
              fusionFamily(
                "(GLM-5.2 Max 1M + SWE-2 Medium)",
                "fusion-glm-5-2-max-1m-sidekick-swe-2-medium",
              ),
            ],
          },
        ],
      }),
    );
    const caps = devinModelCapabilities(catalog);
    // Every distinct configuration keeps its own verbatim native label —
    // Fast/1M preserved, no double-space artifact, nothing deduped.
    expect(caps.models.map((m) => m.label)).toEqual([
      "(GPT-6.1 Sol High Thinking + SWE-2 Medium)",
      "(GPT-6.1 Sol High Thinking Fast + SWE-2 Medium)",
      "(GLM-5.2 Max 1M + SWE-2 Medium)",
    ]);
    const family = (catalog as readonly DevinModelFamily[])[0]!;
    expect(new Set(family.variants.map((v) => v.composite)).size).toBe(family.variants.length);
    expect(family.variants.map((v) => v.composite)).not.toContain(
      "(GPT-6.1 Sol High Thinking  + SWE-2 Medium)",
    );
  });
  it("classifies ordinary effort/Fast/context suffixes as folded controls, never composites", () => {
    const devinFamilies = families as readonly DevinModelFamily[];
    const solFamily = devinFamilies[0]!;
    const glmFamily = devinFamilies[2]!;
    // "…Medium Thinking Fast" folds to effort + speed; "…Max 1M" folds to
    // effort + context. Neither becomes an opaque composite entry, so the
    // shared controls keep resolving them (resolution covered above).
    expect(solFamily.variants.find((v) => v.id === "gpt-5-6-sol-medium-priority")).toMatchObject({
      effort: "medium",
      fast: true,
      thinking: false,
      context: "default",
    });
    expect(
      solFamily.variants.find((v) => v.id === "gpt-5-6-sol-medium-priority")!.composite,
    ).toBeUndefined();
    expect(glmFamily.variants.find((v) => v.id === "glm-5-2-max-1m")).toMatchObject({
      effort: "max",
      fast: false,
      context: "1m",
    });
    expect(glmFamily.variants.find((v) => v.id === "glm-5-2-max-1m")!.composite).toBeUndefined();
  });
  it("resolves stored Fusion pairs verbatim and refuses explicit laddered overrides", () => {
    const pair = "fusion-gpt-5-6-sol-max-sidekick-swe-2-max";
    expect(resolveDevinModel({ model: pair }, fusionCatalog)).toBe(pair);
    // The family's public ID is its first pair; selecting the family resolves
    // to that exact pair.
    expect(resolveDevinModel({ model: fusionCatalog[0]!.id }, fusionCatalog)).toBe(
      fusionCatalog[0]!.id,
    );
    // The composer's inert OFF/default seeds are not user intent: they select
    // the exact pair. Rejecting exactly these seeds was the live GUI follow-up
    // regression ("unsupported model configuration" on a plain pair pick).
    expect(
      resolveDevinModel(
        { model: pair, effort: "", contextSize: "", fast: false, thinking: false },
        fusionCatalog,
      ),
    ).toBe(pair);
    expect(
      resolveDevinModel(
        { model: pair, effort: "default", contextSize: "default", fast: false, thinking: false },
        fusionCatalog,
      ),
    ).toBe(pair);
    // A MEANINGFUL control composes onto nothing: every explicit switch fails
    // visibly instead of silently dropping the effort choice.
    expect(() => resolveDevinModel({ model: pair, effort: "high" }, fusionCatalog)).toThrow(
      "Unsupported model configuration",
    );
    expect(() => resolveDevinModel({ model: pair, effort: "medium" }, fusionCatalog)).toThrow(
      "Unsupported model configuration",
    );
    expect(() => resolveDevinModel({ model: pair, fast: true }, fusionCatalog)).toThrow(
      "Unsupported model configuration",
    );
    expect(() => resolveDevinModel({ model: pair, thinking: true }, fusionCatalog)).toThrow(
      "Unsupported model configuration",
    );
    expect(() => resolveDevinModel({ model: pair, contextSize: "1m" }, fusionCatalog)).toThrow(
      "Unsupported model configuration",
    );
  });
  it("preserves an unrecognized tier as an exact provider variant without warning or loss", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const catalog = parseDevinModelCatalog(
        JSON.stringify({
          families: [
            {
              family_label: "GPT-5.6 Sol",
              slug: "gpt-5.6-sol",
              variants: [
                { model_uid: "gpt-5-6-sol-medium", label: "GPT-5.6 Sol Medium Thinking" },
                { model_uid: "gpt-5-6-sol-ultra", label: "GPT-5.6 Sol Ultra Thinking" },
              ],
            },
          ],
        }),
      );
      // The provider's own label is preserved verbatim as a composite variant
      // so the exact tier stays selectable and nothing is logged as unknown.
      expect(catalog[0]!.variants[1]).toMatchObject({
        id: "gpt-5-6-sol-ultra",
        composite: "Ultra Thinking",
        effort: "",
      });
      const caps = devinModelCapabilities(catalog);
      expect(caps.models.map((m) => m.id)).toEqual(["gpt-5-6-sol-medium", "gpt-5-6-sol-ultra"]);
      expect(caps.models[1]).toMatchObject({ label: "Ultra Thinking" });
      expect(caps.modelEfforts["gpt-5-6-sol-medium"]).toEqual(["medium"]);
      expect(caps.modelDefaultEfforts?.["gpt-5-6-sol-ultra"]).toBeUndefined();
      expect(resolveDevinModel({ model: "gpt-5-6-sol-ultra" }, catalog)).toBe("gpt-5-6-sol-ultra");
      // An explicit effort cannot silently switch the tier away from the
      // stored provider choice.
      expect(() =>
        resolveDevinModel({ model: "gpt-5-6-sol-ultra", effort: "medium" }, catalog),
      ).toThrow("Unsupported model configuration");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
  it("parses a fresh catalog on reload so an updated binary replaces families", () => {
    const reloaded = parseDevinModelCatalog(
      JSON.stringify({
        families: [
          {
            family_label: "GLM-5.2",
            slug: "glm-5.2",
            variants: [{ model_uid: "glm-5-2-next", label: "GLM-5.2 Max" }],
          },
        ],
      }),
    );
    expect(reloaded).not.toBe(families);
    expect(reloaded[0]!.variants[0]!.id).toBe("glm-5-2-next");
  });
  it("resolves the live ACP config option using provider IDs", () => {
    expect(
      resolveDevinAcpModel(families, { model: "gpt-5-6-sol-medium", fast: true }, [
        {
          id: "model",
          type: "select",
          category: "model",
          currentValue: "gpt-5-6-sol-medium",
          options: [],
        },
      ]),
    ).toEqual({
      configId: "model",
      value: "gpt-5-6-sol-medium-priority",
      currentValue: "gpt-5-6-sol-medium",
    });
  });
  it("honors the session's accepted model values over a stale catalog UID", () => {
    const liveOptions = [
      {
        id: "model",
        type: "select",
        category: "model",
        currentValue: "swe-2-high",
        options: [
          { value: "swe-2-high", name: "SWE-2 High" },
          { value: "swe-2-max", name: "SWE-2 Max" },
          {
            value: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
            name: "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)",
          },
        ],
      },
    ];
    // The catalog resolves an offered raw id verbatim even though the catalog
    // itself does not know the family.
    expect(resolveDevinAcpModel(families, { model: "swe-2-max" }, liveOptions)).toEqual({
      configId: "model",
      value: "swe-2-max",
      currentValue: "swe-2-high",
    });
    // A stored Fusion pair that the session offers resolves exactly.
    expect(
      resolveDevinAcpModel(
        fusionCatalog,
        { model: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium" },
        liveOptions,
      ),
    ).toEqual({
      configId: "model",
      value: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
      currentValue: "swe-2-high",
    });
    // Neither the resolved UID nor the stored id is offered: no push is made
    // and the agent keeps its own current model.
    expect(
      resolveDevinAcpModel(families, { model: "glm-5-2", effort: "max" }, liveOptions),
    ).toBeUndefined();
    expect(
      resolveDevinAcpModel(families, { model: "MODEL_CLAUDE_4_5_OPUS" }, liveOptions),
    ).toBeUndefined();
  });
  it("surfaces session-side model rejection as a typed negotiation outcome", () => {
    const liveOptions = [
      {
        id: "model",
        type: "select",
        category: "model",
        currentValue: "swe-2-high",
        options: [
          { value: "swe-2-high", name: "SWE-2 High" },
          { value: "swe-2-max", name: "SWE-2 Max" },
        ],
      },
    ];
    // Applied push carries the seam shape.
    expect(resolveDevinAcpModelNegotiation(families, { model: "swe-2-max" }, liveOptions)).toEqual({
      status: "applied",
      configId: "model",
      value: "swe-2-max",
      currentValue: "swe-2-high",
    });
    // A stored model the session does not offer is a rejection with the full
    // negotiation context — requested, stored, accepted set, agent value —
    // so the host can surface a rollback instead of silently retaining.
    expect(
      resolveDevinAcpModelNegotiation(families, { model: "glm-5-2", effort: "max" }, liveOptions),
    ).toEqual({
      status: "rejected-by-session",
      requested: "glm-5-2-max",
      stored: "glm-5-2",
      accepted: ["swe-2-high", "swe-2-max"],
      agentValue: "swe-2-high",
    });
    // No model option on the session: model ownership stays with CLI argv.
    expect(resolveDevinAcpModelNegotiation(families, { model: "swe-2-max" }, [])).toEqual({
      status: "no-model-option",
    });
  });
  it("rejects an explicit unaccepted selection with a typed error, not a silent retain", () => {
    const liveOptions = [
      {
        id: "model",
        type: "select",
        category: "model",
        currentValue: "swe-2-high",
        options: [{ value: "swe-2-high", name: "SWE-2 High" }],
      },
    ];
    const rejections: Array<Extract<DevinAcpModelNegotiation, { status: "rejected-by-session" }>> =
      [];
    const resolve = createDevinAcpModelResolver({
      families,
      onRejected: (rejection) => rejections.push(rejection),
    });
    // An explicit selection the session does not offer throws: returning
    // `undefined` would let the shared turn path fall back to the legacy
    // `session/set_model` request and swallow the mismatch, prompting on a
    // different model than the user picked.
    expect(() => resolve({ model: "swe-2-max" }, liveOptions)).toThrowError(
      DevinAcpModelSelectionRejectedError,
    );
    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toMatchObject({ requested: "swe-2-max", agentValue: "swe-2-high" });
    // The thrown error carries the full negotiation payload for the host's
    // rejection copy.
    let caught: unknown;
    try {
      resolve({ model: "swe-2-max" }, liveOptions);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DevinAcpModelSelectionRejectedError);
    expect((caught as DevinAcpModelSelectionRejectedError).rejection).toMatchObject({
      status: "rejected-by-session",
      requested: "swe-2-max",
      stored: "swe-2-max",
      accepted: ["swe-2-high"],
    });
    // The callback fires before the throw so a host notification can surface
    // the rollback context; it is never a substitute for the throw.
    // Offered value resolves without touching the rejection path.
    expect(resolve({ model: "swe-2-high" }, liveOptions)).toEqual({
      configId: "model",
      value: "swe-2-high",
      currentValue: "swe-2-high",
    });
    expect(rejections).toHaveLength(2);
    // No option: model ownership stays with the agent/argv — no throw, no push.
    expect(resolve({ model: "swe-2-high" }, [])).toBeUndefined();
    expect(rejections).toHaveLength(2);
    // An empty stored model is no explicit selection: no push, no rejection.
    expect(resolve({ model: "" }, liveOptions)).toBeUndefined();
    expect(rejections).toHaveLength(2);
    // Callback-free composition throws the same typed error.
    const silent = createDevinAcpModelResolver({ families });
    expect(() => silent({ model: "swe-2-max" }, liveOptions)).toThrowError(
      DevinAcpModelSelectionRejectedError,
    );
  });
});

it("preserves distinct pricing descriptions including free variants in the family catalog", () => {
  const data = parseDevinModelCatalog(
    JSON.stringify({
      families: [
        {
          family_label: "Family",
          slug: "family",
          variants: [
            { model_uid: "family-high", label: "Family High", cost_tier: "Free" },
            {
              model_uid: "family-max",
              label: "Family Max",
              cost_summary: "$1 / 1M Input · $0.1 / 1M Cached input · $2 / 1M Output",
            },
            {
              model_uid: "family-low",
              label: "Family Low",
              cost_summary: "$1 / 1M Input · $0.1 / 1M Cached input · $2 / 1M Output",
            },
          ],
        },
      ],
    }),
  );
  expect(devinModelCapabilities(data).models[0]?.description).toBe(
    "Free\n$1 / 1M Input · $0.1 / 1M Cached input · $2 / 1M Output",
  );
});

it("surfaces per-pair pricing on Fusion entries instead of aggregating every pair price", () => {
  const data = parseDevinModelCatalog(
    JSON.stringify({
      families: [
        {
          family_label: "Fusion",
          slug: "fusion",
          variants: [
            {
              model_uid: "fusion-a-b",
              label: "Fusion (A Medium + B High)",
              cost_summary: "$1 / 1M Input",
            },
            {
              model_uid: "fusion-c-d",
              label: "Fusion (C Max + D Max)",
              cost_summary: "$2 / 1M Input",
            },
          ],
        },
      ],
    }),
  );
  const caps = devinModelCapabilities(data);
  expect(caps.models[0]).toMatchObject({
    id: "fusion-a-b",
    description: "$1 / 1M Input",
  });
  expect(caps.models[1]).toMatchObject({
    id: "fusion-c-d",
    label: "(C Max + D Max)",
    description: "$2 / 1M Input",
  });
});

// ── Live negotiated-menu semantics (real capture) ─────────────────────────

/**
 * Live `devin acp` 3000.11.3 capture (no-prompt probe, public model ids
 * only): the ACP `model` menu is the ADVERTISED representatives and
 * `thought_level` is a SEPARATE select whose ladder depends on the active
 * model. The CLI catalog below is the probe-informed reconstruction of the
 * effort-folded variant ids (e.g. `swe-1-7-max`) that the live menu does NOT
 * advertise — exactly the mapping that used to reject valid GUI selections.
 */
const liveMenu = fixtures.acpModelSelection.sessionNew.model.values;
const liveThought = fixtures.acpModelSelection.sessionNew.thoughtLevel;
const liveOption = (currentValue = "swe-2-high") => [
  {
    id: "model",
    type: "select",
    category: "model",
    currentValue,
    options: liveMenu.map((value) => ({ value })),
  },
];
const liveOptionWithThought = (currentValue = "swe-2-high") => [
  ...liveOption(currentValue),
  {
    id: "thought_level",
    type: "select",
    category: "thought_level",
    currentValue: liveThought.currentValue,
    options: liveThought.values.map((value) => ({ value })),
  },
];
const foldedCatalog: DevinModelFamily[] = [
  {
    id: "swe-1-7",
    label: "SWE 1.7",
    variants: [
      { id: "swe-1-7", effort: "", thinking: false, fast: false, context: "default" },
      { id: "swe-1-7-medium", effort: "medium", thinking: false, fast: false, context: "default" },
      { id: "swe-1-7-max", effort: "max", thinking: false, fast: false, context: "default" },
      {
        id: "swe-1-7-lightning-medium",
        effort: "medium",
        thinking: false,
        fast: true,
        context: "default",
      },
    ],
  },
  {
    id: "glm-5-2",
    label: "GLM 5.2",
    variants: [
      { id: "glm-5-2", effort: "high", thinking: false, fast: false, context: "default" },
      { id: "glm-5-2-1m", effort: "high", thinking: false, fast: false, context: "1m" },
    ],
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    variants: [
      { id: "claude-opus-4-6", effort: "", thinking: false, fast: false, context: "default" },
      {
        id: "claude-opus-4-6-thinking",
        effort: "",
        thinking: true,
        fast: false,
        context: "default",
      },
      { id: "claude-opus-4-6-1m", effort: "", thinking: false, fast: false, context: "1m" },
    ],
  },
];

describe("Devin ACP negotiation against the live advertised menu", () => {
  it("resolves the UI-selected family onto the advertised representative without folding effort into the id", () => {
    // The live-captured regression: the CLI catalog folds effort into
    // variant UIDs, so family swe-1-7 + effort max used to map to
    // `swe-1-7-max` — an id the session menu does not offer — and rejected a
    // valid GUI selection before any prompt. The ACP namespace keeps ONE
    // advertised representative per family; effort rides the SEPARATE
    // thought_level control the shared sync pushes after the model.
    const outcome = resolveDevinAcpModelNegotiation(
      foldedCatalog,
      { model: "swe-1-7", effort: "max" },
      liveOptionWithThought(),
    );
    expect(outcome).toMatchObject({
      status: "applied",
      configId: "model",
      value: "swe-1-7-medium",
    });
    // The thought ladder is never folded into the model push: the resolver
    // returns the model option only.
    expect(JSON.stringify(outcome)).not.toContain("thought_level");
    expect(JSON.stringify(outcome)).not.toContain("swe-1-7-max");
  });

  it("sends an accepted raw id verbatim (variant, pair, or private id)", () => {
    expect(
      resolveDevinAcpModelNegotiation(foldedCatalog, { model: "kimi-k3-high" }, liveOption()),
    ).toMatchObject({ status: "applied", value: "kimi-k3-high" });
    const pair = "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium";
    expect(
      resolveDevinAcpModelNegotiation(foldedCatalog, { model: pair }, liveOption()),
    ).toMatchObject({ status: "applied", value: pair });
  });

  it("maps context and fast requests only when the menu advertises a faithful variant", () => {
    // GLM 5.2's 1M variant IS advertised: the context choice maps onto it.
    expect(
      resolveDevinAcpModelNegotiation(
        foldedCatalog,
        { model: "glm-5-2", contextSize: "1m" },
        liveOption(),
      ),
    ).toMatchObject({ status: "applied", value: "glm-5-2-1m" });
    // SWE 1.7's fast variant IS advertised (Lightning).
    expect(
      resolveDevinAcpModelNegotiation(
        foldedCatalog,
        { model: "swe-1-7", fast: true },
        liveOption(),
      ),
    ).toMatchObject({ status: "applied", value: "swe-1-7-lightning-medium" });
    // A thinking request against a family whose accepted variants are all
    // non-thinking has NO faithful mapping: rejected, never downgraded.
    const noThinkingMenu = liveOption().map((option) => ({
      ...option,
      options: [{ value: "swe-1-7-medium" }, { value: "swe-1-7-max" }],
    }));
    expect(
      resolveDevinAcpModelNegotiation(
        foldedCatalog,
        { model: "swe-1-7", thinking: true },
        noThinkingMenu,
      ),
    ).toMatchObject({ status: "rejected-by-session" });
  });

  it("rejects an effort the menu cannot honor in id or thought level, never drops it", () => {
    // No thought_level option on this session and no id-encoded variant for
    // `max`: the effort would be silently dropped — reject instead.
    const outcome = resolveDevinAcpModelNegotiation(
      foldedCatalog,
      { model: "swe-1-7", effort: "max" },
      liveOption("swe-1-7-medium"),
    );
    expect(outcome).toMatchObject({
      status: "rejected-by-session",
      requested: "swe-1-7-max",
      stored: "swe-1-7",
    });
    // With a thought_level option present, the SAME combination applies:
    // the representative carries the family, the thought push carries max.
    expect(
      resolveDevinAcpModelNegotiation(
        foldedCatalog,
        { model: "swe-1-7", effort: "max" },
        liveOptionWithThought(),
      ),
    ).toMatchObject({ status: "applied", value: "swe-1-7-medium" });
  });

  it("keeps opaque Fusion pairs verbatim and refuses to substitute a family variant", () => {
    // A stored pair the menu no longer offers must reject, never swap to a
    // laddered variant of the same Fusion family.
    const pairCatalog: DevinModelFamily[] = [
      {
        id: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
        label: "Fusion",
        variants: [
          {
            id: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
            composite: "Fable 5.1 Medium + SWE-2 Medium",
            effort: "",
            thinking: false,
            fast: false,
            context: "default",
          },
          {
            id: "fusion-claude-opus-5-high-sidekick-swe-2-high",
            composite: "Opus 5 High + SWE-2 High",
            effort: "",
            thinking: false,
            fast: false,
            context: "default",
          },
        ],
      },
    ];
    const fusionMenu = liveOption().map((option) => ({
      ...option,
      options: [{ value: "fusion-claude-opus-5-high-sidekick-swe-2-high" }],
    }));
    expect(
      resolveDevinAcpModelNegotiation(
        pairCatalog,
        { model: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium" },
        fusionMenu,
      ),
    ).toMatchObject({
      status: "rejected-by-session",
      requested: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
    });
    // Laddered controls never compose onto an offered pair either.
    const offeredPair = liveOption().map((option) => ({
      ...option,
      options: [{ value: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium" }],
    }));
    expect(() =>
      resolveDevinAcpModelNegotiation(
        pairCatalog,
        { model: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium", effort: "max" },
        offeredPair,
      ),
    ).toThrowError(/Unsupported model configuration/);
  });

  it("launches the exact live Fusion pair for the composer's all-off config and still refuses real switches", () => {
    // SOURCE+LIVE checkpoint: the real 3000.11.3 menu offers the pair the app
    // model picker selected, and the composer submits it with inert OFF/default
    // seeds — the exact shape that used to reject the turn with "unsupported
    // model configuration".
    const pair = "fusion-gpt-6-astra-high-sidekick-swe-2-high";
    const livePairCatalog = parseDevinModelCatalog(
      JSON.stringify({
        families: [
          {
            family_label: "Fusion",
            slug: "fusion",
            variants: [
              {
                model_uid: pair,
                label: "Fusion (GPT-6 Astra High Thinking + SWE-2 High)",
              },
            ],
          },
        ],
      }),
    );
    const allOff = { model: pair, effort: "", contextSize: "", fast: false, thinking: false };
    // The pair is advertised in the LIVE menu fixture: applied verbatim.
    expect(resolveDevinAcpModelNegotiation(livePairCatalog, allOff, liveOption())).toMatchObject({
      status: "applied",
      configId: "model",
      value: pair,
    });
    // "default" spellings of the same inert seeds behave identically.
    expect(
      resolveDevinAcpModelNegotiation(
        livePairCatalog,
        { model: pair, effort: "default", contextSize: "default", fast: false, thinking: false },
        liveOption(),
      ),
    ).toMatchObject({ status: "applied", value: pair });
    // The resolver seam the structured session composes applies the same pair.
    expect(
      createDevinAcpModelResolver({ families: livePairCatalog })(allOff, liveOption()),
    ).toEqual({
      configId: "model",
      value: pair,
      currentValue: "swe-2-high",
    });
    // Meaningful switches still fail visibly on a session with NO
    // thought-level select — including the pre-fix stored seed of effort
    // "medium" the old global-ladder fallback produced: an effort with no
    // native carrier is thrown, never dropped.
    for (const config of [
      { model: pair, effort: "medium", contextSize: "", fast: false, thinking: false },
      { model: pair, effort: "high" },
      { model: pair, fast: true },
      { model: pair, thinking: true },
      { model: pair, contextSize: "1m" },
    ]) {
      expect(() =>
        resolveDevinAcpModelNegotiation(
          livePairCatalog,
          config,
          liveOption().map((option) =>
            option.id === "model" ? { ...option, currentValue: pair } : option,
          ),
        ),
      ).toThrowError(/Unsupported model configuration for Fusion/);
    }
  });

  it("carries a composite effort on the real thought-level selector and repeats it after the native echo", () => {
    // SOURCE+LIVE checkpoint L (tmp/devin/checkpoint-l-*): the first prompt on
    // the exact Fusion pair succeeded with an inert effort, the native session
    // then ECHOED thought_level "high" into the persisted config, and the
    // repeat submit with that stored effort failed "Unsupported model
    // configuration" — because the negotiation treated every meaningful
    // control as uncarryable. The real pair session exposes a separate
    // thought_level select with FIVE choices, and a standard write of "low"
    // was accepted and echoed on the SAME model id.
    const pair = "fusion-gpt-6-astra-high-sidekick-swe-2-high";
    const livePairCatalog = parseDevinModelCatalog(
      JSON.stringify({
        families: [
          {
            family_label: "Fusion",
            slug: "fusion",
            variants: [
              {
                model_uid: pair,
                label: "Fusion (GPT-6 Astra High Thinking + SWE-2 High)",
              },
            ],
          },
        ],
      }),
    );
    // Real checkpoint-L ladder (checkpoint-l-pair-low-native-echo.json):
    // low/medium/high/xhigh/max, current "high".
    const optionWithPairThought = (thoughtCurrent = "high") => [
      ...liveOption(),
      {
        id: "thought_level",
        type: "select",
        category: "thought_level",
        currentValue: thoughtCurrent,
        options: ["low", "medium", "high", "xhigh", "max"].map((value) => ({ value })),
      },
    ];
    // The native echo: the stored config now carries a MEANINGFUL effort on
    // the exact pair. The negotiation applies the pair verbatim — the effort
    // rides the thought-level select the shared sync validates and pushes.
    for (const effort of ["high", "low", "max"]) {
      expect(
        resolveDevinAcpModelNegotiation(
          livePairCatalog,
          { model: pair, effort, contextSize: "", fast: false, thinking: false },
          optionWithPairThought(),
        ),
      ).toMatchObject({ status: "applied", configId: "model", value: pair });
    }
    // The same shapes stay applied on the resolver seam the structured
    // session composes — the first AND the repeat submit resolve.
    expect(
      createDevinAcpModelResolver({ families: livePairCatalog })(
        { model: pair, effort: "high", contextSize: "", fast: false, thinking: false },
        optionWithPairThought(),
      ),
    ).toEqual({ configId: "model", value: pair, currentValue: "swe-2-high" });
    // Non-effort laddered controls still compose onto nothing, carrier or
    // not, and an effort bundled with one is thrown, not partially carried.
    for (const config of [
      { model: pair, effort: "high", fast: true },
      { model: pair, effort: "high", thinking: true },
      { model: pair, effort: "high", contextSize: "1m" },
      { model: pair, fast: true },
      { model: pair, thinking: true },
      { model: pair, contextSize: "1m" },
    ]) {
      expect(() =>
        resolveDevinAcpModelNegotiation(
          livePairCatalog,
          config,
          optionWithPairThought().map((option) =>
            option.id === "model" ? { ...option, currentValue: pair } : option,
          ),
        ),
      ).toThrowError(/Unsupported model configuration for Fusion/);
    }
    // A pair the menu stopped offering is a typed session rejection even with
    // a carrier-borne effort — never a substitution with another choice.
    const movedMenu = optionWithPairThought().map((option) =>
      option.id === "model" ? { ...option, options: [{ value: "swe-2-high" }] } : option,
    );
    expect(
      resolveDevinAcpModelNegotiation(livePairCatalog, { model: pair, effort: "high" }, movedMenu),
    ).toMatchObject({ status: "rejected-by-session", requested: pair });
  });

  it("prefers the plain representative for an unqualified family choice", () => {
    // Without explicit fast/context/thinking, a family selection must not
    // land on a specialty variant (Lightning/1M) by accident.
    const outcome = resolveDevinAcpModelNegotiation(
      foldedCatalog,
      { model: "claude-opus-4-6" },
      liveOption(),
    );
    expect(outcome).toMatchObject({ status: "applied", value: "claude-opus-4-6" });
  });

  it("keeps the CLI fold only as the unreadable-menu fallback", () => {
    // No flattened values to negotiate against: argv-identical catalog
    // semantics, including its typed rejection of impossible combinations.
    expect(
      resolveDevinAcpModelNegotiation(families, { model: "gpt-5-6-sol-medium", fast: true }, [
        { id: "model", type: "select", category: "model", currentValue: "x", options: [] },
      ]),
    ).toMatchObject({ status: "applied", value: "gpt-5-6-sol-medium-priority" });
    expect(() =>
      resolveDevinAcpModelNegotiation(
        [
          {
            id: "fusion-left-right",
            label: "Fusion",
            variants: [
              {
                id: "fusion-left-right",
                composite: "Left + Right",
                effort: "",
                thinking: false,
                fast: false,
                context: "default",
              },
            ],
          },
        ],
        { model: "fusion-left-right", effort: "max" },
        [{ id: "model", type: "select", category: "model", currentValue: "x", options: [] }],
      ),
    ).toThrowError(/Unsupported model configuration/);
  });
});

describe("Devin ACP launch resolution", () => {
  // The checkpoint-L pair: a saved config legitimately carries a non-empty
  // effort once the native thought-level write echoed it into the persisted
  // config. The ACP launch must not reject that pre-open, before the strict
  // post-open validation can run.
  const pair = "fusion-gpt-6-astra-high-sidekick-swe-2-high";
  const livePairCatalog = parseDevinModelCatalog(
    JSON.stringify({
      families: [
        {
          family_label: "Fusion",
          slug: "fusion",
          variants: [{ model_uid: pair, label: "Fusion (GPT-6 Astra High Thinking + SWE-2 High)" }],
        },
      ],
    }),
  );

  it("keeps a saved composite effort and the exact pair id for post-open validation", () => {
    // The native-echo shape: composite + meaningful effort resolves to the
    // EXACT pair id instead of throwing pre-open. Inert seeds behave the
    // same, so the composer's all-off submit is unaffected.
    for (const effort of ["high", ""]) {
      expect(
        resolveDevinAcpLaunchModel(livePairCatalog, {
          model: pair,
          effort,
          contextSize: "",
          fast: false,
          thinking: false,
        }),
      ).toBe(pair);
    }
    // The family id of an all-composite family is its first pair: the same
    // exact-choice deferral applies.
    expect(resolveDevinAcpLaunchModel(livePairCatalog, { model: pair, effort: "low" })).toBe(pair);
  });

  it("still fails the ACP open pre-negotiation on controls the pair cannot carry", () => {
    for (const config of [
      { model: pair, thinking: true },
      { model: pair, contextSize: "1m" },
    ]) {
      expect(() => resolveDevinAcpLaunchModel(livePairCatalog, config)).toThrowError(
        /Unsupported model configuration/,
      );
    }
  });

  it("keeps the strict CLI fold for regular families and their mismatches", () => {
    // Non-composite mapping and its typed rejection are unchanged — the
    // deferral is composite-effort only.
    expect(resolveDevinAcpLaunchModel(families, { model: "gpt-5-6-sol-medium", fast: true })).toBe(
      "gpt-5-6-sol-medium",
    );
    expect(() =>
      resolveDevinAcpLaunchModel(families, { model: "glm-5-2", effort: "high", contextSize: "1m" }),
    ).toThrowError(/Unsupported model configuration/);
    // The strict fold behind the Terminal/one-shot lanes still rejects an
    // explicit effort on the same pair — only the ACP lane defers it.
    expect(() => resolveDevinModel({ model: pair, effort: "high" }, livePairCatalog)).toThrowError(
      /Unsupported model configuration/,
    );
  });
});

describe("Devin cloud model resolution", () => {
  const cloudOptions = [
    {
      id: "devin_version",
      type: "select",
      currentValue: "devin-2-5",
      options: [{ value: "devin-2-5" }, { value: "devin-ultra" }, { value: "devin-auto" }],
    },
  ];

  it("resolves the private native-default intent to the live current cloud version", () => {
    // The sentinel is an INTENT, never a wire id: it resolves to the
    // option's own current value (a verifiable no-op set), never an
    // invented model id sent native.
    expect(
      createDevinAcpModelResolver({ families: [], cloud: true })(
        { model: DEVIN_CLOUD_DEFAULT_MODEL_ID },
        cloudOptions,
      ),
    ).toEqual({ configId: "devin_version", value: "devin-2-5", currentValue: "devin-2-5" });
    // No version option on the session: omit (the agent keeps its default;
    // strict selection surfaces the gap).
    expect(
      createDevinAcpModelResolver({ families: [], cloud: true })(
        { model: DEVIN_CLOUD_DEFAULT_MODEL_ID },
        [],
      ),
    ).toBeUndefined();
  });

  it("pushes an explicit cloud version only when the live menu advertises it exactly", () => {
    expect(
      createDevinAcpModelResolver({ families: [], cloud: true })(
        { model: "devin-ultra" },
        cloudOptions,
      ),
    ).toEqual({ configId: "devin_version", value: "devin-ultra", currentValue: "devin-2-5" });
    // The local CLI catalog is NEVER consulted on the cloud relay.
    const rejections: string[] = [];
    expect(() =>
      createDevinAcpModelResolver({
        families: foldedCatalog,
        cloud: true,
        onRejected: (rejection) => rejections.push(rejection.requested),
      })({ model: "swe-1-7-medium" }, cloudOptions),
    ).toThrowError(DevinAcpModelSelectionRejectedError);
    expect(rejections).toEqual(["swe-1-7-medium"]);
  });
});

describe("Devin independent ACP Fast carrier", () => {
  const pair = "fusion-pair-a";
  const pairCatalog = parseDevinModelCatalog(
    JSON.stringify({
      families: [
        {
          family_label: "Fusion",
          slug: "fusion",
          variants: [{ model_uid: pair, label: "Fusion (A + B)" }],
        },
      ],
    }),
  );
  const options = (currentModel: string, speed = true) => [
    {
      id: "model",
      category: "model",
      type: "select",
      currentValue: currentModel,
      options: [pair, "gpt-5-6-sol-medium", "gpt-5-6-sol-medium-priority"].map((value) => ({
        value,
      })),
    },
    {
      id: "thought_level",
      category: "thought_level",
      type: "select",
      currentValue: "high",
      options: ["low", "high"].map((value) => ({ value })),
    },
    ...(speed
      ? [
          {
            id: "speed",
            category: "model_config",
            type: "select",
            currentValue: "standard",
            options: ["standard", "fast"].map((value) => ({ value })),
          },
        ]
      : []),
  ];

  it("defers pair Fast until open while CLI pairs remain strict", () => {
    const config = { model: pair, effort: "high", fast: true };
    expect(resolveDevinAcpLaunchModel(pairCatalog, config)).toBe(pair);
    expect(() => resolveDevinModel(config, pairCatalog)).toThrow(/Unsupported model configuration/);
  });

  it("keeps the exact pair on repeated Fast and effort submits", () => {
    for (const fast of [true, false]) {
      expect(
        resolveDevinAcpModelNegotiation(
          pairCatalog,
          { model: pair, effort: "low", fast },
          options(pair),
        ),
      ).toMatchObject({ status: "applied", value: pair });
    }
  });

  it("rejects a current pair without a genuine Fast carrier", () => {
    expect(() =>
      resolveDevinAcpModelNegotiation(
        pairCatalog,
        { model: pair, fast: true },
        options(pair, false),
      ),
    ).toThrow(/Unsupported model configuration/);
    const extra = options(pair).map((option) =>
      option.id === "speed"
        ? { ...option, options: [...option.options, { value: "turbo" }] }
        : option,
    );
    expect(() =>
      resolveDevinAcpModelNegotiation(pairCatalog, { model: pair, fast: true }, extra),
    ).toThrow(/Unsupported model configuration/);
  });

  it("defers a target pair's Fast until strict sync refreshes its selectors", () => {
    expect(
      resolveDevinAcpModelNegotiation(
        pairCatalog,
        { model: pair, effort: "low", fast: true },
        options("gpt-5-6-sol-medium", false),
      ),
    ).toMatchObject({ status: "applied", value: pair });
  });

  it("does not admit unsupported pair modifiers alongside a Fast carrier", () => {
    for (const modifier of [{ thinking: true }, { contextSize: "1m" }, { effort: "max" }]) {
      expect(() =>
        resolveDevinAcpModelNegotiation(
          pairCatalog,
          { model: pair, fast: true, ...modifier },
          options(pair),
        ),
      ).toThrow(/Unsupported model configuration/);
    }
  });

  it("preserves direct model identity when independent speed owns Fast", () => {
    const model = "gpt-5-6-sol-medium";
    expect(resolveDevinAcpLaunchModel(families, { model, fast: true })).toBe(model);
    for (const fast of [true, false]) {
      expect(
        resolveDevinAcpModelNegotiation(families, { model, fast }, options(model)),
      ).toMatchObject({ status: "applied", value: model });
    }
    expect(resolveDevinModel({ model, fast: true }, families)).toBe("gpt-5-6-sol-medium-priority");
    expect(
      resolveDevinAcpModelNegotiation(families, { model, fast: true }, options(model, false)),
    ).toMatchObject({ status: "applied", value: "gpt-5-6-sol-medium-priority" });
  });
});

describe("devinAcknowledgedModelCarriesEffort", () => {
  // Provider-owned proof for the shared strict target validation: catalog
  // variant membership of the ACKNOWLEDGED model value — wire ids are
  // looked up, never parsed.
  const effortCatalog = parseDevinModelCatalog(
    JSON.stringify({
      families: [
        {
          family_label: "SWE-2",
          slug: "swe-2",
          variants: [
            { model_uid: "swe-2-medium", label: "SWE-2 Medium" },
            { model_uid: "swe-2-high", label: "SWE-2 High" },
          ],
        },
        {
          family_label: "Fusion",
          slug: "fusion",
          variants: [{ model_uid: "fusion-a-b", label: "Fusion (A + B)" }],
        },
      ],
    }),
  );
  const acknowledgedOptions = (currentValue: string | undefined) => [
    {
      id: "model",
      category: "model",
      type: "select",
      ...(currentValue === undefined ? {} : { currentValue }),
      options: [{ value: currentValue ?? "", name: currentValue ?? "" }],
    },
  ];
  const carrier = (config: Partial<ThreadConfig>, currentValue: string | undefined) =>
    devinAcknowledgedModelCarriesEffort(
      effortCatalog,
      { model: "", effort: "", contextSize: "", mode: "agent", ...config } as ThreadConfig,
      acknowledgedOptions(currentValue),
    );

  it("proves the acknowledged variant's encoded level", () => {
    expect(carrier({ effort: "high" }, "swe-2-high")).toBe(true);
    expect(carrier({ effort: "medium" }, "swe-2-medium")).toBe(true);
  });

  it("refuses everything the catalog does not encode", () => {
    // The pair's exact identity is the choice — it never claims a level.
    expect(carrier({ effort: "high" }, "fusion-a-b")).toBe(false);
    // A variant on a different level, an unknown id, and no acknowledgement.
    expect(carrier({ effort: "high" }, "swe-2-medium")).toBe(false);
    expect(carrier({ effort: "high" }, "opaque-unknown")).toBe(false);
    expect(carrier({ effort: "high" }, undefined)).toBe(false);
    // No meaningful request, no proof.
    expect(carrier({ effort: "" }, "swe-2-high")).toBe(false);
    expect(carrier({ effort: "default" }, "swe-2-high")).toBe(false);
  });
});
