// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFileIconUrl, getFolderIconUrl } from "./fileIcons";

describe("file icon URLs", () => {
  it("resolves language and exact-filename icons", () => {
    expect(getFileIconUrl("component.tsx")).toMatch(/\/assets\/material-icons\/react_ts\.svg$/u);
    expect(getFileIconUrl("widget.test.ts")).toMatch(/\/assets\/material-icons\/test-ts\.svg$/u);
    expect(getFileIconUrl("package.json")).toMatch(/\/assets\/material-icons\/nodejs\.svg$/u);
  });

  it("resolves named folders and falls back to the default icons", () => {
    expect(getFolderIconUrl("src")).toMatch(/\/assets\/material-icons\/folder-src\.svg$/u);
    expect(getFolderIconUrl("unrecognized-folder")).toMatch(
      /\/assets\/material-icons\/folder\.svg$/u,
    );
    expect(getFileIconUrl("README.unknown-extension")).toMatch(
      /\/assets\/material-icons\/file\.svg$/u,
    );
  });
});

describe("file icons in complete local/hosted builds", () => {
  afterEach(() => {
    document.head.querySelector('meta[name="poracode-build-asset-base"]')?.remove();
    vi.unstubAllEnvs();
  });

  it.each([
    { base: "./", marker: true, prefix: "/" },
    { base: "./", marker: false, prefix: "./" },
    { base: "/hosted/", marker: true, prefix: "/hosted/" },
  ])(
    "uses $prefix for a declared $base build with marker=$marker",
    async ({ base, marker, prefix }) => {
      vi.stubEnv("BASE_URL", base);
      if (marker) {
        const meta = document.createElement("meta");
        meta.name = "poracode-build-asset-base";
        meta.content = "/";
        document.head.append(meta);
      }
      // Metadata exists before the module is evaluated, just as in the served
      // head. Check both named assets and defaults initialized at import time.
      vi.resetModules();
      const icons = await import("./fileIcons");
      expect(icons.getFileIconUrl("component.tsx")).toBe(
        prefix + "assets/material-icons/react_ts.svg",
      );
      expect(icons.getFileIconUrl("unknown.bad-extension")).toBe(
        prefix + "assets/material-icons/file.svg",
      );
      expect(icons.getFolderIconUrl("src")).toBe(prefix + "assets/material-icons/folder-src.svg");
      expect(icons.getFolderIconUrl("unknown-folder")).toBe(
        prefix + "assets/material-icons/folder.svg",
      );
    },
  );
});
