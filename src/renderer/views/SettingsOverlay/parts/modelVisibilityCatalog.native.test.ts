import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { agentStatusSchema } from "@/shared/contracts";
import {
  buildProviderVisibilityCatalog,
  computeTargetToggleUpdates,
  modelRowCheckState,
  resolveEffectiveHiddenIdsByKey,
} from "./modelVisibilityCatalog";

it("pins the native settings fixture to PWA family, surface, defaults and edit semantics", () => {
  const fixture = JSON.parse(
    readFileSync("protocol/remote/v3/fixtures/client-model-visibility.json", "utf8"),
  );
  expect(fixture.version).toBe(1);
  const { groups, surfaceProviders } = buildProviderVisibilityCatalog({
    agents: fixture.agents.map((agent: unknown) => agentStatusSchema.parse(agent)),
    providerOrder: fixture.providerOrder,
  });
  expect(
    groups.map((group) => ({
      kind: group.kind,
      labels: group.unifiedModels.map((row) => row.label),
      keys: group.surfaces.map((surface) => surface.hiddenModelsKey),
    })),
  ).toEqual(fixture.expectedGroups);
  const resolved = resolveEffectiveHiddenIdsByKey(surfaceProviders, fixture.savedHidden);
  expect(
    Object.fromEntries(Object.entries(resolved).map(([key, ids]) => [key, [...ids].sort()])),
  ).toEqual(
    Object.fromEntries(
      Object.entries(fixture.expectedEffectiveHidden).map(([key, ids]) => [
        key,
        (ids as string[]).toSorted(),
      ]),
    ),
  );
  const hidden = new Map(Object.entries(resolved).map(([key, ids]) => [key, new Set(ids)]));
  const family = groups[0]!.unifiedModels[0]!;
  expect(family.targets[0]!.modelIds).toEqual(["pro", "pro-fast"]);
  expect(modelRowCheckState(family, hidden)).toBe("all");
  const shared = groups[1]!.unifiedModels[0]!;
  expect(modelRowCheckState(shared, hidden)).toBe("some");
  const changes = computeTargetToggleUpdates(shared.targets, false, hidden);
  expect(changes.get("named-fixture")).toEqual(["remote/terminal", "retired-model"]);
  expect(changes.get("named-fixture-bridge")).toEqual([]);
  expect(changes.has("unrelated")).toBe(false);
});
