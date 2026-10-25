/**
 * Thumbnail form of a desktop `poracode-local://` image URL. The main-process
 * protocol handler resizes the file before it reaches the renderer, so a tiny
 * tile never rescales a full screenshot. The page cannot do this itself: the
 * local scheme is cross-origin, so its pixels cannot be read back from a
 * canvas. Display only — never persist these URLs.
 */
const LOCAL_FILE_URL_RE = /^(?:poracode|lightcode)-local:\/\//;
const THUMB_PARAM = "thumb";

export const MAX_LOCAL_IMAGE_THUMB_PX = 1024;

/** `url` with a thumbnail size, or null when it is not a local-file URL. */
export function localImageThumbUrl(url: string, px: number): string | null {
  if (!LOCAL_FILE_URL_RE.test(url) || !(px > 0)) return null;
  const size = Math.min(MAX_LOCAL_IMAGE_THUMB_PX, Math.ceil(px));
  return `${url}${url.includes("?") ? "&" : "?"}${THUMB_PARAM}=${size}`;
}

/** The requested thumbnail edge in pixels, or null for a full-size request. */
export function readLocalImageThumbPx(url: string): number | null {
  const raw = new URL(url).searchParams.get(THUMB_PARAM);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const px = Number(raw);
  return px >= 1 && px <= MAX_LOCAL_IMAGE_THUMB_PX ? px : null;
}
