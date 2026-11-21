import { test } from "node:test";
import assert from "node:assert/strict";
import { generateProviderUIRegistry, providerUIEntry } from "./generate-native-provider-ui.mjs";

await test("native metadata is current with the registered PWA providers", async () => {
  const registry = JSON.parse(await generateProviderUIRegistry(undefined, true));
  assert.equal(registry.version, 2);
  assert.ok(Object.keys(registry.providers).length > 0);
});

await test("exports provider-owned legacy surface identity as literal data", () => {
  assert.deepEqual(
    providerUIEntry(
      'kind: "fixture",\norder: 4,\nlegacyTerminalRuntimeLabel: "CLI",\nlegacyGuiRuntimeVariant: "bridge",',
      "fixture",
      true,
    ),
    {
      order: 4,
      defaultFastEnabled: true,
      legacyTerminalRuntimeLabel: "CLI",
      legacyGuiRuntimeVariant: "bridge",
    },
  );
  assert.throws(() =>
    providerUIEntry(
      'kind: "fixture",\norder: 4,\nlegacyGuiRuntimeVariant: computed,',
      "fixture",
      true,
    ),
  );
});

await test("literal defaults preserve false and reject data the exporter cannot interpret", () => {
  assert.deepEqual(
    providerUIEntry(
      'export default {\nkind: "fixture",\norder: 4,\ndefaultFastEnabled: false,\n}',
      "fixture",
      true,
    ),
    { order: 4, defaultFastEnabled: false },
  );
  assert.deepEqual(providerUIEntry('kind: "fixture",\norder: 4,', "fixture", true), {
    order: 4,
    defaultFastEnabled: true,
  });
  assert.throws(() => providerUIEntry('kind: "other",\norder: 4,', "fixture", true));
  assert.throws(() =>
    providerUIEntry('kind: "fixture",\norder: 4,\ndefaultFastEnabled: computed,', "fixture", true),
  );
});
