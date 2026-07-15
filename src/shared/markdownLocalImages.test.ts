import { describe, expect, it } from "vitest";
import { resolveMarkdownImageUrl, rewriteMarkdownLocalImageUrls } from "./markdownLocalImages";
import { resolveLocalFileUrlPath, toLocalFileUrl } from "./promptContent";

describe("resolveMarkdownImageUrl", () => {
  it("converts Windows absolute paths to poracode-local URLs", () => {
    expect(resolveMarkdownImageUrl("C:\\Users\\me\\.grok\\sessions\\shot.png")).toBe(
      toLocalFileUrl("C:\\Users\\me\\.grok\\sessions\\shot.png"),
    );
  });

  it("converts POSIX absolute paths to poracode-local URLs", () => {
    expect(resolveMarkdownImageUrl("/tmp/shot.png")).toBe(toLocalFileUrl("/tmp/shot.png"));
  });

  it("resolves project-relative image paths against the project root", () => {
    expect(
      resolveMarkdownImageUrl("verification-shots/01-collapsed.png", {
        projectRoot: "E:\\work\\repo",
      }),
    ).toBe(toLocalFileUrl("E:/work/repo/verification-shots/01-collapsed.png"));
  });

  it("refuses relative path traversal", () => {
    expect(resolveMarkdownImageUrl("../secret.png", { projectRoot: "E:\\work\\repo" })).toBeNull();
  });

  it("leaves remote and data URLs alone", () => {
    expect(resolveMarkdownImageUrl("https://example.test/a.png")).toBeNull();
    expect(resolveMarkdownImageUrl("data:image/png;base64,abc")).toBeNull();
    expect(resolveMarkdownImageUrl("poracode-local://local/C:/tmp/a.png")).toBeNull();
  });

  it("does not promote non-image relative paths", () => {
    expect(resolveMarkdownImageUrl("notes.md", { projectRoot: "E:\\work\\repo" })).toBeNull();
  });
});

describe("rewriteMarkdownLocalImageUrls", () => {
  it("rewrites Windows backslash image targets before markdown can mangle them", () => {
    // CommonMark treats `\.` as an escaped `.`, which would turn
    // `C:\Users\me\.grok\…` into `C:\Users\me.grok\…` if left unrewritten.
    const input = "![Before](C:\\Users\\me\\.grok\\sessions\\E%3A%5Cwork\\assets\\image.png)";
    const out = rewriteMarkdownLocalImageUrls(input);
    expect(out).toContain("poracode-local://local/");
    expect(out).toMatch(/^!\[[^\]]*\]\(<poracode-local:\/\/local\/[^>]+>\)$/);

    const url = out.match(/!\[[^\]]*\]\(<([^>]+)>\)/)?.[1];
    expect(url).toBeTruthy();
    expect(resolveLocalFileUrlPath(url!, "win32")).toBe(
      "C:/Users/me/.grok/sessions/E%3A%5Cwork/assets/image.png",
    );
  });

  it("rewrites relative verification-shot paths when a project root is provided", () => {
    const out = rewriteMarkdownLocalImageUrls(
      "See ![After](verification-shots/01-collapsed-same-file-edits.png)",
      { projectRoot: "E:\\work\\lightcode\\.poracode\\worktrees\\poracode-brave-willow" },
    );
    expect(out).toContain("poracode-local://local/E:");
    expect(out).toContain("verification-shots");
    expect(out).not.toContain("](verification-shots/");
  });

  it("leaves incomplete streaming image syntax untouched", () => {
    const partial = "![Before](C:\\Users\\me\\shot";
    expect(rewriteMarkdownLocalImageUrls(partial)).toBe(partial);
  });

  it("leaves remote markdown images untouched", () => {
    const remote = "![Remote](https://example.test/a.png)";
    expect(rewriteMarkdownLocalImageUrls(remote)).toBe(remote);
  });

  it("round-trips the nightly Grok ACP verification markdown paths", () => {
    const projectRoot = "E:\\work\\lightcode\\.poracode\\worktrees\\poracode-brave-willow-b4fc6c26";
    const sessionAsset =
      "C:\\Users\\sdsle\\.grok\\sessions\\E%3A%5Cwork%5Clightcode%5C.poracode%5Cworktrees%5Cporacode-brave-willow-b4fc6c26\\019f66fb-2716-7c00-ac5a-85ca2c4e8b58\\assets\\image-ea056148-aef3-4592-a6b7-1b3ec77fe7bd.png";
    const md = [
      `![Before: individual Edit rows](${sessionAsset})`,
      "",
      "![After: collapsed](verification-shots/01-collapsed-same-file-edits.png)",
    ].join("\n");

    const out = rewriteMarkdownLocalImageUrls(md, { projectRoot });
    const urls = [...out.matchAll(/!\[[^\]]*\]\(<([^>]+)>\)/g)].map((m) => m[1]!);
    expect(urls).toHaveLength(2);

    expect(resolveLocalFileUrlPath(urls[0]!, "win32")).toBe(sessionAsset.replaceAll("\\", "/"));
    expect(resolveLocalFileUrlPath(urls[1]!, "win32")).toBe(
      `${projectRoot.replaceAll("\\", "/")}/verification-shots/01-collapsed-same-file-edits.png`,
    );
  });
});
