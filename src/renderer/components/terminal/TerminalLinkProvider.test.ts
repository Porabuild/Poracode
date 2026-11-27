import { describe, expect, it } from "vitest";
import { TerminalLinkProvider } from "./TerminalLinkProvider";
import type { TerminalFileLinkSource, TerminalFileRef } from "./terminalProjectFileLinks";

type ProbeLink = {
  range: { start: { x: number; y: number }; end: { x: number; y: number } };
  text: string;
  activate: (event: MouseEvent, text: string) => void;
};

type LinkProviderProbe = {
  _getWindowedLineStrings(lineIndex: number): [string[], number];
  provideLinks(bufferLineNumber: number, callback: (links: ProbeLink[] | undefined) => void): void;
};

type Cell = { chars: string; width: number };

/** One width-1 cell per character — models a plain ASCII row. */
function ascii(text: string): Cell[] {
  return Array.from(text, (ch) => ({ chars: ch, width: 1 }));
}

/** A wide/CJK glyph: a width-2 lead cell followed by a width-0 spacer cell. */
function wide(ch: string): Cell[] {
  return [
    { chars: ch, width: 2 },
    { chars: "", width: 0 },
  ];
}

/**
 * A faithful xterm buffer-line mock: backed by an explicit cell array so the
 * provider's column-accurate width measurement (getCell / getWidth) and its
 * string view (translateToString) both behave like the real terminal.
 */
function makeLine(cells: Cell[] | string, isWrapped = false) {
  const arr = typeof cells === "string" ? ascii(cells) : cells;
  return {
    isWrapped,
    get length() {
      return arr.length;
    },
    translateToString(trim = false) {
      const s = arr.map((c) => (c.width === 0 ? "" : c.chars || " ")).join("");
      return trim ? s.replace(/[ ]+$/u, "") : s;
    },
    getCell(i: number, cell: { _chars: string; _width: number }) {
      const c = arr[i] ?? { chars: "", width: 0 };
      cell._chars = c.chars;
      cell._width = c.width;
      return cell;
    },
  };
}

// `cols` defaults to 80, the conventional terminal width. The hard-break
// continuation only fires when the line ending in the URL fills the row to
// exactly `cols`, so the stitching tests set `cols` to that line's width.
function makeProvider(
  lines: ReturnType<typeof makeLine>[],
  cols = 80,
  fileLinkSource?: TerminalFileLinkSource,
): LinkProviderProbe {
  return new TerminalLinkProvider(
    {
      cols,
      buffer: {
        active: {
          getLine: (index: number) => lines[index],
          getNullCell: () => {
            const cell = {
              _chars: "",
              _width: 0,
              getChars() {
                return cell._chars;
              },
              getWidth() {
                return cell._width;
              },
            };
            return cell;
          },
        },
      },
    } as never,
    () => undefined,
    fileLinkSource,
  ) as unknown as LinkProviderProbe;
}

function collectLinks(provider: LinkProviderProbe, y = 1): ProbeLink[] {
  let links: ProbeLink[] = [];
  provider.provideLinks(y, (result) => {
    links = result ?? [];
  });
  return links;
}

/** A controlled file-link layer: `findRefs` returns fixed refs so the provider's
 * coordinate mapping, URL precedence and activation can be tested in isolation. */
function fileSource(refs: TerminalFileRef[]): {
  source: TerminalFileLinkSource;
  activated: TerminalFileRef[];
} {
  const activated: TerminalFileRef[] = [];
  return {
    activated,
    source: {
      findRefs: () => refs,
      activate: (ref) => {
        activated.push(ref);
      },
    },
  };
}

describe("TerminalLinkProvider", () => {
  it("does not append numbered instruction lines to URL links", () => {
    const provider = makeProvider([
      makeLine("  https://auth.openai.com/codex/device"),
      makeLine("2. Enter this one-time code"),
    ]);

    const [lines] = provider._getWindowedLineStrings(0);

    expect(lines.join("")).toBe("  https://auth.openai.com/codex/device");
  });

  it("keeps stitching hard-wrapped URL continuation lines", () => {
    // The first line is filled to the right edge (width === cols), modelling a
    // soft-wrap whose `isWrapped` flag was dropped by ConPTY / scrollback replay.
    const head = "https://auth.x.ai/oauth2/authorize?response_type=code&client_id=grok";
    const provider = makeProvider(
      [makeLine(head), makeLine("-build&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback")],
      head.length,
    );

    const [lines] = provider._getWindowedLineStrings(0);

    expect(lines.join("")).toContain("client_id=grok-build");
    expect(lines.join("")).toContain("redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback");
  });

  it("stitches a full-width wrapped localhost URL whose wrap flag was lost", () => {
    const head = "http://localhost:5173/some/deep/path/abc";
    const provider = makeProvider([makeLine(head), makeLine("def/more?query=value")], head.length);

    const [lines] = provider._getWindowedLineStrings(0);

    expect(lines.join("")).toContain("path/abcdef/more?query=value");
  });

  it("stitches a wrapped URL even when wide glyphs make the row's width exceed its string length", () => {
    // Three wide glyphs (6 columns, 3 code units) + a 14-column URL fragment =
    // 20 columns === cols, but the string length is only 17. A code-unit check
    // would wrongly treat this full-width row as short and refuse to stitch.
    const head = [...wide("本"), ...wide("地"), ...wide("址"), ...ascii("http://localho")];
    const provider = makeProvider([makeLine(head), makeLine("st:5173/page")], 20);

    const [lines] = provider._getWindowedLineStrings(0);

    expect(lines.join("")).toContain("http://localhost:5173/page");
  });

  it("does not glue the next concurrently-prefixed line onto a short URL (WSL/Vite)", () => {
    // Reproduces the WSL bug: Vite prints a short `Local:` URL line, and the
    // very next line is another process's output (concurrently's `[1]` prefix).
    // The URL ends well short of the right edge, so nothing must be stitched.
    const provider = makeProvider([
      makeLine("[1]   ➜  Local:   http://localhost:5173/"),
      makeLine("[1]   ➜  Network: http://10.255.255.254:5173/"),
    ]);

    const [lines] = provider._getWindowedLineStrings(0);

    expect(lines.join("")).toBe("[1]   ➜  Local:   http://localhost:5173/");
    // The URL target must not become `http://localhost:5173/[1`.
    expect(lines.join("")).not.toContain("5173/[");
  });

  it("does not glue a bare following line onto a short URL", () => {
    const provider = makeProvider([
      makeLine("  Local:   http://localhost:5173/"),
      makeLine("README.md"),
    ]);

    const [lines] = provider._getWindowedLineStrings(0);

    expect(lines.join("")).toBe("  Local:   http://localhost:5173/");
  });

  it("does not stitch an over-long un-trimmed row left by a shrink-resize", () => {
    // The URL line's content (33 cols) overruns the shrunk grid (cols 12). A
    // real wrap would have reflowed the overflow onto a wrapped line, so an
    // over-wide single row is not a join point.
    const provider = makeProvider(
      [makeLine("Local: http://localhost:5173/"), makeLine("next-unrelated-output")],
      12,
    );

    const [lines] = provider._getWindowedLineStrings(0);

    expect(lines.join("")).toBe("Local: http://localhost:5173/");
    expect(lines.join("")).not.toContain("5173/next");
  });

  it("fails safe and does not stitch when the terminal width is unknown (cols=0)", () => {
    const provider = makeProvider(
      [makeLine("Local: http://localhost:5173/"), makeLine("next-unrelated-output")],
      0,
    );

    const [lines] = provider._getWindowedLineStrings(0);

    expect(lines.join("")).toBe("Local: http://localhost:5173/");
    expect(lines.join("")).not.toContain("5173/next");
  });
});

describe("TerminalLinkProvider project-file links", () => {
  it("returns a file link alongside a URL link and wires activation", () => {
    const ref: TerminalFileRef = {
      start: 0,
      text: "src/foo.ts:12",
      path: "src/foo.ts",
      line: 12,
    };
    const stub = fileSource([ref]);
    const provider = makeProvider(
      [makeLine("src/foo.ts:12 and https://example.com")],
      80,
      stub.source,
    );

    const links = collectLinks(provider);

    expect(links.map((link) => link.text)).toEqual(["https://example.com", "src/foo.ts:12"]);
    links[1]!.activate(new MouseEvent("click"), links[1]!.text);
    expect(stub.activated).toEqual([ref]);
  });

  it("keeps wrapped HTTP URL precedence: a file ref inside a URL is not double-linked", () => {
    const ref: TerminalFileRef = {
      start: 20, // "https://example.com/" is 20 chars; path:line sits inside the URL
      text: "src/foo.ts:12",
      path: "src/foo.ts",
      line: 12,
    };
    const stub = fileSource([ref]);
    const provider = makeProvider([makeLine("https://example.com/src/foo.ts:12")], 80, stub.source);

    const links = collectLinks(provider);

    expect(links.map((link) => link.text)).toEqual(["https://example.com/src/foo.ts:12"]);
    expect(stub.activated).toEqual([]);
  });

  it("keeps URL-only behavior when no project file source is configured", () => {
    const noProject = makeProvider([makeLine("src/foo.ts:12")]);
    expect(collectLinks(noProject)).toEqual([]);

    const urlOnly = makeProvider([makeLine("see https://example.com now")]);
    expect(collectLinks(urlOnly).map((link) => link.text)).toEqual(["https://example.com"]);
  });

  it("maps a soft-wrapped file ref across rows with correct ANSI/wrap coordinates", () => {
    const ref: TerminalFileRef = {
      start: 0,
      text: "src/foo.ts:12",
      path: "src/foo.ts",
      line: 12,
    };
    const stub = fileSource([ref]);
    // Line 1 is a soft-wrapped continuation (isWrapped), so the joined text is
    // "src/foo.ts:12 now"; the link must span both buffer rows.
    const provider = makeProvider(
      [makeLine("src/fo"), makeLine("o.ts:12 now", true)],
      80,
      stub.source,
    );

    const links = collectLinks(provider);

    expect(links).toHaveLength(1);
    expect(links[0]!.text).toBe("src/foo.ts:12");
    expect(links[0]!.range.start.y).toBe(1);
    expect(links[0]!.range.end.y).toBe(2);
    links[0]!.activate(new MouseEvent("click"), links[0]!.text);
    expect(stub.activated).toEqual([ref]);
  });
});
