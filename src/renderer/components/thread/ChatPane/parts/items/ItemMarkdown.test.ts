import { describe, expect, it } from "vitest";
import {
  formatTaskNotifications,
  normalizeGfmTableSeparators,
  normalizeShortCodeFenceClosers,
} from "./ItemMarkdown";

describe("normalizeShortCodeFenceClosers", () => {
  it("treats a two-backtick line as a closer inside a triple-backtick fence", () => {
    expect(
      normalizeShortCodeFenceClosers("before\n\n```text\nwriting is blocked\n``\n\nafter\n"),
    ).toBe("before\n\n```text\nwriting is blocked\n```\n\nafter\n");
  });

  it("leaves two backticks alone outside code fences", () => {
    expect(normalizeShortCodeFenceClosers("before\n``\nafter\n")).toBe("before\n``\nafter\n");
  });
});

describe("normalizeGfmTableSeparators", () => {
  it("expands a short separator to match a wider header", () => {
    const input = "| a | b | c | d |\n|---|---|---|\n| 1 | 2 | 3 | 4 |\n";
    const out = normalizeGfmTableSeparators(input);
    expect(out).toContain("| --- | --- | --- | --- |");
    expect(out.split("\n")[2]).toBe("| 1 | 2 | 3 | 4 |");
  });

  it("truncates a long separator to match a narrower header", () => {
    const input = "| a | b |\n|---|---|---|---|\n| 1 | 2 |\n";
    const out = normalizeGfmTableSeparators(input);
    expect(out).toContain("| --- | --- |");
    expect(out).not.toContain("---|---|---|---");
  });

  it("preserves alignment markers when expanding", () => {
    const input = "| a | b | c | d |\n|:---|---:|:---:|\n| 1 | 2 | 3 | 4 |\n";
    const out = normalizeGfmTableSeparators(input);
    expect(out).toContain("| :--- | ---: | :---: | --- |");
  });

  it("leaves a well-formed table untouched", () => {
    const input = "| a | b |\n|---|---|\n| 1 | 2 |\n";
    expect(normalizeGfmTableSeparators(input)).toBe(input);
  });

  it("does not touch separator-like lines inside a code fence", () => {
    const input = "```\n| a | b | c |\n|---|---|\n```\n";
    expect(normalizeGfmTableSeparators(input)).toBe(input);
  });

  it("preserves CRLF line endings", () => {
    const input = "| a | b | c |\r\n|---|---|\r\n| 1 | 2 | 3 |\r\n";
    const out = normalizeGfmTableSeparators(input);
    expect(out).toContain("| --- | --- | --- |\r\n");
  });

  it("returns text unchanged when a properly closed fence precedes a bare two-backtick line", () => {
    const text = "```js\nconsole.log(1)\n```\n\nProse.\n``\n";
    expect(normalizeShortCodeFenceClosers(text)).toBe(text);
  });
});

describe("formatTaskNotifications", () => {
  it("leaves text without <task_notification> untouched", () => {
    const text = "Normal message without XML tags.";
    expect(formatTaskNotifications(text)).toBe(text);
  });

  it("formats completed Antigravity task notification into styled callout and console block", () => {
    const text = `<task_notification>
Task 1bc6d974-9b4c-41ad-b800-88aa46277fee/task-304 completed with exit code 0.
Output:
 RUN  v4.1.10 E:/work/lightcode/...
 ✓ 109 tests passed
</task_notification>`;

    const formatted = formatTaskNotifications(text);
    expect(formatted).toContain(
      "> **Task Notification** — `1bc6d974-9b4c-41ad-b800-88aa46277fee/task-304` (Exit code 0)",
    );
    expect(formatted).toContain(
      "```console\nRUN  v4.1.10 E:/work/lightcode/...\n ✓ 109 tests passed\n```",
    );
    expect(formatted).not.toContain("<task_notification>");
    expect(formatted).not.toContain("</task_notification>");
  });

  it("formats failed task notification with non-zero exit code", () => {
    const text = `<task_notification>
Task task-99 failed with exit code 1.
Output:
Build failed with error TS2322
</task_notification>`;

    const formatted = formatTaskNotifications(text);
    expect(formatted).toContain("> **Task Notification** — `task-99` (Exit code 1)");
    expect(formatted).toContain("```console\nBuild failed with error TS2322\n```");
  });

  it("preserves surrounding markdown before and after the notification", () => {
    const text = `Before notification.\n\n<task_notification>\nTask t-1 completed with exit code 0.\nOutput:\nok\n</task_notification>\n\nAfter notification.`;
    const formatted = formatTaskNotifications(text);
    expect(formatted.startsWith("Before notification.")).toBe(true);
    expect(formatted.endsWith("After notification.")).toBe(true);
    expect(formatted).toContain("> **Task Notification** — `t-1` (Exit code 0)");
    expect(formatted).toContain("```console\nok\n```");
  });

  it("leaves notifications inside fenced code blocks untouched", () => {
    const text =
      "```\n<task_notification>\nTask t-1 completed with exit code 0.\nOutput:\nok\n</task_notification>\n```\nAfter the block.";
    expect(formatTaskNotifications(text)).toBe(text);
  });

  it("widens the console fence when the output contains backtick fences", () => {
    const text = `<task_notification>
Task t-1 completed with exit code 0.
Output:
Docs:
\`\`\`md
# Title
\`\`\`
</task_notification>`;

    const formatted = formatTaskNotifications(text);
    expect(formatted).toContain("````console\nDocs:\n```md\n# Title\n```\n````");
    expect(formatted).not.toContain("<task_notification>");
  });
});
// @vitest-environment node
