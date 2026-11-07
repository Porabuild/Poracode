import { describe, it, expect } from "vitest";
import { extractOscEvents, extractOscEventsFromPtyStream } from "./osc";

describe("extractOscEvents", () => {
  it("returns empty arrays and unchanged data when no OSC sequences present", () => {
    const data = "hello world\x1b[32mgreen text\x1b[0m";
    const result = extractOscEvents(data);
    expect(result.notifications).toEqual([]);
    expect(result.titles).toEqual([]);
    expect(result.cleaned).toBe(data);
  });

  // ── OSC 9 ──────────────────────────────────────────────

  describe("OSC 9 (simple notify)", () => {
    it("extracts OSC 9 with BEL terminator", () => {
      const data = "before\x1b]9;Build complete\x07after";
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]).toEqual({
        code: 9,
        title: "",
        body: "Build complete",
        payload: undefined,
      });
      expect(result.cleaned).toBe("beforeafter");
    });

    it("extracts OSC 9 with ST (ESC \\) terminator", () => {
      const data = "\x1b]9;Done\x1b\\rest";
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.code).toBe(9);
      expect(result.notifications[0]!.body).toBe("Done");
      expect(result.cleaned).toBe("rest");
    });

    it("parses JSON body in OSC 9", () => {
      const json = '{"event":"stop","agent":"claude"}';
      const data = `\x1b]9;${json}\x07`;
      const result = extractOscEvents(data);
      expect(result.notifications[0]!.payload).toEqual({
        event: "stop",
        agent: "claude",
      });
    });
  });

  // ── OSC 777 ────────────────────────────────────────────

  describe("OSC 777 (RXVT notify)", () => {
    it("extracts OSC 777 with title and body", () => {
      const data = "\x1b]777;notify;Claude Code;Session complete\x07";
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]).toEqual({
        code: 777,
        title: "Claude Code",
        body: "Session complete",
        payload: undefined,
      });
      expect(result.cleaned).toBe("");
    });

    it("extracts OSC 777 with JSON body", () => {
      const json = '{"event":"idle_prompt","agent":"claude","v":1}';
      const data = `prefix\x1b]777;notify;warp://cli-agent;${json}\x07suffix`;
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.title).toBe("warp://cli-agent");
      expect(result.notifications[0]!.payload).toEqual({
        event: "idle_prompt",
        agent: "claude",
        v: 1,
      });
      expect(result.cleaned).toBe("prefixsuffix");
    });

    it("extracts OSC 777 with ST terminator", () => {
      const data = "\x1b]777;notify;Title;Body\x1b\\";
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.code).toBe(777);
      expect(result.notifications[0]!.title).toBe("Title");
      expect(result.notifications[0]!.body).toBe("Body");
    });

    it("handles empty body in OSC 777", () => {
      const data = "\x1b]777;notify;Alert;\x07";
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.body).toBe("");
    });
  });

  // ── OSC 99 ─────────────────────────────────────────────

  describe("OSC 99 (Kitty notify)", () => {
    it("extracts title payload", () => {
      const data = "\x1b]99;i=1;e=1;d=0;p=title:Build Complete\x1b\\";
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]).toEqual({
        code: 99,
        title: "Build Complete",
        body: "",
        payload: undefined,
      });
    });

    it("extracts body payload", () => {
      const data = "\x1b]99;i=1;d=1;p=body:All tests passed\x07";
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.title).toBe("");
      expect(result.notifications[0]!.body).toBe("All tests passed");
    });

    it("handles subtitle as body", () => {
      const data = "\x1b]99;i=1;p=subtitle:Project X\x07";
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.body).toBe("Project X");
    });
  });

  // ── OSC 0 / 1 / 2 — window/icon title ─────────────────

  describe("OSC 0/1/2 (window/icon title)", () => {
    it("extracts OSC 0 title with BEL terminator", () => {
      const data = "before\x1b]0;My Window Title\x07after";
      const result = extractOscEvents(data);
      expect(result.titles).toEqual([{ code: 0, text: "My Window Title" }]);
      expect(result.notifications).toEqual([]);
      expect(result.cleaned).toBe("beforeafter");
    });

    it("extracts OSC 2 title with ST terminator", () => {
      const data = "\x1b]2;Pure window title\x1b\\";
      const result = extractOscEvents(data);
      expect(result.titles).toEqual([{ code: 2, text: "Pure window title" }]);
      expect(result.cleaned).toBe("");
    });

    it("extracts OSC 1 icon name", () => {
      const data = "\x1b]1;IconName\x07";
      const result = extractOscEvents(data);
      expect(result.titles).toEqual([{ code: 1, text: "IconName" }]);
    });

    it("extracts Claude-style braille-spinner title", () => {
      const data = "\x1b]0;⠂ Add jump to bottom button\x07";
      const result = extractOscEvents(data);
      expect(result.titles).toHaveLength(1);
      expect(result.titles[0]!.text).toBe("⠂ Add jump to bottom button");
    });

    it("extracts multiple titles from one chunk", () => {
      const data = "\x1b]0;first\x07middle\x1b]0;second\x07";
      const result = extractOscEvents(data);
      expect(result.titles.map((t) => t.text)).toEqual(["first", "second"]);
      expect(result.cleaned).toBe("middle");
    });

    it("does NOT match OSC 7 (cwd) as a title", () => {
      const data = "\x1b]7;file:///home\x07";
      const result = extractOscEvents(data);
      expect(result.titles).toEqual([]);
      expect(result.notifications).toEqual([]);
      expect(result.cleaned).toBe(data);
    });

    it("does NOT match unrelated multi-digit codes 11 / 1337 as titles", () => {
      const data = "\x1b]11;rgb:ff/ff/ff\x07\x1b]1337;something\x07";
      const result = extractOscEvents(data);
      expect(result.titles).toEqual([]);
      expect(result.cleaned).toBe(data);
    });
  });

  // ── OSC 633 (VS Code shell integration) ──────────────

  describe("OSC 633 (VS Code shell integration)", () => {
    it("extracts marker A (prompt-start) with BEL terminator", () => {
      const data = "before\x1b]633;A\x07after";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 633, kind: "prompt-start" }]);
      expect(result.notifications).toEqual([]);
      expect(result.titles).toEqual([]);
      expect(result.cleaned).toBe("beforeafter");
    });

    it("extracts marker B (prompt-end) with ST terminator", () => {
      const data = "\x1b]633;B\x1b\\rest";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 633, kind: "prompt-end" }]);
      expect(result.cleaned).toBe("rest");
    });

    it("extracts marker C (command-pre-exec)", () => {
      const data = "\x1b]633;C\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 633, kind: "command-pre-exec" }]);
    });

    it("extracts marker D with exit code 0", () => {
      const data = "\x1b]633;D;0\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 633, kind: "command-finished", exitCode: 0 }]);
    });

    it("extracts marker D with non-zero exit code", () => {
      const data = "\x1b]633;D;137\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 633, kind: "command-finished", exitCode: 137 }]);
    });

    it("extracts marker D without exit code", () => {
      const data = "\x1b]633;D\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 633, kind: "command-finished", exitCode: undefined }]);
    });

    it("treats non-numeric exit code as undefined", () => {
      const data = "\x1b]633;D;abc\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 633, kind: "command-finished", exitCode: undefined }]);
    });

    it("extracts marker E with command line and no nonce", () => {
      const data = "\x1b]633;E;echo hello\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([
        { code: 633, kind: "command-line", command: "echo hello", nonce: undefined },
      ]);
    });

    it("extracts marker E with command line and nonce", () => {
      const data = "\x1b]633;E;echo hello;abc123\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([
        { code: 633, kind: "command-line", command: "echo hello", nonce: "abc123" },
      ]);
    });

    it("decodes \\\\ to literal backslash in command line", () => {
      // Input bytes: OSC 633 ; E ; echo \\ BEL
      const data = "\x1b]633;E;echo \\\\\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([
        { code: 633, kind: "command-line", command: "echo \\", nonce: undefined },
      ]);
    });

    it("decodes \\xNN hex escapes in command line (e.g. \\x3b → ;)", () => {
      // Input represents: echo a;b — with the inner ; encoded as \x3b so it
      // doesn't terminate the command argument.
      const data = "\x1b]633;E;echo a\\x3bb\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([
        { code: 633, kind: "command-line", command: "echo a;b", nonce: undefined },
      ]);
    });

    it("extracts marker P with Cwd property", () => {
      const data = "\x1b]633;P;Cwd=/home/user/project\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([
        { code: 633, kind: "property", key: "Cwd", value: "/home/user/project" },
      ]);
    });

    it("decodes \\xNN escapes in property value", () => {
      // Cwd containing an encoded space (\x20).
      const data = "\x1b]633;P;Cwd=/path/with\\x20space\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([
        { code: 633, kind: "property", key: "Cwd", value: "/path/with space" },
      ]);
    });

    it("ignores unknown markers", () => {
      const data = "before\x1b]633;Z;ignored\x07after";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([]);
      // Sequence is still consumed (cleaned).
      expect(result.cleaned).toBe("beforeafter");
    });

    it("ignores malformed body with no marker", () => {
      const data = "before\x1b]633;\x07after";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([]);
      expect(result.cleaned).toBe("beforeafter");
    });

    it("ignores marker P without `=` separator", () => {
      const data = "\x1b]633;P;NoEqualsHere\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([]);
    });

    it("does NOT match unrelated codes 633x / 6330", () => {
      const data = "\x1b]6330;A\x07\x1b]633A;A\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([]);
      expect(result.cleaned).toBe(data);
    });

    it("reconstructs OSC 633 split across two PTY chunks", () => {
      const a = "before\x1b]633;D";
      const b = ";0\x07after";
      const r1 = extractOscEventsFromPtyStream("", a);
      expect(r1.shell).toEqual([]);
      expect(r1.carryOut.startsWith("\x1b]633;")).toBe(true);
      const r2 = extractOscEventsFromPtyStream(r1.carryOut, b);
      expect(r2.shell).toEqual([{ code: 633, kind: "command-finished", exitCode: 0 }]);
      expect(r1.cleaned + r2.cleaned).toBe("beforeafter");
    });

    it("interleaves OSC 633 events with OSC 9 notifications and titles", () => {
      const data =
        "\x1b]0;Window\x07" +
        "\x1b]633;A\x07" +
        "\x1b]633;E;ls\x07" +
        "\x1b]633;C\x07" +
        "\x1b]9;ping\x07" +
        "\x1b]633;D;0\x07";
      const result = extractOscEvents(data);
      expect(result.titles).toEqual([{ code: 0, text: "Window" }]);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.body).toBe("ping");
      expect(result.shell).toEqual([
        { code: 633, kind: "prompt-start" },
        { code: 633, kind: "command-line", command: "ls", nonce: undefined },
        { code: 633, kind: "command-pre-exec" },
        { code: 633, kind: "command-finished", exitCode: 0 },
      ]);
      expect(result.cleaned).toBe("");
    });
  });

  // ── OSC 133 (FinalTerm/iTerm2 shell integration) ─────

  describe("OSC 133 (FinalTerm/iTerm2 shell integration)", () => {
    it("extracts marker A (prompt-start)", () => {
      const data = "before\x1b]133;A\x07after";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 133, kind: "prompt-start" }]);
      expect(result.cleaned).toBe("beforeafter");
    });

    it("extracts marker B (prompt-end) with ST terminator", () => {
      const data = "\x1b]133;B\x1b\\rest";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 133, kind: "prompt-end" }]);
      expect(result.cleaned).toBe("rest");
    });

    it("extracts marker C (command-pre-exec) — Copilot turn-start signal", () => {
      const data = "\x1b]133;C\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 133, kind: "command-pre-exec" }]);
    });

    it("extracts marker D with exit code", () => {
      const data = "\x1b]133;D;0\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 133, kind: "command-finished", exitCode: 0 }]);
    });

    it("extracts marker D without exit code — Copilot turn-end signal", () => {
      const data = "\x1b]133;D\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([{ code: 133, kind: "command-finished", exitCode: undefined }]);
    });

    it("ignores unknown markers (E/P are 633-only)", () => {
      const data = "\x1b]133;E;echo\x07\x1b]133;P;Cwd=/tmp\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([]);
      expect(result.cleaned).toBe("");
    });

    it("does NOT match unrelated codes 1330 / 13", () => {
      const data = "\x1b]1330;A\x07\x1b]13;A\x07";
      const result = extractOscEvents(data);
      expect(result.shell).toEqual([]);
      expect(result.cleaned).toBe(data);
    });

    it("reconstructs OSC 133 split across two PTY chunks", () => {
      const a = "before\x1b]133;D";
      const b = "\x07after";
      const r1 = extractOscEventsFromPtyStream("", a);
      expect(r1.shell).toEqual([]);
      expect(r1.carryOut.startsWith("\x1b]133;")).toBe(true);
      const r2 = extractOscEventsFromPtyStream(r1.carryOut, b);
      expect(r2.shell).toEqual([{ code: 133, kind: "command-finished", exitCode: undefined }]);
      expect(r1.cleaned + r2.cleaned).toBe("beforeafter");
    });

    it("coexists with OSC 9 progress and OSC 0 titles in a real Copilot turn", () => {
      // Approximation of what a Copilot turn looks like on the wire.
      const data =
        "\x1b]0;GitHub Copilot\x07" +
        "\x1b]133;C\x07" +
        "\x1b]9;4;3;0\x07" +
        "\x1b]9;4;0;0\x07" +
        "\x1b]133;D\x07";
      const result = extractOscEvents(data);
      expect(result.titles).toEqual([{ code: 0, text: "GitHub Copilot" }]);
      expect(result.notifications.map((n) => n.body)).toEqual(["4;3;0", "4;0;0"]);
      expect(result.shell).toEqual([
        { code: 133, kind: "command-pre-exec" },
        { code: 133, kind: "command-finished", exitCode: undefined },
      ]);
      expect(result.cleaned).toBe("");
    });
  });

  // ── OSC 7501 (Program Status Protocol) ────────────────

  describe("OSC 7501 (Program Status Protocol)", () => {
    it("extracts each known state", () => {
      const states = ["idle", "working", "blocked", "done", "error", "clear"] as const;
      for (const state of states) {
        const result = extractOscEvents(`\x1b]7501;state=${state}:app=demo\x1b\\`);
        expect(result.programStatus).toEqual([{ code: 7501, state, kind: undefined, app: "demo" }]);
        expect(result.cleaned).toBe("");
      }
    });

    it("extracts blocked with permission kind and ignores the message field", () => {
      const data =
        "\x1b]7501;state=blocked:kind=permission:app=demo:msg=UnVuIG5wbSB0ZXN0Pw==\x1b\\";
      const result = extractOscEvents(data);
      expect(result.programStatus).toEqual([
        {
          code: 7501,
          state: "blocked",
          kind: "permission",
          app: "demo",
        },
      ]);
      expect(result.cleaned).toBe("");
    });

    it("extracts blocked with question kind", () => {
      const data = "\x1b]7501;state=blocked:kind=question:app=demo\x07";
      const result = extractOscEvents(data);
      expect(result.programStatus).toEqual([
        {
          code: 7501,
          state: "blocked",
          kind: "question",
          app: "demo",
        },
      ]);
      expect(result.cleaned).toBe("");
    });

    it("accepts a BEL terminator", () => {
      const data = "before\x1b]7501;state=working:app=demo\x07after";
      const result = extractOscEvents(data);
      expect(result.programStatus).toHaveLength(1);
      expect(result.programStatus[0]!.state).toBe("working");
      expect(result.cleaned).toBe("beforeafter");
    });

    it("ignores an unknown state but still removes the sequence", () => {
      const data = "before\x1b]7501;state=sleeping:app=demo\x07after";
      const result = extractOscEvents(data);
      expect(result.programStatus).toEqual([]);
      expect(result.cleaned).toBe("beforeafter");
    });

    it("ignores unknown extra keys", () => {
      const data = "\x1b]7501;state=done:app=demo:extra=ignored:another=1\x1b\\";
      const result = extractOscEvents(data);
      expect(result.programStatus).toEqual([
        { code: 7501, state: "done", kind: undefined, app: "demo" },
      ]);
    });

    it("reconstructs OSC 7501 split across two PTY chunks", () => {
      const a = "before\x1b]7501;state=working:app=demo";
      const b = "\x1b\\after";
      const r1 = extractOscEventsFromPtyStream("", a);
      expect(r1.programStatus).toEqual([]);
      expect(r1.carryOut.startsWith("\x1b]7501;")).toBe(true);
      const r2 = extractOscEventsFromPtyStream(r1.carryOut, b);
      expect(r2.programStatus).toEqual([
        { code: 7501, state: "working", kind: undefined, app: "demo" },
      ]);
      expect(r1.cleaned + r2.cleaned).toBe("beforeafter");
    });
  });

  // ── Multiple notifications ────────────────────────────

  describe("multiple notifications", () => {
    it("extracts multiple OSC sequences from a single data chunk", () => {
      const data = "line1\x1b]777;notify;A;First\x07line2\x1b]9;Second\x07line3";
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(2);
      expect(result.notifications[0]!.code).toBe(777);
      expect(result.notifications[0]!.body).toBe("First");
      expect(result.notifications[1]!.code).toBe(9);
      expect(result.notifications[1]!.body).toBe("Second");
      expect(result.cleaned).toBe("line1line2line3");
    });

    it("interleaves titles and notifications", () => {
      const data = "\x1b]0;Title A\x07mid\x1b]9;Notify\x07\x1b]0;Title B\x07";
      const result = extractOscEvents(data);
      expect(result.titles.map((t) => t.text)).toEqual(["Title A", "Title B"]);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.body).toBe("Notify");
      expect(result.cleaned).toBe("mid");
    });
  });

  // ── Edge cases ────────────────────────────────────────

  describe("edge cases", () => {
    it("handles malformed JSON body gracefully", () => {
      const data = "\x1b]777;notify;Title;{broken json\x07";
      const result = extractOscEvents(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.body).toBe("{broken json");
      expect(result.notifications[0]!.payload).toBeUndefined();
    });

    it("handles empty data", () => {
      const result = extractOscEvents("");
      expect(result.notifications).toEqual([]);
      expect(result.titles).toEqual([]);
      expect(result.cleaned).toBe("");
    });

    it("reconstructs OSC 9 split across two PTY chunks (carry buffer)", () => {
      const a = "before\x1b]9;agent-tur";
      const b = "n-complete\x07after";
      const r1 = extractOscEventsFromPtyStream("", a);
      expect(r1.notifications).toEqual([]);
      expect(r1.carryOut.startsWith("\x1b]9;")).toBe(true);
      const r2 = extractOscEventsFromPtyStream(r1.carryOut, b);
      expect(r2.notifications).toHaveLength(1);
      expect(r2.notifications[0]!.code).toBe(9);
      expect(r2.notifications[0]!.body).toBe("agent-turn-complete");
      expect(r1.cleaned + r2.cleaned).toBe("beforeafter");
    });

    it("reconstructs OSC 0 title split across two PTY chunks", () => {
      const a = "before\x1b]0;⠂ Add jump to";
      const b = " bottom\x07after";
      const r1 = extractOscEventsFromPtyStream("", a);
      expect(r1.titles).toEqual([]);
      expect(r1.carryOut.startsWith("\x1b]0;")).toBe(true);
      const r2 = extractOscEventsFromPtyStream(r1.carryOut, b);
      expect(r2.titles).toHaveLength(1);
      expect(r2.titles[0]!.text).toBe("⠂ Add jump to bottom");
      expect(r1.cleaned + r2.cleaned).toBe("beforeafter");
    });

    it("does not parse JSON arrays as payload", () => {
      const data = "\x1b]777;notify;T;[1,2,3]\x07";
      const result = extractOscEvents(data);
      expect(result.notifications[0]!.payload).toBeUndefined();
    });
  });
});
