import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { readImageDimensions } from "./imageDimensions";

function toDataUrl(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function buildBigEndianJpegWithXmpAndExif(
  width: number,
  height: number,
  orientation: number,
): Buffer {
  const xmpPayload = Buffer.concat([
    Buffer.from("http://ns.adobe.com/xap/1.0/\0", "ascii"),
    Buffer.alloc(12_000, 0x20),
  ]);
  const app1Xmp = Buffer.alloc(4 + xmpPayload.length);
  app1Xmp[0] = 0xff;
  app1Xmp[1] = 0xe1;
  app1Xmp.writeUInt16BE(2 + xmpPayload.length, 2);
  xmpPayload.copy(app1Xmp, 4);

  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "ascii");
  tiff.writeUInt16BE(0x002a, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  const exifPayload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const app1Exif = Buffer.alloc(4 + exifPayload.length);
  app1Exif[0] = 0xff;
  app1Exif[1] = 0xe1;
  app1Exif.writeUInt16BE(2 + exifPayload.length, 2);
  exifPayload.copy(app1Exif, 4);

  const sof0 = Buffer.from([
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xff]),
    app1Xmp,
    sof0,
    app1Exif,
    Buffer.from([0xff, 0xd9]),
  ]);
}

describe("readImageDimensions", () => {
  it.each([
    [1, { width: 164, height: 236 }],
    [3, { width: 164, height: 236 }],
    [5, { width: 236, height: 164 }],
    [6, { width: 236, height: 164 }],
    [7, { width: 236, height: 164 }],
    [8, { width: 236, height: 164 }],
  ])("applies PNG eXIf orientation %i", async (orientation, expected) => {
    const png = await sharp({
      create: { width: 164, height: 236, channels: 3, background: "blue" },
    })
      .png()
      .withMetadata({ orientation })
      .toBuffer();

    expect(
      readImageDimensions(toDataUrl("image/png", png), { kind: "dataUrl", mime: "image/png" }),
    ).toEqual(expected);
  });

  it.each([
    [1, { width: 164, height: 236 }],
    [4, { width: 164, height: 236 }],
    [6, { width: 236, height: 164 }],
    [8, { width: 236, height: 164 }],
  ])("applies JPEG EXIF orientation %i", async (orientation, expected) => {
    const jpeg = await sharp({
      create: { width: 164, height: 236, channels: 3, background: "red" },
    })
      .jpeg()
      .withMetadata({ orientation })
      .toBuffer();

    expect(
      readImageDimensions(toDataUrl("image/jpeg", jpeg), { kind: "dataUrl", mime: "image/jpeg" }),
    ).toEqual(expected);
  });

  it("handles big-endian TIFF EXIF after a large XMP APP1 segment and SOF0", () => {
    const jpeg = buildBigEndianJpegWithXmpAndExif(1640, 2360, 6);
    expect(
      readImageDimensions(jpeg.toString("base64"), { kind: "base64", mime: "image/jpeg" }),
    ).toEqual({ width: 2360, height: 1640 });
  });

  it.each([
    [2, { width: 164, height: 236 }],
    [6, { width: 236, height: 164 }],
  ])("applies WebP VP8X EXIF orientation %i", async (orientation, expected) => {
    const webp = await sharp({
      create: { width: 164, height: 236, channels: 3, background: "green" },
    })
      .webp()
      .withMetadata({ orientation })
      .toBuffer();

    expect(
      readImageDimensions(toDataUrl("image/webp", webp), { kind: "dataUrl", mime: "image/webp" }),
    ).toEqual(expected);
  });

  it("reads unoriented PNG, GIF, lossless WebP, and SVG dimensions", async () => {
    const losslessWebp = await sharp({
      create: { width: 90, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .webp({ lossless: true })
      .toBuffer();
    const gif = await sharp({
      create: { width: 50, height: 30, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    })
      .gif()
      .toBuffer();

    expect(
      readImageDimensions(toDataUrl("image/webp", losslessWebp), {
        kind: "dataUrl",
        mime: "image/webp",
      }),
    ).toEqual({ width: 90, height: 40 });
    expect(
      readImageDimensions(toDataUrl("image/gif", gif), { kind: "dataUrl", mime: "image/gif" }),
    ).toEqual({ width: 50, height: 30 });
    expect(
      readImageDimensions('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"/>', {
        kind: "rawSvg",
        mime: "image/svg+xml",
      }),
    ).toEqual({ width: 320, height: 180 });
  });
});
