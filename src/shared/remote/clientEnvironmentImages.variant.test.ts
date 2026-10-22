import { describe, expect, it } from "vitest";
import type { RemoteImageRefValue } from "./imageRef";
import { environmentImageRefKey, environmentLocalImageKey } from "./clientEnvironmentImages";
import { createImageCacheHarness } from "./clientEnvironmentImages.testSupport";

const ref: RemoteImageRefValue = {
  threadId: "thread-1",
  itemId: "item-1",
  path: ["images", 0],
  mime: "image/png",
  bytes: 500_000,
  width: 1920,
  height: 1080,
};

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("card variant coordinates", () => {
  it("keys variant entries separately from full resolution", () => {
    expect(environmentImageRefKey(ref, "card")).toBe(`${environmentImageRefKey(ref)}#card`);
    expect(environmentLocalImageKey("/a.png", "card")).not.toBe(
      environmentLocalImageKey("/a.png#card"),
    );
    expect(environmentLocalImageKey("/a.png")).toBe("path:/a.png");
  });

  it("requests the variant path for the variant coordinate only", async () => {
    const { cache, fetches } = createImageCacheHarness();
    cache.imageRefResolution(ref, "foreground", "card");
    cache.imageRefResolution(ref);
    cache.localImageResolution("/fixture image.png", "foreground", "card");
    expect(fetches.map((call) => call.requestPath)).toEqual([
      "/api/threads/thread-1/items/item-1/image?path=%5B%22images%22%2C0%5D&variant=card",
      "/api/threads/thread-1/items/item-1/image?path=%5B%22images%22%2C0%5D",
      "/api/files/image?path=%2Ffixture+image.png&variant=card",
    ]);
    fetches[0]!.resolve(new Uint8Array([1]));
    fetches[1]!.resolve(new Uint8Array([2]));
    fetches[2]!.resolve(new Uint8Array([3]));
    await flush();
    const variantUrl = cache.resolutionForImageKey(environmentImageRefKey(ref, "card")).url;
    const fullUrl = cache.resolutionForImageKey(environmentImageRefKey(ref)).url;
    expect(variantUrl).toBe("blob:1");
    expect(fullUrl).toBe("blob:2");
    expect(variantUrl).not.toBe(fullUrl);
    cache.dispose();
  });
});
