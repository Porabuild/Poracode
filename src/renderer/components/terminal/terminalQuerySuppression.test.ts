import { Terminal, type IDisposable } from "@xterm/xterm";
import { afterEach, describe, expect, it } from "vitest";
import { installQueryReplySuppression } from "./terminalQuerySuppression";

/**
 * Parsing regressions against the real installed @xterm/xterm (constructed
 * without DOM.open — the parser, write queue and onData all work headless).
 *
 * Two layers are covered here:
 * 1. Sequence-level: every marker family really passes through (sentinels
 *    registered BEFORE the suppression handlers only run if the handler
 *    returned false) and marks a reply scope during replay only.
 * 2. State-level: mixed families keep applying their state half during
 *    replay, observed through public terminal state.
 *
 * Replies that xterm emits in Node (DA1/DA2/XTVERSION/DSR/CPR/DECXCPR/DECRQM/
 * kitty/DECRQSS) are exercised end-to-end in terminalReplayGate.test.ts.
 * OSC color, XTSMGRAPHICS, DECSET-focus and DA3 only reply with a renderer or
 * addon attached, so their scope marking is asserted via sentinels here.
 */

const TERM_OPTIONS = {
  allowProposedApi: true,
  vtExtensions: { kittyKeyboard: true, win32InputMode: true, colorSchemeQuery: true },
  // CSI t is security-gated per window op: sequences for disabled ops are
  // consumed before any handler chain runs. Enable the title ops so the
  // XTWINOPS family actually dispatches (the size reports stay disabled, as
  // in the app where only the ImageAddon enables them).
  windowOptions: { pushTitle: true, popTitle: true },
} as const;

const parse = (terminal: Terminal, data: string) => {
  return new Promise<void>((resolve) => terminal.write(data, resolve));
};

interface MarkerFamily {
  name: string;
  bytes: string;
  /** Sentinel registration: runs only if the suppression handler passed through. */
  registerSentinel: (terminal: Terminal, sentinel: () => boolean) => IDisposable;
}

const MARKER_FAMILIES: MarkerFamily[] = [
  {
    name: "DA1",
    bytes: "\x1b[c",
    registerSentinel: (t, sentinel) => t.parser.registerCsiHandler({ final: "c" }, sentinel),
  },
  {
    name: "DA2",
    bytes: "\x1b[>c",
    registerSentinel: (t, sentinel) =>
      t.parser.registerCsiHandler({ prefix: ">", final: "c" }, sentinel),
  },
  {
    name: "DA3",
    bytes: "\x1b[=c",
    registerSentinel: (t, sentinel) =>
      t.parser.registerCsiHandler({ prefix: "=", final: "c" }, sentinel),
  },
  {
    name: "XTVERSION",
    bytes: "\x1b[>q",
    registerSentinel: (t, sentinel) =>
      t.parser.registerCsiHandler({ prefix: ">", final: "q" }, sentinel),
  },
  {
    name: "DSR",
    bytes: "\x1b[5n",
    registerSentinel: (t, sentinel) => t.parser.registerCsiHandler({ final: "n" }, sentinel),
  },
  {
    name: "DECDSR",
    bytes: "\x1b[?6n",
    registerSentinel: (t, sentinel) =>
      t.parser.registerCsiHandler({ prefix: "?", final: "n" }, sentinel),
  },
  {
    name: "XTSMGRAPHICS",
    bytes: "\x1b[?1;1S",
    registerSentinel: (t, sentinel) =>
      t.parser.registerCsiHandler({ prefix: "?", final: "S" }, sentinel),
  },
  {
    name: "DECRQM-ANSI",
    bytes: "\x1b[$p",
    registerSentinel: (t, sentinel) =>
      t.parser.registerCsiHandler({ intermediates: "$", final: "p" }, sentinel),
  },
  {
    name: "DECRQM-DEC",
    bytes: "\x1b[?$p",
    registerSentinel: (t, sentinel) =>
      t.parser.registerCsiHandler({ prefix: "?", intermediates: "$", final: "p" }, sentinel),
  },
  {
    name: "KittyKeyboardQuery",
    bytes: "\x1b[?u",
    registerSentinel: (t, sentinel) =>
      t.parser.registerCsiHandler({ prefix: "?", final: "u" }, sentinel),
  },
  {
    name: "DECSET-1004-focus",
    bytes: "\x1b[?1004h",
    registerSentinel: (t, sentinel) =>
      t.parser.registerCsiHandler({ prefix: "?", final: "h" }, sentinel),
  },
  {
    name: "DECRST",
    bytes: "\x1b[?1004l",
    registerSentinel: (t, sentinel) =>
      t.parser.registerCsiHandler({ prefix: "?", final: "l" }, sentinel),
  },
  {
    name: "XTWINOPS",
    bytes: "\x1b[22;0t",
    registerSentinel: (t, sentinel) => t.parser.registerCsiHandler({ final: "t" }, sentinel),
  },
  {
    name: "DECRQSS",
    bytes: "\x1bP$qm\x1b\\",
    registerSentinel: (t, sentinel) =>
      t.parser.registerDcsHandler({ intermediates: "$", final: "q" }, () => sentinel()),
  },
  {
    name: "OSC-indexed-color",
    bytes: "\x1b]4;0;#ff0000\x07",
    registerSentinel: (t, sentinel) => t.parser.registerOscHandler(4, () => sentinel()),
  },
  {
    name: "OSC-special-color",
    bytes: "\x1b]11;?\x07",
    registerSentinel: (t, sentinel) => t.parser.registerOscHandler(11, () => sentinel()),
  },
];

describe("terminalQuerySuppression", () => {
  const disposables: IDisposable[] = [];
  afterEach(() => {
    while (disposables.length > 0) {
      disposables.pop()?.dispose();
    }
  });

  it("passes every marker family through and marks a reply scope during replay only", async () => {
    for (const family of MARKER_FAMILIES) {
      const terminal = new Terminal(TERM_OPTIONS);
      let replaying = false;
      const sentinelLog: boolean[] = [];
      // Registered BEFORE the suppression handlers → dispatched after them
      // (the parser runs last-registered-first), so the sentinel observes the
      // scope the marker left behind and proves the pass-through.
      const suppressionRef: { suppression?: ReturnType<typeof installQueryReplySuppression> } = {};
      disposables.push(
        family.registerSentinel(terminal, () => {
          const scope = suppressionRef.suppression?.hasPendingReplyScope() ?? false;
          sentinelLog.push(scope);
          return false;
        }),
      );
      suppressionRef.suppression = installQueryReplySuppression(terminal, () => replaying);
      const suppression = suppressionRef.suppression;

      replaying = true;
      await parse(terminal, `frame${family.bytes}`);
      expect(suppression.hasPendingReplyScope()).toBe(false);
      replaying = false;

      await parse(terminal, family.bytes);
      expect(sentinelLog).toEqual([true, false]);
      suppression.dispose();
      terminal.dispose();
    }
  });

  it("passes mixed set+query OSC payloads through instead of swallowing them", async () => {
    // Regression: an any-query-means-swallow handler dropped the legitimate
    // color SETs sharing the sequence with a report.
    const terminal = new Terminal(TERM_OPTIONS);
    let replaying = false;
    const suppression = installQueryReplySuppression(terminal, () => replaying);
    const payloads: string[] = [];
    disposables.push(
      terminal.parser.registerOscHandler(4, (data) => {
        payloads.push(data);
        return false;
      }),
    );

    replaying = true;
    await parse(terminal, "\x1b]4;0;#ff0000;1;?\x1b\\");
    replaying = false;
    // The full mixed payload reached the built-in chain: color 0 SET applies,
    // the color 1 report is dropped at onData by the pending scope.
    expect(payloads).toEqual(["0;#ff0000;1;?"]);
    suppression.dispose();
    terminal.dispose();
  });

  it("keeps applying state-setting sequences during replay", async () => {
    const terminal = new Terminal(TERM_OPTIONS);
    let replaying = true;
    const suppression = installQueryReplySuppression(terminal, () => replaying);

    // SGR + CUP (rendering state): CUP 10;20 puts the cursor at row 10,
    // col 20 (0-based 9/19), then "bold" prints and advances it to col 23.
    await parse(terminal, "\x1b[10;20H\x1b[1mbold");
    expect(terminal.buffer.active.cursorX).toBe(23);
    expect(terminal.buffer.active.cursorY).toBe(9);
    const cell = terminal.buffer.active.getLine(9)?.getCell(19);
    // The typings claim boolean; the installed build returns the attribute
    // mask (truthy when bold) — assert truthiness.
    expect(cell?.isBold()).toBeTruthy();
    expect(terminal.buffer.active.getLine(9)?.translateToString(true)).toContain("bold");

    // Alt buffer (DECSET 1049 — the DECSET family must not be swallowed).
    await parse(terminal, "\x1b[?1049h");
    expect(terminal.buffer.active.type).toBe("alternate");

    // Title push/pop (XTWINOPS 22/23 — the state half of a mixed family).
    // xterm 6 removed the public title getter; observe the change events.
    const titles: string[] = [];
    disposables.push(terminal.onTitleChange((title) => titles.push(title)));
    await parse(terminal, "\x1b]0;FIRST\x07\x1b[22;0t\x1b]0;SECOND\x07\x1b[23;0t");
    expect(titles).toEqual(["FIRST", "SECOND", "FIRST"]); // pop restored the push

    suppression.dispose();
    terminal.dispose();
    replaying = false;
  });

  it("clears the reply scope after the parse completes", async () => {
    const terminal = new Terminal(TERM_OPTIONS);
    let replaying = true;
    const suppression = installQueryReplySuppression(terminal, () => replaying);

    expect(suppression.hasPendingReplyScope()).toBe(false);
    const parsed = parse(terminal, "\x1b[c");
    // Inside the same task the write has not been parsed yet.
    expect(suppression.hasPendingReplyScope()).toBe(false);
    await parsed;
    // The scope is synchronous: cleared by the microtask after the parse.
    expect(suppression.hasPendingReplyScope()).toBe(false);

    suppression.dispose();
    terminal.dispose();
    replaying = false;
  });

  it("swallows OSC 52 clipboard reads and writes entirely during replay", async () => {
    // The ClipboardAddon handler answers reads asynchronously (after the
    // synchronous scope clears), and a historical clipboard write is an
    // external action, not rendered terminal state — both must be blocked.
    // Live OSC 52 must pass through untouched. The observer is registered
    // before the suppression handlers, i.e. dispatched after them: it only
    // sees sequences the swallow let through.
    const terminal = new Terminal(TERM_OPTIONS);
    let replaying = true;
    const passthrough: string[] = [];
    disposables.push(
      terminal.parser.registerOscHandler(52, (data) => {
        passthrough.push(data);
        return false;
      }),
    );
    const suppression = installQueryReplySuppression(terminal, () => replaying);

    await parse(terminal, "\x1b]52;c;?\x07\x1b]52;c;aGVsbG8=\x07");
    expect(passthrough).toEqual([]);

    replaying = false;
    await parse(terminal, "\x1b]52;c;?\x07");
    expect(passthrough).toEqual(["c;?"]);

    suppression.dispose();
    terminal.dispose();
  });
});
