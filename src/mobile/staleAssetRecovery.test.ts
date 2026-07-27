import { describe, expect, it } from "vitest";
import { isStaleAssetError } from "./staleAssetRecovery";

describe("isStaleAssetError", () => {
  it.each([
    "Importing a module script failed.",
    "Failed to fetch dynamically imported module: https://app.poracode.com/assets/app-old.js",
    'Expected a JavaScript module script but the server responded with a MIME type of "text/html", which is not a valid JavaScript MIME type.',
  ])("recognizes a stale module asset error: %s", (message) => {
    expect(isStaleAssetError(new TypeError(message))).toBe(true);
  });

  it("does not recover unrelated bootstrap failures", () => {
    expect(isStaleAssetError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleAssetError(new Error("Importing a module script failed."))).toBe(false);
  });
});
