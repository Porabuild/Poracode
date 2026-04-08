import { describe, it, expect } from "vitest";
import { extractOscNotifications } from "./osc";

describe("extractOscNotifications", () => {
  it("returns empty notifications and unchanged data when no OSC sequences present", () => {
    const data = "hello world\x1b[32mgreen text\x1b[0m";
    const result = extractOscNotifications(data);
    expect(result.notifications).toEqual([]);
    expect(result.cleaned).toBe(data);
  });

  // ── OSC 9 ──────────────────────────────────────────────

  describe("OSC 9 (simple notify)", () => {
    it("extracts OSC 9 with BEL terminator", () => {
      const data = "before\x1b]9;Build complete\x07after";
      const result = extractOscNotifications(data);
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
      const result = extractOscNotifications(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.code).toBe(9);
      expect(result.notifications[0]!.body).toBe("Done");
      expect(result.cleaned).toBe("rest");
    });

    it("parses JSON body in OSC 9", () => {
      const json = '{"event":"stop","agent":"claude"}';
      const data = `\x1b]9;${json}\x07`;
      const result = extractOscNotifications(data);
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
      const result = extractOscNotifications(data);
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
      const result = extractOscNotifications(data);
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
      const result = extractOscNotifications(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.code).toBe(777);
      expect(result.notifications[0]!.title).toBe("Title");
      expect(result.notifications[0]!.body).toBe("Body");
    });

    it("handles empty body in OSC 777", () => {
      const data = "\x1b]777;notify;Alert;\x07";
      const result = extractOscNotifications(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.body).toBe("");
    });
  });

  // ── OSC 99 ─────────────────────────────────────────────

  describe("OSC 99 (Kitty notify)", () => {
    it("extracts title payload", () => {
      const data = "\x1b]99;i=1;e=1;d=0;p=title:Build Complete\x1b\\";
      const result = extractOscNotifications(data);
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
      const result = extractOscNotifications(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.title).toBe("");
      expect(result.notifications[0]!.body).toBe("All tests passed");
    });

    it("handles subtitle as body", () => {
      const data = "\x1b]99;i=1;p=subtitle:Project X\x07";
      const result = extractOscNotifications(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.body).toBe("Project X");
    });
  });

  // ── Multiple notifications ────────────────────────────

  describe("multiple notifications", () => {
    it("extracts multiple OSC sequences from a single data chunk", () => {
      const data = "line1\x1b]777;notify;A;First\x07" + "line2\x1b]9;Second\x07" + "line3";
      const result = extractOscNotifications(data);
      expect(result.notifications).toHaveLength(2);
      expect(result.notifications[0]!.code).toBe(777);
      expect(result.notifications[0]!.body).toBe("First");
      expect(result.notifications[1]!.code).toBe(9);
      expect(result.notifications[1]!.body).toBe("Second");
      expect(result.cleaned).toBe("line1line2line3");
    });
  });

  // ── Edge cases ────────────────────────────────────────

  describe("edge cases", () => {
    it("does not match non-notification OSC sequences", () => {
      // OSC 0 (set title), OSC 7 (cwd), OSC 133 (prompt marking)
      const data = "\x1b]0;My Title\x07\x1b]7;file:///home\x07\x1b]133;A\x07";
      const result = extractOscNotifications(data);
      expect(result.notifications).toEqual([]);
      expect(result.cleaned).toBe(data);
    });

    it("handles malformed JSON body gracefully", () => {
      const data = "\x1b]777;notify;Title;{broken json\x07";
      const result = extractOscNotifications(data);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]!.body).toBe("{broken json");
      expect(result.notifications[0]!.payload).toBeUndefined();
    });

    it("handles empty data", () => {
      const result = extractOscNotifications("");
      expect(result.notifications).toEqual([]);
      expect(result.cleaned).toBe("");
    });

    it("does not parse JSON arrays as payload", () => {
      const data = "\x1b]777;notify;T;[1,2,3]\x07";
      const result = extractOscNotifications(data);
      expect(result.notifications[0]!.payload).toBeUndefined();
    });
  });
});
