import sharp from "sharp";

/**
 * Downscaled transcript-card variant: bounded to 960px on either axis
 * (roughly 2x the card slot's rendered size for retina headroom) and
 * re-encoded as WebP. The caller keeps full bytes whenever this returns
 * null or a non-smaller result.
 */
export async function generateBackendImageCardVariant({
  data,
}: {
  readonly data: Buffer;
  readonly mime: string;
}): Promise<{ readonly data: Buffer; readonly mime: string } | null> {
  const image = sharp(data);
  const metadata = await image.metadata();
  if ((metadata.pages ?? 1) > 1) return null;
  // libvips exposes APNG as a single PNG page; its animation control chunk
  // precedes the first image-data chunk.
  if (metadata.format === "png") {
    for (let offset = 8; offset + 12 <= data.length; offset += 12 + data.readUInt32BE(offset)) {
      const chunk = data.toString("ascii", offset + 4, offset + 8);
      if (chunk === "acTL") return null;
      if (chunk === "IDAT") break;
    }
  }
  const variant = await image
    .autoOrient()
    .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
  return variant.length > 0 ? { data: variant, mime: "image/webp" } : null;
}
