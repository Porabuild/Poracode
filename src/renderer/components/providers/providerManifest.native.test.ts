import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { getProviderManifests } from "./providerManifest";
import { defaultFastEnabled } from "./modelConfig";

it("keeps bundled native UI defaults identical to the registered PWA providers", () => {
  const native = JSON.parse(
    readFileSync(resolve("ios/App/App/Features/ProviderUI/ProviderUIRegistry.json"), "utf8"),
  ) as {
    version: number;
    providers: Record<string, { order: number; defaultFastEnabled: boolean }>;
  };
  expect(native.version).toBe(2);
  const expected = Object.fromEntries(
    getProviderManifests().map((manifest) => [
      manifest.kind,
      {
        order: manifest.order,
        defaultFastEnabled: defaultFastEnabled(manifest.kind),
        ...(manifest.legacyTerminalRuntimeLabel
          ? { legacyTerminalRuntimeLabel: manifest.legacyTerminalRuntimeLabel }
          : {}),
        ...(manifest.legacyGuiRuntimeVariant
          ? { legacyGuiRuntimeVariant: manifest.legacyGuiRuntimeVariant }
          : {}),
      },
    ]),
  );
  expect(native.providers).toEqual(expected);
});
