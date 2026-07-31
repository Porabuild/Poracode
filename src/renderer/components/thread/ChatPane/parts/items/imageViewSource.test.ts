// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { remoteImageRef } from "@/shared/remote";
import { setRemoteImageRefResolver } from "@/shared/imageRefDisplay";
import {
  imageViewRendersInline,
  imageViewSourceFromImageBlock,
  resolveImageViewSource,
} from "./imageViewSource";

// A minimal valid 1x1 PNG, base64-encoded (starts with the PNG magic prefix).
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("resolveImageViewSource", () => {
  it("resolves raw base64 PNG from a string result into a data URL", () => {
    const source = resolveImageViewSource({
      name: "imageGeneration",
      status: "success",
      result: PNG_BASE64,
      args: { prompt: "A red square" },
    });
    expect(source).not.toBeNull();
    expect(source?.src).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(source?.mime).toBe("image/png");
    expect(source?.extension).toBe("png");
    expect(source?.fileName).toBe("a-red-square.png");
    expect(source?.alt).toBe("A red square");
    expect(source?.width).toBe(1);
    expect(source?.height).toBe(1);
  });

  it("prefers payload.images (the provider-agnostic channel) over result", () => {
    // ACP / Claude mappers populate `images` with data: URLs.
    const source = resolveImageViewSource({
      name: "generate_image",
      status: "success",
      result: "Generated an image of a red square.",
      images: [`data:image/png;base64,${PNG_BASE64}`],
    });
    expect(source?.src).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(source?.mime).toBe("image/png");
    expect(source?.width).toBe(1);
    expect(source?.height).toBe(1);
  });

  it("passes through an existing data: URL result", () => {
    const dataUrl = `data:image/png;base64,${PNG_BASE64}`;
    const source = resolveImageViewSource({ name: "imageGeneration", result: dataUrl });
    expect(source?.src).toBe(dataUrl);
    expect(source?.mime).toBe("image/png");
    expect(source?.width).toBe(1);
    expect(source?.height).toBe(1);
  });

  it("strips whitespace/newlines from chunked base64", () => {
    const chunked = `${PNG_BASE64.slice(0, 20)}\n${PNG_BASE64.slice(20)}`;
    const source = resolveImageViewSource({ name: "imageGeneration", result: chunked });
    expect(source?.src).toBe(`data:image/png;base64,${PNG_BASE64}`);
  });

  it("reads base64 from an object result field (b64_json)", () => {
    const source = resolveImageViewSource({
      name: "imageGeneration",
      result: { b64_json: PNG_BASE64 },
    });
    expect(source?.src).toBe(`data:image/png;base64,${PNG_BASE64}`);
  });

  it("reads an image entry out of a result array", () => {
    const source = resolveImageViewSource({
      name: "imageGeneration",
      result: { data: [{ b64_json: PNG_BASE64 }] },
    });
    expect(source?.src).toBe(`data:image/png;base64,${PNG_BASE64}`);
  });

  it("detects a JPEG magic prefix", () => {
    const jpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD";
    const source = resolveImageViewSource({ name: "imageGeneration", result: jpeg });
    expect(source?.mime).toBe("image/jpeg");
    expect(source?.extension).toBe("jpg");
  });

  it("does NOT render agent-supplied URLs or file paths (inline-only, no outbound requests)", () => {
    // Remote URL → would be a tracking pixel / SSRF if auto-loaded.
    expect(
      resolveImageViewSource({ name: "imageGeneration", result: "https://attacker.example/p.png" }),
    ).toBeNull();
    // file:// and poracode-local:// → would read local files on view/copy.
    expect(
      resolveImageViewSource({ name: "imageGeneration", result: "file:///C:/secret.png" }),
    ).toBeNull();
    expect(
      resolveImageViewSource({
        name: "imageGeneration",
        result: { url: "poracode-local://local/C:/Users/me/secret.png" },
      }),
    ).toBeNull();
    // A filesystem path on args is no longer promoted to an image.
    expect(
      resolveImageViewSource({ name: "ViewImage", args: { path: "/tmp/pic.png" } }),
    ).toBeNull();
  });

  it("returns null for non-image text results", () => {
    expect(
      resolveImageViewSource({
        name: "imageGeneration",
        result: "Here is your image description.",
      }),
    ).toBeNull();
    expect(resolveImageViewSource({ name: "imageGeneration", status: "running" })).toBeNull();
    expect(resolveImageViewSource(undefined)).toBeNull();
  });

  it("falls back to a generic filename/alt when no prompt is present", () => {
    const source = resolveImageViewSource({ name: "imageGeneration", result: PNG_BASE64 });
    expect(source?.alt).toBe("Generated image");
    expect(source?.fileName).toBe("generated-image.png");
  });
});

describe("imageViewSourceFromImageBlock", () => {
  it("builds a source from a canonical assistant-message image block", () => {
    const source = imageViewSourceFromImageBlock({
      dataUrl: `data:image/png;base64,${PNG_BASE64}`,
      mimeType: "image/png",
      name: "diagram",
    });
    expect(source?.src).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(source?.mime).toBe("image/png");
    expect(source?.alt).toBe("diagram");
    expect(source?.fileName).toBe("diagram.png");
    expect(source?.width).toBe(1);
    expect(source?.height).toBe(1);
  });

  it("returns null for a non-image / missing data URL", () => {
    expect(imageViewSourceFromImageBlock({ dataUrl: "https://example.com/x.png" })).toBeNull();
    expect(imageViewSourceFromImageBlock({ dataUrl: "" })).toBeNull();
    expect(imageViewSourceFromImageBlock({})).toBeNull();
  });
});

describe("imageViewRendersInline", () => {
  it("is true only for a non-errored payload that carries a renderable image", () => {
    expect(imageViewRendersInline({ name: "imageGeneration", result: PNG_BASE64 })).toBe(true);
    expect(
      imageViewRendersInline({ name: "imageGeneration", status: "success", result: PNG_BASE64 }),
    ).toBe(true);
  });

  it("is false when the tool errored even if a renderable image is present", () => {
    // Mirrors ImageView falling back to the tool-call accordion on error, so
    // the grouping selector keeps the row grouped instead of un-grouping it.
    expect(
      imageViewRendersInline({ name: "imageGeneration", status: "error", result: PNG_BASE64 }),
    ).toBe(false);
  });
});

describe("host-minted image references", () => {
  const ref = remoteImageRef({
    threadId: "t1",
    itemId: "i1",
    path: ["images", 0],
    mime: "image/jpeg",
    bytes: 4096,
    width: 800,
    height: 600,
  });

  afterEach(() => {
    setRemoteImageRefResolver(null);
  });

  it("resolves a reference through the installed resolver", () => {
    setRemoteImageRefResolver((value) => `https://desktop.test/img/${value.itemId}`);
    const source = resolveImageViewSource({
      name: "imageView",
      status: "success",
      images: [ref],
      args: { prompt: "a cat" },
    });
    expect(source).toMatchObject({
      src: "https://desktop.test/img/i1",
      mime: "image/jpeg",
      extension: "jpg",
      alt: "a cat",
      // Carried on the reference so the row reserves layout before loading.
      width: 800,
      height: 600,
    });
    expect(source?.fileName).toBe("a-cat.jpg");
  });

  it("groups as an inline image so the timeline does not demote the row", () => {
    setRemoteImageRefResolver(() => "https://desktop.test/img/i1");
    expect(imageViewRendersInline({ status: "success", images: [ref] })).toBe(true);
  });

  it("falls back to the accordion when nothing can resolve the reference", () => {
    // The desktop shell installs no resolver: better an inert accordion than a
    // broken <img>.
    expect(resolveImageViewSource({ status: "success", images: [ref] })).toBeNull();
    setRemoteImageRefResolver(() => "");
    expect(resolveImageViewSource({ status: "success", images: [ref] })).toBeNull();
  });

  it("shows the accordion for an errored payload even with a reference", () => {
    setRemoteImageRefResolver(() => "https://desktop.test/img/i1");
    expect(imageViewRendersInline({ status: "error", images: [ref] })).toBe(false);
    expect(resolveImageViewSource({ status: "error", images: [ref] })).toBeNull();
  });

  it("still renders payloads that kept their inline bytes", () => {
    setRemoteImageRefResolver(() => "https://desktop.test/img/i1");
    expect(resolveImageViewSource({ result: PNG_BASE64 })?.src).toContain("data:image/png;base64,");
  });
});
