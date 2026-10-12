// @vitest-environment jsdom
// Run with the repository's renderer Lingui/Babel plugins (see the qualification
// report's exact isolated Vitest invocation). No app process or real tools run.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  collectInlineImageLocations,
  enumerateDisplayImageCandidatePaths,
} from "@/shared/inlineImagePayload";
import { readRemoteImageRef } from "@/shared/remote/imageRef";
import {
  imageViewRendersInline,
  resolveImageViewSource,
} from "@/renderer/components/thread/ChatPane/parts/items/imageViewSource";
import {
  IMAGE_ASSETS,
  IMAGE_FORM_CASES,
  imageDataUrl,
  REMOTE_REF,
  SVG_ASSET,
} from "../fixtures/tool-taxonomy-workload";
import { payload } from "./tool-taxonomy/test-support";

describe("complete offline media files and production source resolution", () => {
  it.each(Object.entries(IMAGE_ASSETS))(
    "%s asset really decodes to 16 x 12 pixels",
    async (format, asset) => {
      const bytes = Buffer.from(asset.base64, "base64");
      const decoder = sharp(bytes);
      expect(await decoder.metadata()).toMatchObject({
        format,
        width: asset.width,
        height: asset.height,
      });
      const decoded = await decoder.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(decoded.info).toMatchObject({ width: 16, height: 12, channels: 4 });
      expect(decoded.data.length).toBe(16 * 12 * 4);
      expect(
        resolveImageViewSource({
          status: "success",
          result: imageDataUrl(format as keyof typeof IMAGE_ASSETS),
        }),
      ).toMatchObject({ mime: asset.mime, width: 16, height: 12 });
    },
  );

  it("decodes the SVG illustration and every stored image carrier", async () => {
    const decoded = await sharp(Buffer.from(SVG_ASSET))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(decoded.info).toMatchObject({ width: 16, height: 12, channels: 4 });
    for (const c of IMAGE_FORM_CASES.filter((candidate) => candidate.expected.inlineImage)) {
      const resolved = resolveImageViewSource(c.item.payload);
      expect(resolved).not.toBeNull();
      const src = resolved!.src;
      const body = src.slice(src.indexOf(",") + 1);
      const data = src.includes(";base64,")
        ? Buffer.from(body, "base64")
        : Buffer.from(decodeURIComponent(body));
      expect(await sharp(data).raw().toBuffer({ resolveWithObject: true })).toMatchObject({
        info: { width: 16, height: 12 },
      });
    }
  });

  it("repairs mislabeled WebP, picks the first visible candidate, and excludes inert/error forms", () => {
    expect(resolveImageViewSource(payload("image_format_repair"))).toMatchObject({
      mime: "image/webp",
      extension: "webp",
      src: imageDataUrl("webp"),
    });
    expect(resolveImageViewSource(payload("image_multiple_candidates"))?.src).toBe(
      imageDataUrl("png"),
    );
    expect(collectInlineImageLocations(payload("image_multiple_candidates"))).toHaveLength(3);
    expect(enumerateDisplayImageCandidatePaths(payload("image_multiple_candidates"))).toEqual([
      ["images", 0],
      ["images", 1],
      ["result", "image"],
    ]);
    for (const c of IMAGE_FORM_CASES.filter(
      (candidate) => candidate.expected.inlineImage === false,
    ))
      expect(resolveImageViewSource(c.item.payload)).toBeNull();
    expect(resolveImageViewSource(payload("image_fallback"))).toBeNull();
  });

  it("keeps remote references as pending metadata until an explicit resolver is ready", () => {
    expect(readRemoteImageRef(REMOTE_REF)).toEqual(REMOTE_REF.__poracodeImageRef);
    expect(imageViewRendersInline(payload("image_remote_ref"))).toBe(true);
    expect(resolveImageViewSource(payload("image_remote_ref"), () => "")).toBeNull();
    expect(
      resolveImageViewSource(payload("image_remote_ref"), () => "", { pendingAsPlaceholder: true }),
    ).toMatchObject({
      src: "",
      pending: true,
      width: 16,
      height: 12,
      preview: imageDataUrl("png"),
    });
    expect(
      resolveImageViewSource(payload("image_remote_ref"), () => imageDataUrl("png")),
    ).toMatchObject({ src: imageDataUrl("png"), width: 16, height: 12 });
  });
});
