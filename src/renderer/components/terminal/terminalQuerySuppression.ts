import type { Terminal } from "@xterm/xterm";

/**
 * Reply-scope marking for historical transcript replay.
 *
 * xterm answers device queries through onData the moment it parses them, so
 * replaying a historical transcript into a fresh terminal emits stale replies
 * that would be forwarded to the live PTY. The handlers installed here run
 * ahead of the built-ins (the parser dispatches last-registered-first) and,
 * while a replay is being parsed, mark a synchronous "reply scope" and pass
 * through: built-ins keep running, so the state half of every sequence still
 * applies — including mixed families like `OSC 4;0;#ff0000;1;?` (color 0 is
 * set, color 1 is reported). The report half is dropped by the surface's
 * onData listener while the scope is pending.
 *
 * The scope is synchronous by construction: built-ins fire onData inside the
 * dispatch, and the scope clears on the next microtask — before any event-loop
 * macrotask can run. User keyboard input and paste are delivered from their
 * own macrotasks (never during parsing), so ordinary input can never land
 * inside a scope, and live queries queued ahead of a replay drain before the
 * replay chunk even enters the write buffer.
 *
 * Sequence families whose built-in chain can emit onData in the installed
 * xterm stack (@xterm/xterm 6.1.0-beta.303 InputHandler/CoreBrowserTerminal
 * plus the ImageAddon and ClipboardAddon this surface loads):
 *
 * | Family        | Sequence                 | Reply                        | Emitted by |
 * |---------------|--------------------------|------------------------------|------------|
 * | DA1           | `CSI c` / `CSI 0 c`      | `CSI ?1;2c` / `CSI ?6c` / `CSI ?62;4;9;22c` (sixel) | core / ImageAddon |
 * | DA2           | `CSI > c`                | `CSI >0;276;0c`              | core |
 * | DA3           | `CSI = c`                | none today; kept for parity  | core (forward-compat) |
 * | XTVERSION     | `CSI > q`                | `DCS >\|xterm.js(v) ST`      | core |
 * | DSR           | `CSI 5 n` / `CSI 6 n`    | `CSI 0n` / `CSI r;cR`        | core |
 * | DECDSR        | `CSI ? 6 n` / `CSI ? 996 n` | `CSI ?r;cR` / `CSI ?997;mn` | core |
 * | DECSET 1004   | `CSI ? 1004 h`           | `CSI I`/`CSI O` when focused — state-setting with a synchronous reply (`onRequestSendFocus`) | core |
 * | DECRQM        | `CSI [?] Ps $ p`         | `CSI {?}m;v$y`               | core |
 * | Kitty kbd     | `CSI ? u`                | `CSI ?flags u`               | core |
 * | XTSMGRAPHICS  | `CSI ? Pi;Pa S`          | `CSI ?Pi;status;valueS` (SET variants also apply palette-limit state and are preserved) | ImageAddon |
 * | XTWINOPS      | `CSI 14/16/18 t`         | `CSI 4/6/8;h;wt` — 22/23 (title push/pop) are state and preserved | core (ImageAddon enables the reports) |
 * | DECRQSS       | `DCS $ q Pt ST`          | `DCS P1$rPt ST`              | core |
 * | Color report  | `OSC 4/10/11/12 ; …; ?`  | `OSC n;rgb:…ST` — SET slots are state and preserved | core |
 * | Clipboard     | `OSC 52 ; Pc ; Pd`       | read: `OSC 52;Pc;base64 ST`; write: external action | ClipboardAddon |
 *
 * `CSI ? l` is marked alongside `? h` for symmetry; DECRST 1004 does not
 * report today.
 *
 * OSC 52 is the one family swallowed whole during replay (`true`): the
 * ClipboardAddon answers reads asynchronously — after the synchronous scope
 * has cleared, so it cannot be scoped — and a historical clipboard write is an
 * external action, not rendered terminal state, and must not overwrite the
 * user's clipboard. Live OSC 52 is untouched.
 */

export interface QueryReplySuppression {
  dispose(): void;
  /** True while the parser is inside a marked sequence family during replay. */
  hasPendingReplyScope(): boolean;
}

/**
 * Register parser handlers that mark reply scopes while `isReplaying()`
 * returns true. Must be installed after every addon that registers its own
 * parser handlers (ImageAddon answers DA1/XTSMGRAPHICS, ClipboardAddon answers
 * OSC 52) so these dispatch first.
 */
export function installQueryReplySuppression(
  terminal: Terminal,
  isReplaying: () => boolean,
): QueryReplySuppression {
  let replyScope = false;
  let clearScheduled = false;
  const markReplyScope = () => {
    replyScope = true;
    if (clearScheduled) {
      return;
    }
    clearScheduled = true;
    queueMicrotask(() => {
      replyScope = false;
      clearScheduled = false;
    });
  };
  // Pass through so built-ins apply their state; their reply emissions are
  // dropped at onData while the scope is pending.
  const markAndPassThrough = () => {
    if (isReplaying()) {
      markReplyScope();
    }
    return false;
  };
  const swallowDuringReplay = () => isReplaying();

  const disposables = [
    terminal.parser.registerCsiHandler({ final: "c" }, markAndPassThrough),
    terminal.parser.registerCsiHandler({ prefix: ">", final: "c" }, markAndPassThrough),
    terminal.parser.registerCsiHandler({ prefix: "=", final: "c" }, markAndPassThrough),
    terminal.parser.registerCsiHandler({ prefix: ">", final: "q" }, markAndPassThrough),
    terminal.parser.registerCsiHandler({ final: "n" }, markAndPassThrough),
    terminal.parser.registerCsiHandler({ prefix: "?", final: "n" }, markAndPassThrough),
    terminal.parser.registerCsiHandler({ prefix: "?", final: "S" }, markAndPassThrough),
    terminal.parser.registerCsiHandler({ intermediates: "$", final: "p" }, markAndPassThrough),
    terminal.parser.registerCsiHandler(
      { prefix: "?", intermediates: "$", final: "p" },
      markAndPassThrough,
    ),
    terminal.parser.registerCsiHandler({ prefix: "?", final: "u" }, markAndPassThrough),
    terminal.parser.registerCsiHandler({ prefix: "?", final: "h" }, markAndPassThrough),
    terminal.parser.registerCsiHandler({ prefix: "?", final: "l" }, markAndPassThrough),
    terminal.parser.registerCsiHandler({ final: "t" }, markAndPassThrough),
    terminal.parser.registerDcsHandler({ intermediates: "$", final: "q" }, markAndPassThrough),
    terminal.parser.registerOscHandler(4, markAndPassThrough),
    terminal.parser.registerOscHandler(10, markAndPassThrough),
    terminal.parser.registerOscHandler(11, markAndPassThrough),
    terminal.parser.registerOscHandler(12, markAndPassThrough),
    terminal.parser.registerOscHandler(52, swallowDuringReplay),
  ];

  return {
    dispose() {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
    hasPendingReplyScope: () => replyScope,
  };
}
