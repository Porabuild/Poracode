import { describe, expect, it } from "vitest";
import { tokenizePlainText } from "./plainTextTokens";
import { parsePathRefUrl, pathRefUrl } from "./markdownPathRefs";
import type { ProjectPathRef } from "./parseProjectPathRef";

describe("explicit Markdown path references", () => {
  it.each<ProjectPathRef>([
    { kind: "file", path: "C:/My Documents/file [draft]).pdf" },
    { kind: "file", path: "/tmp/source.ts", line: 4, endLine: 9 },
    { kind: "folder", path: "/tmp/My Documents" },
  ])("roundtrips an explicit reference through both render paths: %j", (ref) => {
    const href = pathRefUrl(ref);
    expect(parsePathRefUrl(href)).toEqual(ref);
    expect(tokenizePlainText(`See [file \\[draft\\]](${href}).`, new Set())).toEqual([
      { kind: "text", value: "See " },
      ref,
      { kind: "text", value: "." },
    ]);
  });

  it("tokenizes v2 links with punctuation and a colon-digit filename", () => {
    const ref: ProjectPathRef = {
      kind: "file",
      path: String.raw`/tmp/report:20-26?draft#100% (copy)\final.ts`,
      line: 4,
      endLine: 9,
    };
    const href = pathRefUrl(ref);
    expect(tokenizePlainText(`See [report](${href}).`, new Set())).toEqual([
      { kind: "text", value: "See " },
      ref,
      { kind: "text", value: "." },
    ]);
  });

  it("keeps the pre-existing sentinel forms compatible", () => {
    expect(parsePathRefUrl("poracode:path:src/main.ts%3A12-18")).toEqual({
      kind: "file",
      path: "src/main.ts",
      line: 12,
      endLine: 18,
    });
    expect(parsePathRefUrl("poracode:folder:src%2Fcomponents")).toEqual({
      kind: "folder",
      path: "src/components",
    });
    expect(parsePathRefUrl("https://poracode.local/path/src%2Fmain.ts")).toEqual({
      kind: "file",
      path: "src/main.ts",
    });
  });

  it("preserves ordinary prose, URL punctuation, and inferred paths", () => {
    expect(
      tokenizePlainText("See https://example.test/docs, then src/main.ts:2-4.", new Set(["src"])),
    ).toEqual([
      { kind: "text", value: "See " },
      { kind: "url", href: "https://example.test/docs" },
      { kind: "text", value: ", then " },
      { kind: "file", path: "src/main.ts", line: 2, endLine: 4 },
      { kind: "text", value: "." },
    ]);
    expect(parsePathRefUrl("https://example.test/path/file.pdf")).toBeNull();
  });
});
