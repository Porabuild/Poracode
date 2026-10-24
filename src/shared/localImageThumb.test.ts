import { describe, expect, it } from "vitest";
import {
  localImageThumbUrl,
  MAX_LOCAL_IMAGE_THUMB_PX,
  readLocalImageThumbPx,
} from "./localImageThumb";

const local = "poracode-local://local/C:/Users/me/shot%201.png";

describe("localImageThumbUrl", () => {
  it("adds a whole-pixel size to local-file URLs only", () => {
    expect(localImageThumbUrl(local, 55.2)).toBe(`${local}?thumb=56`);
    expect(localImageThumbUrl("lightcode-local://local/tmp/a.png", 64)).toBe(
      "lightcode-local://local/tmp/a.png?thumb=64",
    );
    expect(localImageThumbUrl(`${local}?v=3`, 64)).toBe(`${local}?v=3&thumb=64`);
    expect(localImageThumbUrl("blob:http://x/1", 64)).toBeNull();
    expect(localImageThumbUrl("https://host/image?path=/a.png", 64)).toBeNull();
    expect(localImageThumbUrl(local, 0)).toBeNull();
    expect(localImageThumbUrl(local, Number.NaN)).toBeNull();
  });

  it("caps the requested size", () => {
    expect(localImageThumbUrl(local, 99_999)).toBe(`${local}?thumb=${MAX_LOCAL_IMAGE_THUMB_PX}`);
  });
});

describe("readLocalImageThumbPx", () => {
  it("round-trips the builder and rejects anything else", () => {
    expect(readLocalImageThumbPx(localImageThumbUrl(`${local}?v=3`, 64)!)).toBe(64);
    expect(readLocalImageThumbPx(local)).toBeNull();
    expect(readLocalImageThumbPx(`${local}?thumb=0`)).toBeNull();
    expect(readLocalImageThumbPx(`${local}?thumb=12px`)).toBeNull();
    expect(readLocalImageThumbPx(`${local}?thumb=${MAX_LOCAL_IMAGE_THUMB_PX + 1}`)).toBeNull();
  });
});
