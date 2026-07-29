import { describe, expect, it } from "vitest";
import {
  findDisplayableImageRef,
  isRemoteImageRef,
  payloadHasImageRef,
  readRemoteImageRef,
  remoteImageRef,
  remoteImageRefPath,
  type RemoteImageRefValue,
} from "./imageRef";

const ref: RemoteImageRefValue = {
  threadId: "t1",
  itemId: "i1",
  path: ["images", 0],
  mime: "image/png",
  bytes: 1234,
};

describe("readRemoteImageRef", () => {
  it("round-trips a minted reference", () => {
    expect(readRemoteImageRef(remoteImageRef(ref))).toEqual(ref);
    expect(isRemoteImageRef(remoteImageRef(ref))).toBe(true);
  });

  it("rejects anything that is not a well-formed reference", () => {
    for (const value of [
      null,
      undefined,
      "data:image/png;base64,AAA",
      [],
      {},
      { __poracodeImageRef: {} },
      { __poracodeImageRef: { ...ref, threadId: "" } },
      { __poracodeImageRef: { ...ref, mime: "text/html" } },
      { __poracodeImageRef: { ...ref, path: [] } },
      { __poracodeImageRef: { ...ref, path: [{ nested: true }] } },
      { __poracodeImageRef: { ...ref, bytes: "big" } },
    ]) {
      expect(isRemoteImageRef(value)).toBe(false);
    }
  });
});

describe("findDisplayableImageRef", () => {
  it("prefers images[] over result, matching the inline search order", () => {
    const first = remoteImageRef({ ...ref, itemId: "from-images" });
    const second = remoteImageRef({ ...ref, itemId: "from-result" });
    const found = findDisplayableImageRef({ images: [first], result: { image: second } });
    expect(found?.itemId).toBe("from-images");
  });

  it("finds a reference at a display-relevant nested result location", () => {
    const payload = { result: { content: [{ type: "text" }, { data: remoteImageRef(ref) }] } };
    expect(findDisplayableImageRef(payload)?.itemId).toBe("i1");
    expect(payloadHasImageRef(payload)).toBe(true);
  });

  it("ignores a reference the renderer would never have displayed", () => {
    // The host also references images buried outside the display paths (an MCP
    // `screenshot.url`) purely to save bytes. Those rows rendered as a tool-call
    // accordion when the bytes were inline and must keep doing so.
    const payload = { result: { content: [{ screenshot: { url: remoteImageRef(ref) } }] } };
    expect(findDisplayableImageRef(payload)).toBeNull();
    expect(payloadHasImageRef(payload)).toBe(false);
  });

  it("skips non-reference entries in images[]", () => {
    const found = findDisplayableImageRef({ images: ["not-an-image", remoteImageRef(ref)] });
    expect(found?.itemId).toBe("i1");
  });

  it("returns null for a payload with no reference", () => {
    expect(findDisplayableImageRef({ images: ["data:image/png;base64,AAA"] })).toBeNull();
    expect(payloadHasImageRef({ name: "bash", result: "text" })).toBe(false);
  });
});

describe("remoteImageRefPath", () => {
  it("encodes the addressed location", () => {
    expect(remoteImageRefPath(ref)).toBe(
      "/api/threads/t1/items/i1/image?path=%5B%22images%22%2C0%5D",
    );
  });

  it("escapes ids that would otherwise break the path", () => {
    expect(remoteImageRefPath({ ...ref, threadId: "a/b", itemId: "c d" })).toContain(
      "/api/threads/a%2Fb/items/c%20d/image",
    );
  });
});
