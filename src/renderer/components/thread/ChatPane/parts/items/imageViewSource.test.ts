// @vitest-environment node

import { describe, expect, it } from "vitest";
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
