import { describe, expect, it } from "vitest";
import {
  inlineImagePayloadRenders,
  isPoracodeAttachmentPath,
  isUserAttachmentImageReadPayload,
  normalizeAttachmentImagePath,
  normalizeInlineImageDataUrl,
} from "./inlineImagePayload";

// Real 2x1 PNG / JPEG emitted by sharp, so every case carries bytes an image
// decoder actually accepts rather than a tolerated placeholder.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWPgEpH7D8IACDMCd75ivFQAAAAASUVORK5CYII=";
const JPEG_B64 =
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCbAFAH/9k=";
const WEBP_B64 = "UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoCAAEAAUAmJZQCdAFAAAD+/DeBV/fU6D4r4AAA";

function toBase64Url(standard: string): string {
  return standard.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("normalizeInlineImageDataUrl", () => {
  it("leaves a canonical data URL byte-identical", () => {
    const src = `data:image/png;base64,${PNG_B64}`;
    expect(normalizeInlineImageDataUrl(src)).toEqual({ dataUrl: src, mime: "image/png" });
  });

  it("repairs a URL-safe body padded back to standard base64", () => {
    expect(
      normalizeInlineImageDataUrl(`data:image/png;base64,${toBase64Url(PNG_B64)}`)?.dataUrl,
    ).toBe(`data:image/png;base64,${PNG_B64}`);
  });

  it("accepts a bare base64url body with no data URL header", () => {
    expect(normalizeInlineImageDataUrl(toBase64Url(PNG_B64))).toEqual({
      dataUrl: `data:image/png;base64,${PNG_B64}`,
      mime: "image/png",
    });
  });

  it("strips line wrapping from the body", () => {
    const wrapped = PNG_B64.replace(/(.{20})/g, "$1\r\n");
    expect(normalizeInlineImageDataUrl(`data:image/png;base64,${wrapped}`)?.dataUrl).toBe(
      `data:image/png;base64,${PNG_B64}`,
    );
  });

  it("reads the format out of the bytes instead of trusting the label", () => {
    for (const [body, mime] of [
      [JPEG_B64, "image/jpeg"],
      [WEBP_B64, "image/webp"],
    ] as const) {
      const normalized = normalizeInlineImageDataUrl(`data:image/png;base64,${body}`);
      expect(normalized?.mime).toBe(mime);
      expect(normalized?.dataUrl.startsWith(`data:${mime};base64,`)).toBe(true);
    }
  });

  it("keeps a declared type the sniffer does not recognize", () => {
    // AVIF/HEIC/ICO and friends are real images; an unrecognized header must not
    // make the payload undisplayable.
    expect(normalizeInlineImageDataUrl("YWJj", "image/webp")).toEqual({
      dataUrl: "data:image/webp;base64,YWJj",
      mime: "image/webp",
    });
  });

  it("preserves a non-base64 data URL and only fixes its label", () => {
    const svg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>";
    expect(normalizeInlineImageDataUrl(svg)).toEqual({ dataUrl: svg, mime: "image/svg+xml" });
  });

  it("keeps a percent-encoded non-base64 data URL by trusting its label", () => {
    // The sniffer cannot read a percent-encoded body, but the previous builder
    // stored such URLs verbatim and they rendered, so the label is trusted.
    const svg = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
    expect(normalizeInlineImageDataUrl(svg)).toEqual({ dataUrl: svg, mime: "image/svg+xml" });
  });

  it("rejects anything that cannot be an image", () => {
    expect(normalizeInlineImageDataUrl("   ")).toBeNull();
    expect(normalizeInlineImageDataUrl("data:image/png;base64,")).toBeNull();
    expect(normalizeInlineImageDataUrl("data:image/png;base64,!!!not-base64!!!")).toBeNull();
    expect(normalizeInlineImageDataUrl("data:image/png;base64,AAAAA")).toBeNull();
    expect(normalizeInlineImageDataUrl("/Users/me/shot.png")).toBeNull();
    expect(normalizeInlineImageDataUrl("YWJj")).toBeNull();
  });

  it("is idempotent, so a repaired payload stops re-emitting events", () => {
    const once = normalizeInlineImageDataUrl(toBase64Url(PNG_B64))!.dataUrl;
    const twice = normalizeInlineImageDataUrl(once)!.dataUrl;
    expect(twice).toBe(once);
  });
});

describe("user-attachment image read suppression", () => {
  const inlinePng = `data:image/png;base64,${PNG_B64}`;

  it("normalizes POSIX, Windows, file URL, local protocol, and WSL UNC paths", () => {
    expect(
      normalizeAttachmentImagePath(
        "file:///Users/me/.poracode-nightly.host-v1/attachments/draft-1/Image%201.png",
      ),
    ).toBe("/Users/me/.poracode-nightly.host-v1/attachments/draft-1/Image 1.png");
    expect(
      normalizeAttachmentImagePath(
        "poracode-local://local/Users/me/.poracode/attachments/draft-1/Image%201.png",
      ),
    ).toBe("/Users/me/.poracode/attachments/draft-1/Image 1.png");
    expect(normalizeAttachmentImagePath("C:\\Users\\Me\\.poracode\\attachments\\a.png")).toBe(
      "c:/users/me/.poracode/attachments/a.png",
    );
    expect(
      normalizeAttachmentImagePath(
        "\\\\wsl.localhost\\Ubuntu\\home\\me\\.poracode\\attachments\\a.png",
      ),
    ).toBe("/home/me/.poracode/attachments/a.png");
  });

  it("matches managed Poracode attachment directories without matching worktrees", () => {
    expect(
      isPoracodeAttachmentPath(
        "/Users/me/.poracode-nightly.host-v1/attachments/draft-6c9670/Image 1.png",
      ),
    ).toBe(true);
    expect(isPoracodeAttachmentPath("/repo/worktree/.poracode/attachments/shot.png")).toBe(true);
    expect(isPoracodeAttachmentPath("C:\\Users\\me\\.poracode\\attachments\\draft-1\\a.png")).toBe(
      true,
    );
    expect(
      isPoracodeAttachmentPath("/Users/me/Poracode/.poracode/worktrees/branch/screenshot.png"),
    ).toBe(false);
    expect(isPoracodeAttachmentPath("/tmp/agent-screenshot.png")).toBe(false);
  });

  it("suppresses read/view tools targeting Poracode attachments or thread user attachments", () => {
    const museRead = {
      name: "read_file",
      kind: "read",
      args: { path: "/Users/me/.poracode-nightly.host-v1/attachments/draft-6c9670/Image 1.png" },
      status: "success",
      images: [inlinePng],
    };
    expect(isUserAttachmentImageReadPayload(museRead)).toBe(true);
    expect(inlineImagePayloadRenders(museRead)).toBe(false);

    const claudeDesktopDrop = {
      name: "Read",
      args: { file_path: "/Users/me/Desktop/bug.png" },
      status: "success",
      images: [inlinePng],
    };
    expect(isUserAttachmentImageReadPayload(claudeDesktopDrop)).toBe(false);
    expect(inlineImagePayloadRenders(claudeDesktopDrop)).toBe(true);
    const attached = new Set(["/Users/me/Desktop/bug.png"]);
    expect(isUserAttachmentImageReadPayload(claudeDesktopDrop, attached)).toBe(true);
    expect(inlineImagePayloadRenders(claudeDesktopDrop, attached)).toBe(false);

    // ACP call with a relative display title and authoritative absolute location.
    const acpRead = {
      name: "Viewing image ./Image 1.png",
      title: "Viewing image ./Image 1.png",
      kind: "read",
      args: { path: "./Image 1.png" },
      locations: [{ path: "/Users/me/.poracode/attachments/draft-1/Image 1.png" }],
      status: "success",
      images: [inlinePng],
    };
    expect(isUserAttachmentImageReadPayload(acpRead)).toBe(true);
    expect(inlineImagePayloadRenders(acpRead)).toBe(false);
  });

  it("keeps non-attachment image views and generated/captured images renderable", () => {
    const agentScreenshotRead = {
      name: "read_file",
      kind: "read",
      args: { path: "/tmp/playwright-verify.png" },
      status: "success",
      images: [inlinePng],
    };
    expect(isUserAttachmentImageReadPayload(agentScreenshotRead)).toBe(false);
    expect(inlineImagePayloadRenders(agentScreenshotRead)).toBe(true);

    const generatedFromAttachment = {
      name: "imageGeneration",
      args: { path: "/Users/me/.poracode/attachments/draft-1/Image 1.png", prompt: "edit" },
      status: "success",
      images: [inlinePng],
    };
    expect(isUserAttachmentImageReadPayload(generatedFromAttachment)).toBe(false);
    expect(inlineImagePayloadRenders(generatedFromAttachment)).toBe(true);
  });

  it("ignores non-filesystem uri fields when a valid attachment path is present", () => {
    expect(
      isUserAttachmentImageReadPayload({
        name: "read_file",
        kind: "read",
        args: {
          path: "/Users/me/.poracode/attachments/draft-1/Image 1.png",
          uri: "https://example.com/reference",
        },
      }),
    ).toBe(true);
    expect(
      isUserAttachmentImageReadPayload({
        name: "image",
        args: { path: "/Users/me/.poracode/attachments/draft-1/Image 1.png" },
      }),
    ).toBe(false);
  });
});
