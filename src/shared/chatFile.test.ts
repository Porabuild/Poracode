import { describe, expect, it } from "vitest";
import {
  chatFileLocalPath,
  chatFileName,
  isChatDownloadPath,
  isChatDownloadSource,
  isChatFileSource,
} from "./chatFile";

describe("isChatFileSource", () => {
  it.each([
    "out/release.zip",
    "./dist/app.tar.gz",
    "C:\\Users\\me\\out\\a.zip",
    "D:/build/app.zip",
    "/tmp/out/a.zip",
    "\\\\server\\share\\a.zip",
    "//server/share/a.zip",
    "file:///C:/out/a%20b.zip",
    "file://server/share/a.zip",
    "poracode-local://local/C:/out/a.zip",
    "poracode-local://local/",
  ])("accepts safe local reference %s", (src) => {
    expect(isChatFileSource(src)).toBe(true);
  });

  it.each([
    "",
    "javascript:alert(1)",
    "data:application/zip;base64,xx",
    "blob:https://app/x",
    "custom-scheme://x/a.zip",
    "https://example.test/a.zip",
    "http://example.test/a.zip",
    "poracode-local://evil/a.zip",
    "poracode-local://locality/a.zip",
    "poracode-local://local.evil/a.zip",
    "a\nb.zip",
    "a\tb.zip",
    "a\x7fb.zip",
  ])("rejects unsafe or foreign reference %j", (src) => {
    expect(isChatFileSource(src)).toBe(false);
  });
});

describe("chatFileLocalPath", () => {
  it("decodes file:// URL paths exactly once", () => {
    expect(chatFileLocalPath("file:///C:/out/my%20build.zip")).toBe("C:/out/my build.zip");
    expect(chatFileLocalPath("file:///tmp/a%2520b.zip")).toBe("/tmp/a%20b.zip");
  });

  it("decodes canonical local URLs and keeps literal percent names", () => {
    expect(chatFileLocalPath("poracode-local://local/C:/out/a%2520b.zip")).toBe("C:/out/a%20b.zip");
  });

  it("maps a file:// host to a UNC path", () => {
    expect(chatFileLocalPath("file://nas/share/a.zip")).toBe("//nas/share/a.zip");
  });

  it("passes plain filesystem paths through unchanged", () => {
    expect(chatFileLocalPath("C:\\out\\a.zip")).toBe("C:\\out\\a.zip");
    expect(chatFileLocalPath("/tmp/a.zip")).toBe("/tmp/a.zip");
  });

  it.each(["poracode-local://local/a%ZZ.zip", "javascript:a.zip", ""])(
    "returns undefined for malformed or unsafe %j",
    (src) => {
      expect(chatFileLocalPath(src)).toBeUndefined();
    },
  );
});

describe("isChatDownloadPath / isChatDownloadSource", () => {
  it.each([
    "release.zip",
    "app.tar",
    "a.gz",
    "a.tgz",
    "a.bz2",
    "a.xz",
    "a.7z",
    "a.rar",
    "spec.PDF",
    "doc.docx",
    "a.odt",
    "a.rtf",
    "s.pptx",
    "t.ods",
    "s.xlsx",
    "a.csv",
    "a.tsv",
    "b.epub",
    "n.txt",
    "a.apk",
    "a.aab",
    "a.ipa",
    "a.dmg",
    "a.pkg",
    "a.exe",
    "a.msi",
    "a.deb",
    "a.rpm",
  ])("classifies artifact path %s", (path) => {
    expect(isChatDownloadPath(path)).toBe(true);
  });

  it.each([
    "src/file.ts",
    "app.js",
    "data.json",
    "README.md",
    "image.png",
    "clip.mp4",
    "no-extension",
    ".zip",
  ])("does not classify %s as a markdown artifact", (path) => {
    expect(isChatDownloadPath(path)).toBe(false);
  });

  it("honors a binary mime hint", () => {
    expect(isChatDownloadPath("blob", "application/octet-stream")).toBe(true);
    expect(isChatDownloadPath("doc", "application/pdf")).toBe(true);
  });

  it("combines the safety gate with classification", () => {
    expect(isChatDownloadSource("poracode-local://local/C:/out/a.zip")).toBe(true);
    expect(isChatDownloadSource("poracode-local://local/C:/src/a.ts")).toBe(false);
    expect(isChatDownloadSource("https://example.test/a.zip")).toBe(false);
    expect(isChatDownloadSource("file:///tmp/a.zip")).toBe(true);
    expect(isChatDownloadSource("out/../evil.zip")).toBe(true); // card is safe; the host rejects traversal
  });
});

describe("chatFileName", () => {
  it("prefers the explicit name", () => {
    expect(chatFileName("/tmp/a.zip", "  Report.zip  ")).toBe("Report.zip");
  });
  it("keeps a literal percent and ?/# in a raw typed path", () => {
    expect(chatFileName("/repo/a%20b.zip")).toBe("a%20b.zip");
    expect(chatFileLocalPath("/repo/a%20b.zip")).toBe("/repo/a%20b.zip");
    expect(isChatDownloadPath("/repo/a?b.zip")).toBe(true);
  });
  it("shows the decoded basename, not raw URL encoding", () => {
    expect(chatFileName("file:///C:/out/my%20build.zip")).toBe("my build.zip");
    expect(chatFileName("poracode-local://local/tmp/ünïcode.zip")).toBe("ünïcode.zip");
  });
});
