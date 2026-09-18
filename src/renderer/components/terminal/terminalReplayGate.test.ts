import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import { TerminalReplayGate } from "./terminalReplayGate";

/**
 * Session-lifecycle regressions against the real installed @xterm/xterm
 * (constructed without DOM.open — write queue, parser and onData all work
 * headless). The onData wiring mirrors XTermSurface: replies are dropped
 * exactly while `gate.isDroppingReplies` holds.
 *
 * Families marked here are the ones xterm answers in Node; families that need
 * a renderer/addon to answer are covered at scope level in
 * terminalQuerySuppression.test.ts.
 */

const TERM_OPTIONS = {
  allowProposedApi: true,
  vtExtensions: { kittyKeyboard: true, win32InputMode: true, colorSchemeQuery: true },
} as const;

/**
 * Matches an onData emission `ESC` + body, where the body regex carries no
 * control characters (oxlint no-control-regex); ESC stays in the string.
 */
const escReply = (body: RegExp) => (data: string) => {
  return data.startsWith("\x1b") && body.test(data.slice(1));
};

/** Families with a deterministic reply in a headless terminal. */
const REPLY_FAMILIES: Array<{
  name: string;
  bytes: string;
  replyPattern: (data: string) => boolean;
}> = [
  { name: "DA1", bytes: "\x1b[c", replyPattern: escReply(/^\[\?1;2c$/) },
  { name: "DA1-param", bytes: "\x1b[0c", replyPattern: escReply(/^\[\?1;2c$/) },
  { name: "DA2", bytes: "\x1b[>c", replyPattern: escReply(/^\[>0;276;0c$/) },
  {
    name: "XTVERSION",
    bytes: "\x1b[>q",
    replyPattern: (d) => d.startsWith("\x1bP>|xterm.js(") && d.endsWith("\x1b\\"),
  },
  { name: "DSR-5", bytes: "\x1b[5n", replyPattern: escReply(/^\[0n$/) },
  { name: "CPR-6", bytes: "\x1b[6n", replyPattern: escReply(/^\[\d+;\d+R$/) },
  { name: "DECXCPR", bytes: "\x1b[?6n", replyPattern: escReply(/^\[\?\d+;\d+R$/) },
  { name: "DECRQM-ANSI", bytes: "\x1b[$p", replyPattern: escReply(/^\[\d+;\d+\$y$/) },
  { name: "DECRQM-DEC", bytes: "\x1b[?$p", replyPattern: escReply(/^\[\?\d+;\d+\$y$/) },
  { name: "KittyKeyboardQuery", bytes: "\x1b[?u", replyPattern: escReply(/^\[\?\d+u$/) },
  { name: "DECRQSS", bytes: "\x1bP$qm\x1b\\", replyPattern: (d) => d === "\x1bP1$r0m\x1b\\" },
];

function setup() {
  const terminal = new Terminal(TERM_OPTIONS);
  const pty: string[] = [];
  const dropped: string[] = [];
  const gate = new TerminalReplayGate(terminal);
  terminal.onData((data) => {
    if (gate.isDroppingReplies) {
      dropped.push(data);
    } else {
      pty.push(data);
    }
  });
  const parse = (data: string) => new Promise<void>((resolve) => terminal.write(data, resolve));
  const topLine = () =>
    terminal.buffer.active.getLine(terminal.buffer.active.baseY)?.translateToString(true) ?? "";
  return { terminal, gate, pty, dropped, parse, topLine };
}

/**
 * Arm a `CSI Z` handler that suspends parsing mid-chunk (async handler) until
 * released — simulating an async parser handler (e.g. sixel) stalling a large
 * replay so a reset/supersession can land while the chunk is queued. Every
 * `CSI Z` pushes one resolver; parsing holds there until it is called.
 */
function armParsePause(terminal: Terminal) {
  const resolvers: Array<(value: boolean) => void> = [];
  const disposable = terminal.parser.registerCsiHandler({ final: "Z" }, () => {
    return new Promise<boolean>((resolve) => resolvers.push(resolve));
  });
  return {
    release: () => {
      for (const resolve of resolvers.splice(0)) {
        resolve(true);
      }
    },
    dispose: disposable.dispose,
  };
}

describe("TerminalReplayGate", () => {
  it("lets a live query queued before the replay reply, and drops the replayed one", async () => {
    const { terminal, gate, pty, dropped, parse, topLine } = setup();

    terminal.write("\x1b[6n"); // queued live CPR, parses before the barrier
    let completed = false;
    gate.begin("historical\x1b[6n", { complete: () => (completed = true) });
    await parse("");

    expect(pty).toHaveLength(1); // the live CPR reply
    expect(dropped).toHaveLength(1); // the replayed CPR
    expect(escReply(/^\[\d+;\d+R$/)(dropped[0] ?? "")).toBe(true);
    expect(completed).toBe(true);
    expect(topLine()).toBe("historical"); // replay displayed
  });

  it.each(REPLY_FAMILIES)(
    "answers $name live but never lets the replayed reply reach the PTY",
    async ({ bytes, replyPattern }) => {
      // Live baseline: the family really replies and is forwarded.
      const live = setup();
      live.terminal.write(bytes);
      await live.parse("");
      expect(
        live.pty.some((d) => replyPattern(d)),
        `${bytes} live reply`,
      ).toBe(true);
      live.terminal.dispose();

      // Replay: the reply is generated but dropped; the text still displays.
      const { gate, pty, dropped, parse, topLine } = setup();
      gate.begin(`frame${bytes}`, { complete: () => {} });
      await parse("");
      expect(
        dropped.some((d) => replyPattern(d)),
        `${bytes} dropped reply`,
      ).toBe(true);
      expect(pty, `${bytes} pty stays clean`).toHaveLength(0);
      expect(topLine()).toContain("frame");
      expect(gate.isDroppingReplies).toBe(false);
    },
  );

  it("keeps live queries allowed in the same turn the replay completes", async () => {
    const { terminal, gate, pty, dropped } = setup();

    gate.begin("historical", {
      // Buffered live output flushed from complete() may parse within the same
      // write-buffer slice — its query must still be forwarded.
      complete: () => terminal.write("live tail\x1b[6n"),
    });
    await new Promise<void>((resolve) => terminal.write("", resolve));

    expect(dropped).toHaveLength(0);
    expect(pty).toHaveLength(1); // only the same-turn live CPR reply
    expect(escReply(/^\[\d+;\d+R$/)(pty[0] ?? "")).toBe(true);
  });

  it("wipes stale live text queued before the replay via the before-reset", async () => {
    const { terminal, gate, pty, topLine } = setup();

    terminal.write("stale live text\x1b[6n"); // queued, not yet parsed
    gate.begin("replayed", { before: () => terminal.reset(), complete: () => {} });
    await new Promise<void>((resolve) => terminal.write("", resolve));

    // The pre-queued live chunk parsed before the barrier (its reply is live),
    // then before() reset the buffer, then the replay was written.
    expect(pty.filter((d) => d.endsWith("R"))).toHaveLength(1);
    expect(topLine()).toBe("replayed");
  });

  it("never completes a superseded session and wipes its queued replay", async () => {
    const { terminal, gate, dropped, topLine } = setup();
    const completions: string[] = [];
    const pause = armParsePause(terminal);

    gate.begin("AAAA\x1b[Z\x1b[5n", { complete: () => completions.push("A") });
    // Let A's barrier fire; parsing suspends at CSI Z with the DSR unparsed.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    gate.begin("BBBB", { before: () => terminal.reset(), complete: () => completions.push("B") });
    pause.release();
    await new Promise<void>((resolve) => terminal.write("", resolve));
    pause.dispose();

    expect(completions).toEqual(["B"]);
    expect(topLine()).toBe("BBBB"); // A's text wiped by B's before-reset
    expect(dropped).toHaveLength(1); // A's queued DSR was still suppressed
  });

  it("runs the cancel cleanup after a queued replay parses and releases suppression", async () => {
    const { terminal, gate, pty, dropped, topLine } = setup();
    let completed = false;
    const pause = armParsePause(terminal);

    gate.begin("stale replay\x1b[Z\x1b[5n", { complete: () => (completed = true) });
    // Let the barrier fire; parsing suspends at CSI Z, then the PTY resets.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    gate.cancel(() => terminal.reset());
    pause.release();
    await new Promise<void>((resolve) => terminal.write("", resolve));
    pause.dispose();

    expect(completed).toBe(false);
    expect(topLine()).toBe(""); // stale replay text wiped by the cleanup
    expect(dropped).toHaveLength(1); // its DSR never reached the PTY
    expect(gate.isDroppingReplies).toBe(false);

    // Suppression is released: a live query replies normally after the reset.
    terminal.write("\x1b[5n");
    await new Promise<void>((resolve) => terminal.write("", resolve));
    expect(pty).toEqual(["\x1b[0n"]);
  });

  it("ignores a cancel when no session is in flight", async () => {
    const { terminal, gate, topLine } = setup();
    let resetCount = 0;

    gate.cancel(() => (resetCount += 1));
    gate.begin("text", { complete: () => {} });
    await new Promise<void>((resolve) => terminal.write("", resolve));

    expect(resetCount).toBe(0);
    expect(topLine()).toBe("text");
  });

  it("forwards user keystrokes typed during a pending replay", async () => {
    const { terminal, gate, pty, dropped } = setup();

    gate.begin("historical\x1b[5n", { complete: () => {} });
    terminal.input("x"); // keystroke while the replay chunk is queued
    await new Promise<void>((resolve) => terminal.write("", resolve));

    expect(pty).toEqual(["x"]);
    expect(dropped).toEqual(["\x1b[0n"]);
  });

  it("completes an empty replay inside the barrier", async () => {
    const { gate } = setup();
    let completed = false;

    gate.begin("", { complete: () => (completed = true) });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(completed).toBe(true);
  });
});
