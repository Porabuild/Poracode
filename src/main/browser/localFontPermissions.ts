import type { WebContents } from "electron";

const appRenderers = new WeakMap<WebContents, string>();

/** Register only the main app window, never browser tabs or quick composers. */
export function registerLocalFontRenderer(contents: WebContents, rendererUrl: string): void {
  appRenderers.set(contents, rendererUrl);
}

export function canEnumerateLocalFonts(
  contents: WebContents | null,
  details: { isMainFrame: boolean; requestingUrl?: string },
): boolean {
  if (!contents || !details.isMainFrame || !details.requestingUrl) return false;
  const expected = appRenderers.get(contents);
  if (!expected || contents.isDestroyed()) return false;
  try {
    const allowed = new URL(expected);
    const matches = (value: string) => {
      const url = new URL(value);
      return allowed.protocol === "file:"
        ? url.protocol === "file:" && url.host === allowed.host && url.pathname === allowed.pathname
        : url.origin === allowed.origin && url.pathname === allowed.pathname;
    };
    return matches(contents.getURL()) && matches(details.requestingUrl);
  } catch {
    return false;
  }
}
