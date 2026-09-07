import { readBridge } from "@/renderer/bridge";

/** Read originals through the desktop bridge for local URLs, or fetch remote/inline URLs. */
export async function fetchImageBytes(src: string): Promise<Uint8Array<ArrayBuffer>> {
  if (/^(?:poracode|lightcode)-local:\/\//.test(src)) {
    return new Uint8Array(await readBridge().readLocalImageFile({ url: src }));
  }
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load image (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

/** The native clipboard decodes PNG/JPEG; convert other formats without changing saved originals. */
export async function toClipboardPngBytes(source: { src: string; mime?: string }) {
  const data = await fetchImageBytes(source.src);
  // Inspect the bytes as galleries and attachment URLs need not carry MIME metadata.
  if (
    (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) ||
    (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
  ) {
    return data;
  }
  const url = URL.createObjectURL(new Blob([data], { type: source.mime ?? "" }));
  try {
    // HTMLImageElement also decodes SVG, which createImageBitmap does not support everywhere.
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) throw new Error("Unable to decode image");
    ctx.drawImage(image, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Unable to encode image");
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
