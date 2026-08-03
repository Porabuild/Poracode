import { describe, expect, it } from "vitest";
import {
  crossagentSelectionUsageEntryKey,
  incrementAgentSelectionUsage,
  incrementCrossagentSelectionUsage,
  normalizeCrossagentTags,
  rankCrossagentCandidates,
  rankCrossagentModels,
  removeCrossagentRoutingOverride,
  removeCrossagentSelectionUsageEntry,
  retagCrossagentSelectionUsageEntry,
  upsertCrossagentRoutingOverride,
  type CrossagentRankingCandidate,
} from "./crossagentRanking";
import { MAX_CROSSAGENT_ROUTING_OVERRIDES } from "./settings";

const candidates: CrossagentRankingCandidate[] = [
  {
    provider: "claude",
    defaultModel: "sonnet",
    models: [{ id: "sonnet", efforts: ["high"], defaultEffort: "high", fastAvailable: false }],
  },
  {
    provider: "kimi",
    defaultModel: "k3",
    models: [{ id: "k3", efforts: ["high", "max"], defaultEffort: "high", fastAvailable: false }],
  },
  {
    provider: "codex",
    defaultModel: "gpt",
    models: [{ id: "gpt", efforts: ["high"], defaultEffort: "high", fastAvailable: true }],
  },
];

describe("rankCrossagentCandidates", () => {
  it("uses matching task affinity ahead of higher global Crossagents popularity", () => {
    const preferences = {
      crossagentSelectionUsage: [
        {
          agentKind: "claude",
          modelId: "sonnet",
          effort: "high",
          fast: false,
          tags: ["frontend", "ui"],
          count: 3,
          lastUsedAt: 10,
        },
        {
          agentKind: "codex",
          modelId: "gpt",
          effort: "high",
          fast: true,
          tags: ["backend", "bugfix"],
          count: 20,
          lastUsedAt: 20,
        },
      ],
      favoriteModels: [],
      agentSelectionUsage: [],
    };

    const contextual = rankCrossagentCandidates(candidates, {
      ...preferences,
      contextTags: ["FE", "user-interface"],
    });
    const global = rankCrossagentCandidates(candidates, preferences);

    expect(contextual[0]).toMatchObject({
      provider: "claude",
      source: "tag-affinity",
      matchedTags: ["frontend", "ui"],
      learnedTags: [
        { tag: "frontend", count: 3 },
        { tag: "ui", count: 3 },
      ],
    });
    expect(global[0]?.provider).toBe("codex");
  });

  it("uses task affinity to select a provider's learned model configuration", () => {
    const [ranked] = rankCrossagentCandidates(
      [
        {
          provider: "claude",
          defaultModel: "sonnet",
          models: [
            { id: "sonnet", efforts: ["high"], defaultEffort: "high", fastAvailable: false },
            { id: "opus", efforts: ["high", "max"], defaultEffort: "high", fastAvailable: true },
          ],
        },
      ],
      {
        crossagentSelectionUsage: [
          {
            agentKind: "claude",
            modelId: "sonnet",
            effort: "high",
            fast: false,
            tags: ["review"],
            count: 20,
            lastUsedAt: 20,
          },
          {
            agentKind: "claude",
            modelId: "opus",
            effort: "max",
            fast: true,
            tags: ["design", "frontend"],
            count: 3,
            lastUsedAt: 10,
          },
        ],
        favoriteModels: [],
        agentSelectionUsage: [],
        contextTags: ["design"],
      },
    );

    expect(ranked?.preferredSelection).toEqual({
      model: "opus",
      effort: "max",
      fast: true,
    });
  });

  it("puts explicit Crossagents popularity ahead of favorites and normal usage", () => {
    const ranked = rankCrossagentCandidates(candidates, {
      crossagentSelectionUsage: [
        {
          agentKind: "kimi",
          modelId: "k3",
          effort: "max",
          fast: false,
          count: 7,
          lastUsedAt: 20,
        },
      ],
      favoriteModels: [{ agentKind: "claude", modelId: "sonnet", presentationMode: "gui" }],
      agentSelectionUsage: [
        {
          agentKind: "codex",
          modelId: "gpt",
          effort: "high",
          fast: true,
          count: 50,
          lastUsedAt: 30,
        },
      ],
    });

    // Favorites share the composer-usage tier: codex's real usage outranks
    // claude's zero-use favorite.
    expect(ranked.map((entry) => [entry.provider, entry.source])).toEqual([
      ["kimi", "crossagent-usage"],
      ["codex", "agent-usage"],
      ["claude", "favorite"],
    ]);
    expect(ranked[0]?.preferredSelection).toEqual({
      model: "k3",
      effort: "max",
      fast: false,
    });
  });

  it("keeps provider votes but ignores unavailable model, reasoning, and Fast details", () => {
    const ranked = rankCrossagentCandidates(candidates.slice(0, 2), {
      crossagentSelectionUsage: [
        {
          agentKind: "removed-provider",
          modelId: "gone",
          fast: false,
          count: 100,
          lastUsedAt: 100,
        },
        {
          agentKind: "kimi",
          modelId: "removed-model",
          effort: "max",
          fast: false,
          count: 90,
          lastUsedAt: 90,
        },
        {
          agentKind: "kimi",
          modelId: "k3",
          effort: "ultra",
          fast: false,
          count: 80,
          lastUsedAt: 80,
        },
        {
          agentKind: "kimi",
          modelId: "k3",
          effort: "max",
          fast: true,
          count: 70,
          lastUsedAt: 70,
        },
      ],
      favoriteModels: [],
      agentSelectionUsage: [],
    });

    expect(ranked.map((entry) => entry.provider)).toEqual(["kimi", "claude"]);
    expect(ranked[0]).toMatchObject({
      source: "crossagent-usage",
      preferredSelection: { model: "k3", effort: "max", fast: false },
    });
    expect(ranked[1]?.source).toBe("built-in");
  });

  it("ranks providers only from explicit provider choices and resolves other fields independently", () => {
    const ranked = rankCrossagentCandidates(
      [
        {
          provider: "claude",
          defaultModel: "sonnet",
          models: [
            { id: "sonnet", efforts: ["high"], defaultEffort: "high", fastAvailable: false },
            { id: "opus", efforts: ["high", "max"], defaultEffort: "high", fastAvailable: true },
          ],
        },
        candidates[1]!,
      ],
      {
        crossagentSelectionUsage: [
          {
            agentKind: "claude",
            modelId: "sonnet",
            effort: "high",
            fast: false,
            count: 50,
            lastUsedAt: 30,
            explicitFields: {
              provider: false,
              model: false,
              effort: false,
              fast: false,
            },
          },
          {
            agentKind: "kimi",
            modelId: "k3",
            effort: "max",
            fast: false,
            count: 2,
            lastUsedAt: 20,
            explicitFields: {
              provider: true,
              model: false,
              effort: true,
              fast: false,
            },
          },
          {
            agentKind: "claude",
            modelId: "opus",
            effort: "max",
            fast: true,
            count: 1,
            lastUsedAt: 10,
            explicitFields: {
              provider: false,
              model: true,
              effort: true,
              fast: true,
            },
          },
        ],
        favoriteModels: [],
        agentSelectionUsage: [],
      },
    );

    expect(ranked.map((entry) => [entry.provider, entry.source])).toEqual([
      ["kimi", "crossagent-usage"],
      ["claude", "built-in"],
    ]);
    expect(ranked[0]?.preferredSelection).toEqual({
      model: "k3",
      effort: "max",
      fast: false,
    });
    expect(ranked[1]?.preferredSelection).toEqual({
      model: "opus",
      effort: "max",
      fast: true,
    });
  });

  it("puts the most-specific available manual task route ahead of learned affinity", () => {
    const ranked = rankCrossagentCandidates(candidates, {
      crossagentSelectionUsage: [
        {
          agentKind: "codex",
          modelId: "gpt",
          effort: "high",
          fast: true,
          tags: ["frontend", "ui"],
          count: 100,
          lastUsedAt: 100,
        },
      ],
      routingOverrides: [
        {
          tags: ["frontend"],
          agentKind: "claude",
          modelId: "sonnet",
          effort: "high",
          updatedAt: 20,
        },
        {
          tags: ["frontend", "ui"],
          agentKind: "kimi",
          modelId: "k3",
          effort: "max",
          fast: false,
          updatedAt: 10,
        },
      ],
      favoriteModels: [],
      agentSelectionUsage: [],
      contextTags: ["FE", "user-interface", "design"],
    });

    expect(ranked[0]).toMatchObject({
      provider: "kimi",
      source: "manual-override",
      matchedTags: ["frontend", "ui"],
      preferredSelection: {
        model: "k3",
        effort: "max",
        fast: false,
      },
    });
  });

  it("ignores manual routes whose provider or selection is unavailable", () => {
    const ranked = rankCrossagentCandidates(candidates.slice(0, 2), {
      crossagentSelectionUsage: [],
      routingOverrides: [
        {
          tags: ["review"],
          agentKind: "removed-provider",
          updatedAt: 30,
        },
        {
          tags: ["review"],
          agentKind: "kimi",
          modelId: "removed-model",
          updatedAt: 20,
        },
      ],
      favoriteModels: [],
      agentSelectionUsage: [],
      contextTags: ["review"],
    });

    expect(ranked.map((entry) => [entry.provider, entry.source])).toEqual([
      ["claude", "built-in"],
      ["kimi", "built-in"],
    ]);
  });

  it("falls back to a less-specific valid manual route", () => {
    const ranked = rankCrossagentCandidates(candidates.slice(0, 2), {
      crossagentSelectionUsage: [],
      routingOverrides: [
        {
          tags: ["frontend", "ui"],
          agentKind: "kimi",
          modelId: "removed-model",
          updatedAt: 20,
        },
        {
          tags: ["frontend"],
          agentKind: "claude",
          modelId: "sonnet",
          updatedAt: 10,
        },
      ],
      favoriteModels: [],
      agentSelectionUsage: [],
      contextTags: ["frontend", "ui"],
    });

    expect(ranked[0]).toMatchObject({
      provider: "claude",
      source: "manual-override",
      matchedTags: ["frontend"],
    });
  });

  it("resolves effort-only and Fast-only manual routes against available models", () => {
    const provider: CrossagentRankingCandidate = {
      provider: "claude",
      defaultModel: "sonnet",
      models: [
        {
          id: "sonnet",
          efforts: ["high"],
          defaultEffort: "high",
          fastAvailable: false,
        },
        {
          id: "opus",
          efforts: ["high", "max"],
          defaultEffort: "high",
          fastAvailable: true,
        },
      ],
    };
    const basePreferences = {
      crossagentSelectionUsage: [],
      favoriteModels: [],
      agentSelectionUsage: [],
    };

    expect(
      rankCrossagentCandidates([provider], {
        ...basePreferences,
        routingOverrides: [
          {
            tags: ["review"],
            agentKind: "claude",
            effort: "max",
            updatedAt: 10,
          },
        ],
        contextTags: ["review"],
      })[0]?.preferredSelection,
    ).toEqual({ model: "opus", effort: "max", fast: false });
    expect(
      rankCrossagentCandidates([provider], {
        ...basePreferences,
        routingOverrides: [
          {
            tags: ["implementation"],
            agentKind: "claude",
            fast: true,
            updatedAt: 20,
          },
        ],
        contextTags: ["implementation"],
      })[0]?.preferredSelection,
    ).toEqual({ model: "opus", effort: "high", fast: true });
  });

  it("keeps an explicit provider vote when its old model details are unavailable", () => {
    const ranked = rankCrossagentCandidates(candidates.slice(0, 2), {
      crossagentSelectionUsage: [
        {
          agentKind: "claude",
          modelId: "removed-model",
          effort: "removed-effort",
          fast: true,
          tags: ["review"],
          count: 5,
          lastUsedAt: 20,
          explicitFields: {
            provider: true,
            model: true,
            effort: true,
            fast: true,
          },
        },
        {
          agentKind: "kimi",
          modelId: "k3",
          effort: "high",
          fast: false,
          tags: ["implementation"],
          count: 2,
          lastUsedAt: 10,
        },
      ],
      favoriteModels: [],
      agentSelectionUsage: [],
      contextTags: ["review"],
    });

    expect(ranked[0]).toMatchObject({
      provider: "claude",
      source: "tag-affinity",
      usageCount: 5,
      preferredSelection: { model: "sonnet", effort: "high", fast: false },
      learnedTags: [{ tag: "review", count: 5 }],
    });
  });
});

describe("rankCrossagentModels", () => {
  const cursorAndClaude: CrossagentRankingCandidate[] = [
    {
      provider: "cursor",
      defaultModel: "fable",
      models: [
        { id: "fable", efforts: ["high"], defaultEffort: "high", fastAvailable: false },
        { id: "grok", efforts: ["high"], defaultEffort: "high", fastAvailable: false },
        { id: "k3", efforts: ["high"], defaultEffort: "high", fastAvailable: false },
      ],
    },
    {
      provider: "claude",
      defaultModel: "opus",
      models: [
        { id: "opus", efforts: ["high", "max"], defaultEffort: "high", fastAvailable: true },
      ],
    },
  ];

  it("interleaves models across providers by their own usage", () => {
    const ranked = rankCrossagentModels(cursorAndClaude, {
      crossagentSelectionUsage: [
        { agentKind: "cursor", modelId: "fable", fast: false, count: 9, lastUsedAt: 30 },
        { agentKind: "claude", modelId: "opus", fast: false, count: 5, lastUsedAt: 20 },
        { agentKind: "cursor", modelId: "grok", fast: false, count: 3, lastUsedAt: 10 },
      ],
      favoriteModels: [],
      agentSelectionUsage: [],
    });

    expect(ranked.map((entry) => [entry.provider, entry.model, entry.rank])).toEqual([
      ["cursor", "fable", 1],
      ["claude", "opus", 2],
      ["cursor", "grok", 3],
      ["cursor", "k3", 4],
    ]);
    expect(ranked[0]).toMatchObject({ preferred: true, source: "crossagent-usage" });
    expect(ranked[2]).toMatchObject({
      preferred: false,
      source: "crossagent-usage",
      usageCount: 3,
    });
    expect(ranked[3]).toMatchObject({ preferred: false, source: "built-in" });
  });

  it("keeps the global #1 aligned with the top provider's preferred selection", () => {
    const providerRanked = rankCrossagentCandidates(candidates, {
      crossagentSelectionUsage: [
        { agentKind: "kimi", modelId: "k3", effort: "max", fast: false, count: 7, lastUsedAt: 20 },
      ],
      favoriteModels: [],
      agentSelectionUsage: [],
    });
    const modelRanked = rankCrossagentModels(candidates, {
      crossagentSelectionUsage: [
        { agentKind: "kimi", modelId: "k3", effort: "max", fast: false, count: 7, lastUsedAt: 20 },
      ],
      favoriteModels: [],
      agentSelectionUsage: [],
    });

    expect(modelRanked[0]).toMatchObject({
      provider: providerRanked[0]?.provider,
      model: providerRanked[0]?.preferredSelection.model,
      effort: providerRanked[0]?.preferredSelection.effort,
      preferred: true,
    });
  });

  it("ranks favorites and per-model learned tags on non-preferred models", () => {
    const ranked = rankCrossagentModels(cursorAndClaude, {
      crossagentSelectionUsage: [
        {
          agentKind: "cursor",
          modelId: "grok",
          fast: false,
          tags: ["implementation"],
          count: 2,
          lastUsedAt: 10,
        },
      ],
      favoriteModels: [{ agentKind: "cursor", modelId: "k3", presentationMode: "gui" }],
      agentSelectionUsage: [],
    });

    // grok carries cursor's provider votes (preferred), k3 is a favorite,
    // then built-in order.
    expect(ranked.map((entry) => [entry.provider, entry.model])).toEqual([
      ["cursor", "grok"],
      ["cursor", "k3"],
      ["claude", "opus"],
      ["cursor", "fable"],
    ]);
    expect(ranked[0]?.learnedTags).toEqual([{ tag: "implementation", count: 2 }]);
    expect(ranked[1]?.source).toBe("favorite");
  });
});

describe("manual Crossagents routing overrides", () => {
  it("reclassifies an exact normalized tag set and removes it by aliases", () => {
    const initial = [
      {
        tags: ["frontend", "ui"],
        agentKind: "claude",
        modelId: "sonnet",
        updatedAt: 10,
      },
    ];
    const reclassified = upsertCrossagentRoutingOverride(initial, {
      tags: ["User Interface", "FE"],
      agentKind: "kimi",
      modelId: "k3",
      effort: "max",
      updatedAt: 20,
    });

    expect(reclassified).toEqual([
      {
        tags: ["frontend", "ui"],
        agentKind: "kimi",
        modelId: "k3",
        effort: "max",
        updatedAt: 20,
      },
    ]);
    expect(removeCrossagentRoutingOverride(reclassified, ["front-end", "ui"])).toEqual([]);
  });

  it("caps the number of persisted manual routes", () => {
    let overrides: ReturnType<typeof upsertCrossagentRoutingOverride> = [];
    for (let index = 0; index <= MAX_CROSSAGENT_ROUTING_OVERRIDES; index += 1) {
      overrides = upsertCrossagentRoutingOverride(overrides, {
        tags: [`task-${index}`],
        agentKind: "claude",
        updatedAt: index,
      });
    }

    expect(overrides).toHaveLength(MAX_CROSSAGENT_ROUTING_OVERRIDES);
    expect(overrides[0]?.tags).toEqual([`task-${MAX_CROSSAGENT_ROUTING_OVERRIDES}`]);
    expect(overrides.at(-1)?.tags).toEqual(["task-1"]);
  });
});

describe("incrementAgentSelectionUsage", () => {
  it("increments the exact provider/model/effort/Fast tuple", () => {
    const once = incrementAgentSelectionUsage(
      [],
      [{ agentKind: "kimi", modelId: "k3", effort: "max", fast: false }],
      10,
    );
    const twice = incrementAgentSelectionUsage(
      once,
      [{ agentKind: "kimi", modelId: "k3", effort: "max", fast: false }],
      20,
    );

    expect(twice).toEqual([
      {
        agentKind: "kimi",
        modelId: "k3",
        effort: "max",
        fast: false,
        count: 2,
        lastUsedAt: 20,
      },
    ]);
  });
});

describe("incrementCrossagentSelectionUsage", () => {
  it("merges legacy entries with equivalent fully explicit selections", () => {
    const next = incrementCrossagentSelectionUsage(
      [
        {
          agentKind: "claude",
          modelId: "opus",
          effort: "max",
          fast: true,
          tags: ["review"],
          count: 2,
          lastUsedAt: 10,
        },
      ],
      [
        {
          agentKind: "claude",
          modelId: "opus",
          effort: "max",
          fast: true,
          tags: ["review"],
          explicitFields: {
            provider: true,
            model: true,
            effort: true,
            fast: true,
          },
        },
      ],
      20,
    );

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ count: 3, lastUsedAt: 20 });
  });

  it("keeps differently explicit selections in separate popularity buckets", () => {
    const base = {
      agentKind: "kimi",
      modelId: "k3",
      effort: "max",
      fast: false,
    };
    const providerOnly = incrementCrossagentSelectionUsage(
      [],
      [
        {
          ...base,
          explicitFields: {
            provider: true,
            model: false,
            effort: false,
            fast: false,
          },
        },
      ],
      10,
    );
    const full = incrementCrossagentSelectionUsage(
      providerOnly,
      [
        {
          ...base,
          explicitFields: {
            provider: true,
            model: true,
            effort: true,
            fast: true,
          },
        },
      ],
      20,
    );

    expect(full).toHaveLength(2);
    expect(full.map((entry) => entry.count)).toEqual([1, 1]);
  });

  it("canonicalizes aliases and keeps different task classifications separate", () => {
    const explicitFields = {
      provider: true,
      model: true,
      effort: true,
      fast: true,
    };
    const frontend = incrementCrossagentSelectionUsage(
      [],
      [
        {
          agentKind: "claude",
          modelId: "opus",
          effort: "max",
          fast: true,
          tags: ["FE", "User Interface"],
          explicitFields,
        },
      ],
      10,
    );
    const review = incrementCrossagentSelectionUsage(
      frontend,
      [
        {
          agentKind: "claude",
          modelId: "opus",
          effort: "max",
          fast: true,
          tags: ["code review"],
          explicitFields,
        },
      ],
      20,
    );

    expect(review.map((entry) => entry.tags)).toEqual([["review"], ["frontend", "ui"]]);
  });
});

describe("normalizeCrossagentTags", () => {
  it("normalizes aliases, removes duplicates, and bounds the tag list", () => {
    expect(
      normalizeCrossagentTags([
        " FE ",
        "front-end",
        "User Interface",
        "Code Review",
        "sim driver",
        "backend",
        "extra",
      ]),
    ).toEqual(["backend", "frontend", "review", "simulator", "ui"]);
  });
});

describe("learned memory edits", () => {
  const entry = {
    agentKind: "kimi",
    modelId: "k3",
    effort: "max",
    fast: false,
    count: 4,
    lastUsedAt: 10,
    tags: ["mobile", "simulator"],
  };
  const other = {
    agentKind: "claude",
    modelId: "sonnet",
    fast: false,
    count: 2,
    lastUsedAt: 5,
    tags: ["frontend"],
  };

  it("removes one entry and keeps the rest", () => {
    const next = removeCrossagentSelectionUsageEntry([entry, other], {
      agentKind: "kimi",
      modelId: "k3",
      effort: "max",
      fast: false,
      tags: ["mobile", "simulator"],
    });
    expect(next).toEqual([other]);
  });

  it("retags an entry with normalized tags", () => {
    const next = retagCrossagentSelectionUsageEntry(
      [entry, other],
      {
        agentKind: "kimi",
        modelId: "k3",
        effort: "max",
        fast: false,
        tags: ["mobile", "simulator"],
      },
      ["Mobile Sim", "testing"],
    );
    expect(next[0]).toMatchObject({ agentKind: "kimi", count: 4, tags: ["simulator", "testing"] });
    expect(next).toHaveLength(2);
  });

  it("merges counts when a retag collides with an existing entry", () => {
    const duplicate = { ...entry, count: 3, lastUsedAt: 50, tags: ["frontend"] };
    const next = retagCrossagentSelectionUsageEntry(
      [entry, duplicate],
      {
        agentKind: "kimi",
        modelId: "k3",
        effort: "max",
        fast: false,
        tags: ["mobile", "simulator"],
      },
      ["frontend"],
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      agentKind: "kimi",
      count: 7,
      lastUsedAt: 50,
      tags: ["frontend"],
    });
  });

  it("drops the tags field when the last tag is removed", () => {
    const next = retagCrossagentSelectionUsageEntry(
      [entry],
      {
        agentKind: "kimi",
        modelId: "k3",
        effort: "max",
        fast: false,
        tags: ["mobile", "simulator"],
      },
      [],
    );
    expect(next[0]).not.toHaveProperty("tags");
  });

  it("removes only the entry with matching explicit fields", () => {
    const explicit = {
      provider: true,
      model: true,
      effort: true,
      fast: true,
    };
    const implicitProvider = {
      ...entry,
      explicitFields: { ...explicit, provider: false },
    };
    const selected = { ...entry, explicitFields: explicit };

    expect(
      removeCrossagentSelectionUsageEntry(
        [selected, implicitProvider],
        crossagentSelectionUsageEntryKey(selected),
      ),
    ).toEqual([implicitProvider]);
  });

  it("retags only the entry with matching explicit fields", () => {
    const explicit = {
      provider: true,
      model: true,
      effort: true,
      fast: true,
    };
    const implicitProvider = {
      ...entry,
      explicitFields: { ...explicit, provider: false },
    };
    const selected = { ...entry, explicitFields: explicit };
    const next = retagCrossagentSelectionUsageEntry(
      [selected, implicitProvider],
      crossagentSelectionUsageEntryKey(selected),
      ["frontend"],
    );

    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ tags: ["frontend"], explicitFields: explicit });
    expect(next[1]).toEqual(implicitProvider);
  });
});
