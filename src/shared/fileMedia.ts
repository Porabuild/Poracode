import { mimeForPath } from "./promptContent";

/** Editor eligibility is separate from attachment MIME support (SVG stays editable source). */
export function fileMediaType(
  path: string,
): { kind: "image" | "audio" | "video"; mime: string } | null {
  const mime = mimeForPath(path);
  if (!mime) return null;
  if (mime.startsWith("image/") && !isSvgFile(path)) return { kind: "image", mime };
  if (mime.startsWith("audio/")) return { kind: "audio", mime };
  if (mime.startsWith("video/")) return { kind: "video", mime };
  return null;
}

export function isSvgFile(path: string): boolean {
  return /\.svg$/iu.test(path);
}
