import { describe, expect, it } from "vitest";
import { extensionStoreLinks } from "./extensionStores";

describe("extensionStoreLinks", () => {
  it("lists only stores with a published listing, Chrome first", () => {
    expect(extensionStoreLinks({ chrome: null, edge: null })).toEqual([]);
    expect(extensionStoreLinks({ chrome: null, edge: "https://edge.test/x" })).toEqual([
      { id: "edge", url: "https://edge.test/x" },
    ]);
    expect(
      extensionStoreLinks({ chrome: "https://chrome.test/x", edge: "https://edge.test/x" }).map(
        (store) => store.id,
      ),
    ).toEqual(["chrome", "edge"]);
  });
});
