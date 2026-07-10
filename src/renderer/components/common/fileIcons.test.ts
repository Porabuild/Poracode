// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
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
