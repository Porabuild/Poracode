import { isRemoteSession, readBridge } from "@/renderer/bridge";

/** Read originals through the desktop bridge for local URLs, or fetch remote/inline URLs. */
export async function fetchImageBytes(src: string): Promise<Uint8Array<ArrayBuffer>> {
  if (/^(?:poracode|lightcode)-local:\/\//.test(src)) {
    return new Uint8Array(await readBridge().readLocalImageFile({ url: src }));
  }
  // Images can display without CORS permission, but renderer fetch cannot read their bytes.
  // Desktop HTTP reads use the bounded main-process transport; the PWA uses browser fetch.
  if (/^https?:\/\//i.test(src) && !isRemoteSession()) {
    const response = await readBridge().remoteHttpRequest({
      url: src,
      responseEncoding: "base64",
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to load image (${response.status})`);
    }
    return Uint8Array.from(atob(response.body), (character) => character.charCodeAt(0));
  }
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load image (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Both desktop and browser clipboards accept PNG; keep saved originals unchanged. */
export async function toClipboardPngBytes(source: { src: string; mime?: string }) {
  const data = await fetchImageBytes(source.src);
  // Inspect the bytes as galleries and attachment URLs need not carry MIME metadata.
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
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
