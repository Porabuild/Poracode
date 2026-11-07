import { describe, expect, it } from "vitest";
import type { SavedCrew } from "@/shared/crew";
import { withCrewPickerItems } from "./crewPickerItems";
import type { ProviderModelCrewRow, ProviderModelRow } from "./types";

const makeCrew = (id: string, metadata: Partial<SavedCrew> = {}): SavedCrew => ({
  id,
  name: id,
  lead: { agentKind: "example", model: "lead" },
  policy: "crew-only",
  roles: [
    { id: "builder", label: "Builder", selection: { agentKind: "example", model: "helper" } },
  ],
  ...metadata,
});
const row = (crew: SavedCrew): ProviderModelCrewRow => ({
  type: "crew",
  id: `crew:${crew.id}`,
  crewId: crew.id,
  name: crew.name,
  leadLabel: "Lead",
  leadKind: "example",
  helperKinds: [],
  details: "details",
  isCurrent: false,
  isFavorite: crew.favorite ?? false,
});
const model = (id: string, lastUsedAt?: number): ProviderModelRow => ({
  type: "model",
  id: `recent:example:${id}`,
  providerKind: "example",
  providerKey: "example",
  hiddenModelsKey: "example",
  providerLabel: "Example",
  modelId: id,
  label: id,
  isFavorite: false,
  recentRef: {
    agentKind: "example",
    modelId: id,
    ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
  },
});

describe("crew picker sections", () => {
  it("puts crew shortcuts alongside models above Poracode and deduplicates favorites from recent", () => {
    const crews = [
      makeCrew("starred", { favorite: true, lastUsedAt: 30 }),
      makeCrew("used", { lastUsedAt: 20 }),
    ];
    const rows = withCrewPickerItems(
      [model("latest", 25), model("older", 10)],
      crews.map(row),
      [],
      crews,
    );
    expect(rows.map((entry) => entry.id)).toEqual([
      "header:fav",
      "fav:crew:starred",
      "header:recent",
      "recent:example:latest",
      "recent:crew:used",
      "recent:example:older",
      "header-crews",
      "crew:starred",
      "crew:used",
    ]);
    expect(new Set(rows.map((entry) => entry.id)).size).toBe(rows.length);
  });

  it("omits filtered or deleted crews and retains pre-timestamp model history order", () => {
    const crews = [makeCrew("hidden", { favorite: true }), makeCrew("used", { lastUsedAt: 20 })];
    const rows = withCrewPickerItems([model("b"), model("a")], [], [], crews);
    expect(rows.map((entry) => entry.id)).toEqual([
      "header:recent",
      "recent:example:b",
      "recent:example:a",
    ]);
  });

  it("keeps inline favorites in a locked provider list", () => {
    const saved = makeCrew("saved");
    const { recentRef: _recentRef, ...plainModel } = model("lead");
    const inlineFavorite: ProviderModelRow = {
      ...plainModel,
      id: "model:example:lead",
      favoriteRef: { agentKind: "example", modelId: "lead" },
      isFavorite: true,
    };
    const rows = withCrewPickerItems([inlineFavorite], [row(saved)], [], [saved]);
    expect(rows.map((entry) => entry.id)).toEqual([
      "header-crews",
      "crew:saved",
      "model:example:lead",
    ]);
  });

  it("caps the combined recent section at five entries", () => {
    const crews = Array.from({ length: 6 }, (_, index) =>
      makeCrew(String(index), { lastUsedAt: index }),
    );
    const rows = withCrewPickerItems([model("latest", 10)], crews.map(row), [], crews);
    expect(rows.slice(1, 6).map((entry) => entry.id)).toEqual([
      "recent:example:latest",
      "recent:crew:5",
      "recent:crew:4",
      "recent:crew:3",
      "recent:crew:2",
    ]);
    expect(rows[6]?.type).toBe("header-crews");
  });
});
