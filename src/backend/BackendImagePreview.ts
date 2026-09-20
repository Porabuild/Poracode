import sharp from "sharp";

/** Generates the desktop remote LQIP outside every Electron process. */
export async function generateBackendImagePreview({
  data,
}: {
  readonly data: Buffer;
  readonly mime: string;
}): Promise<string | null> {
  const preview = await sharp(data)
    .resize({ width: 24, withoutEnlargement: true })
    .jpeg({ quality: 40 })
    .toBuffer();
  return preview.length > 0 ? `data:image/jpeg;base64,${preview.toString("base64")}` : null;
}
