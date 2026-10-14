import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readAgentCommandOutput: vi.fn<() => Promise<{ ok: boolean; stdout: string; stderr: string }>>(),
}));
vi.mock("../base", () => ({ readAgentCommandOutput: mocks.readAgentCommandOutput }));

import {
  cachedDevinModelsForKey,
  devinModelCatalogKey,
  invalidateDevinModelCaches,
  loadDevinModelsForKey,
  warmDevinModels,
} from "./modelCatalog";

const catalogJson = JSON.stringify({
  families: [
    {
      family_label: "Family",
      slug: "family",
      variants: [
        { model_uid: "family-medium", label: "Family", cost_summary: "$1" },
        { model_uid: "family-high", label: "Family High", cost_summary: "$2" },
      ],
    },
  ],
});

const location = (path: string) => ({ kind: "posix" as const, path });
const scope = (generation: string, volatileGeneration: string) => ({
  location: location("/project"),
  generation,
  volatileGeneration,
});

describe("Devin model catalog cache", () => {
  beforeEach(() => {
    invalidateDevinModelCaches();
    mocks.readAgentCommandOutput.mockReset();
    mocks.readAgentCommandOutput.mockResolvedValue({ ok: true, stdout: catalogJson, stderr: "" });
  });

  it("isolates profiles with different execution identities on one OS", async () => {
    const base = await loadDevinModelsForKey(
      devinModelCatalogKey(scope("posix|default|base|x", "vol:base")),
      location("/project"),
      "devin",
    );
    const profileKey = devinModelCatalogKey(
      scope("posix|owner:a|cfg|org|local|devin", "vol:profile"),
    );
    const profile = await loadDevinModelsForKey(profileKey, location("/project"), "devin");
    expect(base.length).toBe(1);
    expect(profile.length).toBe(1);
    expect(
      cachedDevinModelsForKey(devinModelCatalogKey(scope("posix|default|base|x", "vol:base")))
        .length,
    ).toBe(1);
    expect(cachedDevinModelsForKey(profileKey).length).toBe(1);
    // Distinct identities never read each other's entries.
    expect(
      cachedDevinModelsForKey(
        devinModelCatalogKey(scope("posix|owner:other|cfg|org|local|devin", "vol:profile")),
      ),
    ).toEqual([]);
  });

  it("skips the catalog subprocess when enrichment is not required", async () => {
    await expect(
      warmDevinModels(scope("posix|owner:g|x", "vol:warm"), "devin", false),
    ).resolves.toBeUndefined();
    expect(mocks.readAgentCommandOutput).not.toHaveBeenCalled();
  });

  it("runs the catalog subprocess with the profile's own spawn env", async () => {
    const env = { XDG_CONFIG_HOME: "/profiles/work/config", XDG_DATA_HOME: "/profiles/work/data" };
    await loadDevinModelsForKey("k1", location("/project"), "devin", undefined, env);
    expect(mocks.readAgentCommandOutput).toHaveBeenCalledWith(
      location("/project"),
      "devin",
      ["models", "list", "--format", "json"],
      expect.objectContaining({ env }),
    );
    await warmDevinModels(scope("posix|owner:g|x", "vol:warm"), "devin", true, undefined, env);
    expect(mocks.readAgentCommandOutput).toHaveBeenLastCalledWith(
      location("/project"),
      "devin",
      ["models", "list", "--format", "json"],
      expect.objectContaining({ env }),
    );
  });

  it("loads exactly once per identity when warming a cold cache", async () => {
    const identity = scope("posix|owner:b|cfg|org|local|devin", "vol:once");
    await warmDevinModels(identity, "devin", true);
    await warmDevinModels(identity, "devin", true);
    expect(mocks.readAgentCommandOutput).toHaveBeenCalledTimes(1);
  });

  it("uses the same native config prefix for catalog loads and warm launches", async () => {
    const prefix = ["--config", "/profiles/organization view/config.json"];
    await loadDevinModelsForKey(
      "org-a",
      location("/project"),
      "devin",
      undefined,
      undefined,
      prefix,
    );
    expect(mocks.readAgentCommandOutput).toHaveBeenLastCalledWith(
      location("/project"),
      "devin",
      [...prefix, "models", "list", "--format", "json"],
      expect.anything(),
    );
    await warmDevinModels(
      scope("posix|owner:org-b|x", "vol:warm"),
      "devin",
      true,
      undefined,
      undefined,
      prefix,
    );
    expect(mocks.readAgentCommandOutput).toHaveBeenLastCalledWith(
      location("/project"),
      "devin",
      [...prefix, "models", "list", "--format", "json"],
      expect.anything(),
    );
  });

  it("propagates load failures to the caller's fallback policy", async () => {
    mocks.readAgentCommandOutput.mockResolvedValue({ ok: false, stdout: "", stderr: "boom" });
    await expect(loadDevinModelsForKey("k", location("/project"), "devin")).rejects.toThrowError(
      /Unable to read Devin model catalog/,
    );
  });

  it("invalidates by exact key, prefix, or everything", async () => {
    const keyA = devinModelCatalogKey(scope("posix|owner:a|x", "vol:a"));
    const keyB = devinModelCatalogKey(scope("posix|owner:b|x", "vol:b"));
    await loadDevinModelsForKey(keyA, location("/project"), "devin");
    await loadDevinModelsForKey(keyB, location("/project"), "devin");
    invalidateDevinModelCaches({ key: keyA });
    expect(cachedDevinModelsForKey(keyA)).toEqual([]);
    expect(cachedDevinModelsForKey(keyB).length).toBe(1);
    invalidateDevinModelCaches({ prefix: "posix|owner:b" });
    expect(cachedDevinModelsForKey(keyB)).toEqual([]);
    await loadDevinModelsForKey(keyA, location("/project"), "devin");
    invalidateDevinModelCaches();
    expect(cachedDevinModelsForKey(keyA)).toEqual([]);
  });

  it("refreshes on a volatile-scope change at the same static identity and reuses stable content", async () => {
    // The volatile scope (credential + effective config content + effective
    // org) is part of the key: an external logout/login/token replacement, a
    // same-path native policy edit, or an org change reloads, while unchanged
    // content keeps warming from cache.
    const generation = "posix|owner:e|cfg|-|local|devin";
    await warmDevinModels(scope(generation, "vol:config-a"), "devin", true);
    mocks.readAgentCommandOutput.mockClear();
    // Stable content: warm hit, no subprocess.
    await warmDevinModels(scope(generation, "vol:config-a"), "devin", true);
    expect(mocks.readAgentCommandOutput).not.toHaveBeenCalled();
    // Same-path config/credential/org change: a DIFFERENT key — cold,
    // reloads, and the previous state's entry is never served for the new
    // state.
    await warmDevinModels(scope(generation, "vol:config-b"), "devin", true);
    expect(mocks.readAgentCommandOutput).toHaveBeenCalledTimes(1);
    expect(
      cachedDevinModelsForKey(devinModelCatalogKey(scope(generation, "vol:config-b"))).length,
    ).toBe(1);
    expect(
      cachedDevinModelsForKey(devinModelCatalogKey(scope(generation, "vol:config-a"))).length,
    ).toBe(1);
    // Prefix invalidation still reaches every volatile-keyed entry of the
    // static identity.
    invalidateDevinModelCaches({ prefix: generation });
    expect(
      cachedDevinModelsForKey(devinModelCatalogKey(scope(generation, "vol:config-b"))),
    ).toEqual([]);
  });

  it("keys every entry by a fully qualified scope only", () => {
    // Both dimensions are required, so a key that omits the volatile scope is
    // unrepresentable for migrated lanes: the full key is exactly
    // `<generation>|<volatile>`, and any other string (a legacy
    // environment-only or generation-only key) names a different map entry a
    // migrated lane can never read or write.
    expect(devinModelCatalogKey(scope("posix|owner:f|x", "vol:abc"))).toBe(
      "posix|owner:f|x|vol:abc",
    );
    expect(devinModelCatalogKey(scope("posix|owner:f|x", "vol:abc"))).not.toBe("posix|owner:f|x");
    expect(devinModelCatalogKey(scope("g", "vol:x"))).not.toBe(
      devinModelCatalogKey(scope("g", "vol:y")),
    );
    expect(devinModelCatalogKey(scope("g1", "vol:x"))).not.toBe(
      devinModelCatalogKey(scope("g2", "vol:x")),
    );
  });
});
