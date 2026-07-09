import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { transformCursorAcpSessionUpdate } from "./acpTransform";

function toolCallUpdate(overrides: Record<string, unknown>): SessionNotification {
  return {
    sessionId: "ses-1",
    update: {
      sessionUpdate: "tool_call_update",
      toolCallId: "tc-1",
      ...overrides,
    },
  } as unknown as SessionNotification;
}

function toolCall(overrides: Record<string, unknown>): SessionNotification {
  return {
    sessionId: "ses-1",
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "tc-1",
      status: "pending",
      ...overrides,
    },
  } as unknown as SessionNotification;
}

describe("transformCursorAcpSessionUpdate", () => {
  it("leaves non-tool notifications untouched", () => {
    const input = {
      sessionId: "ses-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hi" },
      },
    } as unknown as SessionNotification;
    expect(transformCursorAcpSessionUpdate(input)).toBe(input);
  });

  it("leaves tool_call_update without rawOutput untouched", () => {
    const input = toolCallUpdate({ status: "in_progress" });
    expect(transformCursorAcpSessionUpdate(input)).toBe(input);
  });

  it("unwraps Cursor `read` output `{content: …}` to a plain string", () => {
    const input = toolCallUpdate({
      kind: "read",
      status: "completed",
      rawOutput: { content: 'import { isWindows } from "@/renderer/bridge";\n' },
    });
    const out = transformCursorAcpSessionUpdate(input);
    expect((out.update as { rawOutput?: unknown }).rawOutput).toBe(
      'import { isWindows } from "@/renderer/bridge";\n',
    );
  });

  it("unwraps Cursor `execute` output into stdout/stderr/exit summary", () => {
    const input = toolCallUpdate({
      kind: "execute",
      status: "completed",
      rawOutput: { stdout: "On branch master\n", stderr: "", exitCode: 0 },
    });
    expect(
      (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput,
    ).toBe("On branch master\n");
  });

  it("appends [exit N] and stderr block for non-zero `execute` exits", () => {
    const input = toolCallUpdate({
      kind: "execute",
      status: "completed",
      rawOutput: { stdout: "out", stderr: "boom", exitCode: 2 },
    });
    expect(
      (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput,
    ).toBe("out\n[exit 2]\n[stderr]\nboom");
  });

  it("falls back to `(no output)` when execute returns empty stdout/stderr and exit 0", () => {
    const input = toolCallUpdate({
      kind: "execute",
      status: "completed",
      rawOutput: { stdout: "", stderr: "", exitCode: 0 },
    });
    expect(
      (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput,
    ).toBe("(no output)");
  });

  it("formats search match list as `path:line: snippet` lines", () => {
    const input = toolCallUpdate({
      kind: "search",
      status: "completed",
      rawOutput: {
        totalMatches: 2,
        truncated: false,
        matches: [
          { path: "main.ts", line: 1, content: 'import { isWindows } from "..."' },
          { path: "helper.ts", line: 3, content: "export function isWindows()" },
        ],
      },
    });
    expect(
      (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput,
    ).toBe('main.ts:1: import { isWindows } from "..."\nhelper.ts:3: export function isWindows()');
  });

  it("annotates a truncated match list with `[…N total, truncated]`", () => {
    const input = toolCallUpdate({
      kind: "search",
      status: "completed",
      rawOutput: {
        totalMatches: 46,
        truncated: true,
        matches: [{ path: "a.ts", line: 1, content: "x" }],
      },
    });
    expect(
      (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput,
    ).toBe("a.ts:1: x\n[…46 total, truncated]");
  });

  it("formats search file list when only `files` is populated", () => {
    const input = toolCallUpdate({
      kind: "search",
      status: "completed",
      rawOutput: { totalFiles: 2, files: ["main.ts", { path: "helper.ts" }] },
    });
    expect(
      (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput,
    ).toBe("main.ts\nhelper.ts");
  });

  it("falls back to a count summary when no matches/files are present", () => {
    const input = toolCallUpdate({
      kind: "search",
      status: "completed",
      rawOutput: { totalMatches: 46, truncated: false },
    });
    expect(
      (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput,
    ).toBe("46 results");
  });

  it("synthesizes a unified diff from Cursor edit rawOutput oldText/newText/path", () => {
    const input = toolCallUpdate({
      kind: "edit",
      status: "completed",
      rawOutput: {
        path: "styles.css",
        oldText: ".body { color: red; }",
        newText: ".body { color: blue; }",
      },
    });
    const rawOutput = (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown })
      .rawOutput;
    expect(typeof rawOutput).toBe("string");
    expect(rawOutput).toContain("diff --git a/styles.css b/styles.css");
    expect(rawOutput).toContain("-.body { color: red; }");
    expect(rawOutput).toContain("+.body { color: blue; }");
  });

  it("passes a Cursor edit `diff` string through as rawOutput so the renderer treats it as a diff", () => {
    const diff = [
      "diff --git a/styles.css b/styles.css",
      "--- a/styles.css",
      "+++ b/styles.css",
      "@@ -1,1 +1,2 @@",
      "+/* cursor acp test */",
      " .body { color: red; }",
    ].join("\n");
    const input = toolCallUpdate({
      kind: "edit",
      status: "completed",
      rawOutput: { diff },
    });
    expect(
      (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput,
    ).toBe(diff);
  });

  it("surfaces Cursor's `{error: …}` rawOutput as readable text for any tool kind", () => {
    const input = toolCallUpdate({
      kind: "search",
      status: "completed",
      rawOutput: { error: "Hook blocked with message: ..." },
    });
    expect(
      (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput,
    ).toBe("Hook blocked with message: ...");
  });

  it("returns a fresh notification object (does not mutate the input)", () => {
    const input = toolCallUpdate({
      kind: "read",
      status: "completed",
      rawOutput: { content: "abc" },
    });
    const original = JSON.parse(JSON.stringify(input)) as SessionNotification;
    const out = transformCursorAcpSessionUpdate(input);
    expect(out).not.toBe(input);
    expect(input).toEqual(original);
  });

  it("derives a title and kind from `rawInput._toolName` when title/kind are absent", () => {
    const input = toolCall({ rawInput: { _toolName: "read_file", path: "a.ts" } });
    const update = transformCursorAcpSessionUpdate(input).update as {
      title?: unknown;
      kind?: unknown;
    };
    expect(update.title).toBe("Read file");
    expect(update.kind).toBe("read");
  });

  it("maps a `grep` _toolName to the search kind", () => {
    const input = toolCall({ rawInput: { _toolName: "grep" } });
    const update = transformCursorAcpSessionUpdate(input).update as {
      title?: unknown;
      kind?: unknown;
    };
    expect(update.title).toBe("Grep");
    expect(update.kind).toBe("search");
  });

  it("does not overwrite an existing title/kind from _toolName", () => {
    const input = toolCall({
      title: "Reading config",
      kind: "read",
      rawInput: { _toolName: "grep" },
    });
    const update = transformCursorAcpSessionUpdate(input).update as {
      title?: unknown;
      kind?: unknown;
    };
    expect(update.title).toBe("Reading config");
    expect(update.kind).toBe("read");
  });

  it("leaves the notification untouched when there is no _toolName to recover", () => {
    const input = toolCall({ rawInput: {} });
    expect(transformCursorAcpSessionUpdate(input)).toBe(input);
  });

  it("humanizes an unknown _toolName as a title but leaves kind unset", () => {
    const input = toolCall({ rawInput: { _toolName: "fetch_web_page" } });
    const update = transformCursorAcpSessionUpdate(input).update as {
      title?: unknown;
      kind?: unknown;
    };
    expect(update.title).toBe("Fetch web page");
    expect(update.kind).toBeUndefined();
  });

  it("preserves a namespaced MCP _toolName so the renderer can identify the server", () => {
    const input = toolCall({ rawInput: { _toolName: "mcp__github__search_issues" } });
    const update = transformCursorAcpSessionUpdate(input).update as {
      title?: unknown;
      kind?: unknown;
    };
    expect(update.title).toBe("mcp__github__search_issues");
    expect(update.kind).toBeUndefined();
  });

  it("also rewrites rawOutput on a single-shot completed `tool_call`", () => {
    const input = toolCall({
      kind: "execute",
      title: "`git status`",
      rawInput: { command: "git status" },
      status: "completed",
      rawOutput: { stdout: "clean", stderr: "", exitCode: 0 },
    });
    expect(
      (transformCursorAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput,
    ).toBe("clean");
  });
});
