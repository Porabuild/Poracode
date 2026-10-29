import sharp from "sharp";
import type { ImagePreviewGenerator } from "./imagePreview";

export const generateImagePreview: ImagePreviewGenerator = async ({ data }) => {
  const preview = await sharp(data)
    .resize({ width: 24, withoutEnlargement: true })
    .jpeg({ quality: 40 })
    .toBuffer();
  return preview.length > 0 ? `data:image/jpeg;base64,${preview.toString("base64")}` : null;
};
