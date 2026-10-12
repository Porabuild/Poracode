import { describe, expect, it } from "vitest";
import { buildMuseCatalogCapabilities } from "./modelCatalog";

describe("buildMuseCatalogCapabilities", () => {
  const base = [
    { id: "muse-spark-1.3", label: "Muse Spark 1.3" },
    { id: "muse-spark-1.1", label: "Muse Spark 1.1" },
  ];
  const efforts = ["low", "medium", "high"];

  it("projects Wonder models with their native effort choices and defaults", () => {
    const result = buildMuseCatalogCapabilities(
      base,
      {
        providerId: "meta",
        profileId: "tbh",
        source: "providerCatalog",
        models: [
          {
            id: "muse-wonder-1.0",
            label: "muse-wonder-1.0",
            contextLimit: 1_007_997,
            isDefault: true,
            efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
            defaultEffort: "high",
          },
          {
            id: "muse-wonder-full-1.0",
            label: "muse-wonder-full-1.0",
            contextLimit: 1_007_997,
            isDefault: false,
            efforts: ["high", "xhigh", "max"],
            defaultEffort: "max",
          },
          {
            id: "muse-spark-1.2",
            label: "muse-spark-1.2",
            contextLimit: null,
            isDefault: false,
            efforts: ["minimal", "low", "medium", "high", "xhigh"],
          },
        ],
      },
      ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"],
    );
    expect(result?.models).toEqual([
      { id: "muse-wonder-1.0", label: "Muse Wonder 1.0" },
      { id: "muse-wonder-full-1.0", label: "Muse Wonder Full 1.0" },
      { id: "muse-spark-1.2", label: "Muse Spark 1.2" },
    ]);
    expect(result?.modelEfforts["muse-wonder-full-1.0"]).toEqual(["high", "xhigh", "max"]);
    expect(result?.modelEfforts["muse-spark-1.2"]).not.toContain("max");
    expect(result?.efforts).toEqual(["minimal", "low", "medium", "high", "xhigh", "max"]);
    expect(result?.modelDefaultEfforts).toEqual({
      "muse-wonder-1.0": "high",
      "muse-wonder-full-1.0": "max",
    });
  });

  it("keeps explicit empty ladders and ignores a default outside the model's choices", () => {
    const result = buildMuseCatalogCapabilities(
      base,
      {
        providerId: "meta",
        profileId: null,
        source: "providerCatalog",
        models: [
          {
            id: "empty",
            label: "Empty",
            contextLimit: null,
            isDefault: false,
            efforts: [],
            defaultEffort: "high",
          },
          {
            id: "limited",
            label: "Limited",
            contextLimit: null,
            isDefault: false,
            efforts: ["low"],
            defaultEffort: "max",
          },
          { id: "legacy", label: "Legacy", contextLimit: null, isDefault: false },
        ],
      },
      efforts,
    );
    expect(result?.modelEfforts).toEqual({ empty: [], limited: ["low"], legacy: efforts });
    expect(result?.modelDefaultEfforts).toEqual({});
  });

  it("returns the accepted live subset and ignores only an empty catalog", () => {
    expect(
      buildMuseCatalogCapabilities(
        base,
        {
          models: [
            {
              id: "muse-spark-1.3",
              label: "muse-spark-1.3",
              contextLimit: null,
              isDefault: false,
            },
          ],
          source: "providerCatalog",
          providerId: "meta",
          profileId: null,
        },
        efforts,
      )?.models,
    ).toEqual([{ id: "muse-spark-1.3", label: "Muse Spark 1.3" }]);
    expect(
      buildMuseCatalogCapabilities(
        base,
        { models: [], source: "bundledCatalog", providerId: "meta", profileId: "tbh" },
        efforts,
      ),
    ).toBeNull();
  });

  it("uses catalog ids with catalog labels and limits on the given ladder", () => {
    const probed = buildMuseCatalogCapabilities(
      base,
      {
        models: [
          {
            id: "muse-spark-1.9",
            label: "Muse Spark 1.9",
            contextLimit: 2_000_000,
            isDefault: true,
          },
          { id: "", label: "blank", contextLimit: null, isDefault: false },
        ],
        source: "providerCatalog",
        providerId: "meta",
        profileId: null,
      },
      efforts,
    );
    expect(probed?.models.map((m) => m.id)).toEqual(["muse-spark-1.9"]);
    expect(probed?.modelEfforts["muse-spark-1.9"]).toEqual(efforts);
    expect(probed?.modelContextSizes?.["muse-spark-1.9"]).toEqual(["2M"]);
    expect(probed?.modelContextSizes?.["muse-spark-1.3"]).toBeUndefined();
  });

  it("humanizes blank catalog labels and prefers catalog limits for known ids", () => {
    const probed = buildMuseCatalogCapabilities(
      base,
      {
        models: [
          {
            id: "muse-spark-1.3",
            label: "Muse Spark 1.3",
            contextLimit: 2_000_000,
            isDefault: false,
          },
          { id: "muse-spark-1.9-contributor", label: "", contextLimit: null, isDefault: false },
        ],
        source: "providerCatalog",
        providerId: "meta",
        profileId: null,
      },
      efforts,
    );
    expect(probed?.models.at(-1)).toEqual({
      id: "muse-spark-1.9-contributor",
      label: "Muse Spark 1.9 Contributor",
    });
    expect(probed?.modelContextSizes?.["muse-spark-1.3"]).toEqual(["2M"]);
  });
});
