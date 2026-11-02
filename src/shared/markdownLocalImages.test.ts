import { describe, expect, it } from "vitest";
import {
  resolveMarkdownFileUrl,
  resolveMarkdownImageUrl,
  rewriteMarkdownLocalImageUrls,
} from "./markdownLocalImages";
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

  it("resolves Grok session-relative images/ paths via extraRoots first", () => {
    const sessionDir =
      "C:\\Users\\me\\.grok\\sessions\\E%3A%5Cwork%5Crepo\\019f6789-4fd1-7740-a828-9a42918d42e8";
    expect(
      resolveMarkdownImageUrl("images/4.jpg", {
        projectRoot: "E:\\work\\repo",
        extraRoots: [sessionDir],
      }),
    ).toBe(toLocalFileUrl(`${sessionDir.replaceAll("\\", "/")}/images/4.jpg`));
  });

  it("falls back to projectRoot for non-session relative images", () => {
    expect(
      resolveMarkdownImageUrl("verification-shots/01.png", {
        projectRoot: "E:\\work\\repo",
        extraRoots: ["C:\\Users\\me\\.grok\\sessions\\x\\y"],
      }),
    ).toBe(toLocalFileUrl("E:/work/repo/verification-shots/01.png"));
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

  it("rewrites Grok image_gen relative paths against the session media root", () => {
    const sessionDir =
      "C:\\Users\\sdsle\\.grok\\sessions\\E%3A%5Cwork%5Clightcode%5C.poracode%5Cworktrees%5Cporacode-warm-yak-d27ed350\\019f6789-4fd1-7740-a828-9a42918d42e8";
    const out = rewriteMarkdownLocalImageUrls(
      "![Modal PDF preview](images/4.jpg)\n\n![Editor mockup](images/1.jpg)",
      {
        projectRoot: "E:\\work\\lightcode\\.poracode\\worktrees\\poracode-warm-yak-d27ed350",
        extraRoots: [sessionDir],
      },
    );
    const urls = [...out.matchAll(/!\[[^\]]*\]\(<([^>]+)>\)/g)].map((m) => m[1]!);
    expect(urls).toHaveLength(2);
    expect(resolveLocalFileUrlPath(urls[0]!, "win32")).toBe(
      `${sessionDir.replaceAll("\\", "/")}/images/4.jpg`,
    );
    expect(resolveLocalFileUrlPath(urls[1]!, "win32")).toBe(
      `${sessionDir.replaceAll("\\", "/")}/images/1.jpg`,
    );
  });
});

describe("resolveMarkdownFileUrl", () => {
  it("canonicalizes Windows drive, file:// and POSIX artifact links", () => {
    expect(resolveMarkdownFileUrl("D:\\out\\my build.zip")).toBe(
      toLocalFileUrl("D:/out/my build.zip"),
    );
    expect(resolveMarkdownFileUrl("file:///C:/out/my%20build.zip")).toBe(
      toLocalFileUrl("C:/out/my build.zip"),
    );
    expect(resolveMarkdownFileUrl("/tmp/out/a.pdf")).toBe(toLocalFileUrl("/tmp/out/a.pdf"));
  });

  it("canonicalizes UNC shares without losing the host", () => {
    expect(resolveMarkdownFileUrl("\\\\nas\\share\\a.zip")).toBe(
      "poracode-local://local//nas/share/a.zip",
    );
  });

  it("resolves project-relative artifact links against the root", () => {
    expect(resolveMarkdownFileUrl("dist/app.zip", { projectRoot: "E:\\work\\repo" })).toBe(
      toLocalFileUrl("E:/work/repo/dist/app.zip"),
    );
    expect(resolveMarkdownFileUrl("./dist/app.zip", { projectRoot: "/repo" })).toBe(
      toLocalFileUrl("/repo/dist/app.zip"),
    );
  });

  it.each([
    "https://example.test/a.zip",
    "poracode-local://local/C:/out/a.zip",
    "javascript:alert(1)",
    "src/file.ts",
    "README.md",
    "folder/",
    "../escape.zip",
    "out/../escape.zip",
  ])("leaves non-artifact or unsafe %j unchanged", (url) => {
    expect(resolveMarkdownFileUrl(url, { projectRoot: "/repo" })).toBeNull();
  });

  it("leaves a relative artifact unchanged without a root", () => {
    expect(resolveMarkdownFileUrl("dist/app.zip")).toBeNull();
  });

  it.each([
    ["dist/my%20build.zip", "dist/my build.zip"],
    ["dist/a%23b.zip", "dist/a#b.zip"],
    ["dist/a%3Fb.zip", "dist/a?b.zip"],
    ["dist/a%25b.zip", "dist/a%b.zip"],
    ["dist/%C3%BCn%C3%AFcode.zip", "dist/ünïcode.zip"],
  ])("decodes a valid %s destination once", (url, name) => {
    expect(resolveMarkdownFileUrl(url, { projectRoot: "/repo" })).toBe(
      toLocalFileUrl(`/repo/${name}`),
    );
  });

  it("keeps %2520 as a literal percent name and %25.. as literal percent", () => {
    expect(resolveMarkdownFileUrl("dist/my%2520build.zip", { projectRoot: "/repo" })).toBe(
      toLocalFileUrl("/repo/dist/my%20build.zip"),
    );
  });

  it("rejects encoded traversal after the single decode", () => {
    expect(resolveMarkdownFileUrl("%2E%2E/escape.zip", { projectRoot: "/repo" })).toBeNull();
    expect(resolveMarkdownFileUrl("dist/%2E%2E%2Fescape.zip", { projectRoot: "/repo" })).toBeNull();
  });

  it("rejects malformed percent encoding", () => {
    expect(resolveMarkdownFileUrl("dist/a%zz.zip", { projectRoot: "/repo" })).toBeNull();
    expect(resolveMarkdownFileUrl("dist/%E0%A4%A.zip", { projectRoot: "/repo" })).toBeNull();
  });
});

describe("rewriteMarkdownLocalResourceUrls (via rewriteMarkdownLocalImageUrls)", () => {
  it("rewrites a Windows backslash artifact link before CommonMark escapes it", () => {
    const out = rewriteMarkdownLocalImageUrls("[Build](D:\\out\\.cache\\my build.zip)");
    const url = out.match(/\[[^\]]*\]\(<([^>]+)>\)/)?.[1];
    expect(url).toBeTruthy();
    expect(resolveLocalFileUrlPath(url!, "win32")).toBe("D:/out/.cache/my build.zip");
  });

  it("rewrites project-relative and file:// artifact links", () => {
    const out = rewriteMarkdownLocalImageUrls(
      "[Zip](dist/a b.zip) and [Doc](file:///tmp/s%20spec.pdf)",
      { projectRoot: "/repo" },
    );
    const urls = [...out.matchAll(/\[[^\]]*\]\(<([^>]+)>\)/g)].map((m) => m[1]!);
    expect(urls).toHaveLength(2);
    expect(resolveLocalFileUrlPath(urls[0]!, "linux")).toBe("/repo/dist/a b.zip");
    expect(resolveLocalFileUrlPath(urls[1]!, "linux")).toBe("/tmp/s spec.pdf");
  });

  it("rewrites angle-bracket destinations and Unicode filenames", () => {
    const out = rewriteMarkdownLocalImageUrls("[D](<C:\\out\\ünïcode.zip>)");
    const url = out.match(/\(<([^>]+)>\)/)?.[1]!;
    expect(resolveLocalFileUrlPath(url, "win32")).toBe("C:/out/ünïcode.zip");
  });

  it.each([
    "[Src](src/file.ts)",
    "[Doc](README.md)",
    "[Web](https://example.test/a.zip)",
    "![Img](docs/a.zip)",
    "`[Code](dist/a.zip)`",
    "```\n[Fenced](dist/a.zip)\n```",
    "    [Indented](dist/a.zip)",
    "[Unsafe](javascript:alert(1))",
    "[Partial](dist/a.zip",
  ])("leaves %j untouched", (text) => {
    expect(rewriteMarkdownLocalImageUrls(text, { projectRoot: "/repo" })).toBe(text);
  });

  it("keeps video links on the video rewrite", () => {
    const out = rewriteMarkdownLocalImageUrls("[Watch](videos/demo.mp4)", {
      projectRoot: "/repo",
    });
    expect(out).toContain("poracode-local://local/");
  });
});
