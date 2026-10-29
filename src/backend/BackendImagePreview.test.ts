import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { generateBackendImageCardVariant } from "./BackendImagePreview";
import { generateImagePreview } from "@/host/remote/server/imagePreviewGenerator";

describe("generateBackendImageCardVariant", () => {
  it("downscales to a webp variant bounded at 960px", async () => {
    const data = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="blue"/></svg>',
    );
    const variant = await generateBackendImageCardVariant({ data, mime: "image/png" });
    expect(variant?.mime).toBe("image/webp");
    expect(variant!.data.length).toBeGreaterThan(0);
    // RIFF....WEBP signature.
    expect(variant!.data.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(variant!.data.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(await sharp(variant!.data).metadata()).toMatchObject({ width: 960, height: 540 });
  });

  it("applies EXIF orientation before resizing and dropping metadata", async () => {
    const data = await sharp({
      create: { width: 600, height: 1000, channels: 3, background: "red" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const variant = await generateBackendImageCardVariant({ data, mime: "image/jpeg" });
    expect(await sharp(variant!.data).metadata()).toMatchObject({ width: 960, height: 576 });
  });

  it("leaves animated WebP sources unchanged", async () => {
    const data = await sharp(
      Buffer.concat([Buffer.alloc(8 * 8 * 3, 128), Buffer.alloc(8 * 8 * 3, 64)]),
      {
        raw: { width: 8, height: 16, channels: 3, pageHeight: 8 },
      },
    )
      .webp({ delay: [100, 100], loop: 0 })
      .toBuffer();
    expect((await sharp(data).metadata()).pages).toBe(2);
    expect(await generateBackendImageCardVariant({ data, mime: "image/webp" })).toBeNull();
  });

  it("leaves APNG sources unchanged even though decoder metadata reports one page", async () => {
    const data = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAAIAAAACAAAAAAAAAAAAAEACgAA8k66YgAAAA9JREFUeJxjaMABGIaWBACC82ABnO4PJAAAABpmY1RMAAAAAQAAAAgAAAAIAAAAAAAAAAAAAQAKAABpPVC2AAAAE2ZkQVQAAAACeJxjcMABGIaWBADB1jABVPXl9gAAAABJRU5ErkJggg==",
      "base64",
    );
    expect((await sharp(data).metadata()).pages ?? 1).toBe(1);
    expect(await generateBackendImageCardVariant({ data, mime: "image/png" })).toBeNull();
  });
});

describe("generateImagePreview", () => {
  it("decodes and resizes images in BackendHost", async () => {
    const data = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><rect width="32" height="16" fill="red"/></svg>',
    );

    await expect(generateImagePreview({ data, mime: "image/svg+xml" })).resolves.toMatch(
      /^data:image\/jpeg;base64,/,
    );
  });
});
