import type { WebContents } from "electron";
import { describe, expect, it } from "vitest";
import { canEnumerateLocalFonts, registerLocalFontRenderer } from "./localFontPermissions";

function renderer(url: string, destroyed = false): WebContents {
  return { getURL: () => url, isDestroyed: () => destroyed } as WebContents;
}

describe("local font permissions", () => {
  it.each(["file:///app/dist/renderer/index.html", "http://localhost:3100/"])(
    "allows only the registered main frame at %s",
    (url) => {
      const contents = renderer(url);
      registerLocalFontRenderer(contents, url);
      expect(canEnumerateLocalFonts(contents, { isMainFrame: true, requestingUrl: url })).toBe(
        true,
      );
      expect(canEnumerateLocalFonts(renderer(url), { isMainFrame: true, requestingUrl: url })).toBe(
        false,
      );
      expect(canEnumerateLocalFonts(contents, { isMainFrame: false, requestingUrl: url })).toBe(
        false,
      );
      expect(
        canEnumerateLocalFonts(contents, {
          isMainFrame: true,
          requestingUrl: "https://example.com/",
        }),
      ).toBe(false);
      expect(canEnumerateLocalFonts(contents, { isMainFrame: true })).toBe(false);
    },
  );

  it("denies other local files, changed origins, navigation, destroyed renderers and null owners", () => {
    for (const url of [
      "file:///app/other.html",
      "https://example.com/",
      "http://localhost:3101/",
    ]) {
      const contents = renderer(url);
      registerLocalFontRenderer(contents, "file:///app/dist/renderer/index.html");
      expect(canEnumerateLocalFonts(contents, { isMainFrame: true, requestingUrl: url })).toBe(
        false,
      );
    }
    const dead = renderer("http://localhost:3100/", true);
    registerLocalFontRenderer(dead, "http://localhost:3100/");
    expect(
      canEnumerateLocalFonts(dead, { isMainFrame: true, requestingUrl: "http://localhost:3100/" }),
    ).toBe(false);
    expect(
      canEnumerateLocalFonts(null, { isMainFrame: true, requestingUrl: "file:///app/index.html" }),
    ).toBe(false);
  });
});
