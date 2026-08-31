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

  it("leaves prose that mentions Background Task Update without metadata untouched", () => {
    const text = "Let's discuss the Background Task Update process.";
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

  it("formats Antigravity <SYSTEM_MESSAGE> task notification into styled callout", () => {
    const text = `The following is a <SYSTEM_MESSAGE> not actually sent by the user. It is provided by the system as important information to pay attention to.

<SYSTEM_MESSAGE>
[Message] timestamp=2026-08-31T05:25:34Z sender=73526519-fd6d-4046-bce4-fbff4810f266/task-442 priority=MESSAGE_PRIORITY_HIGH content=Task id "73526519-fd6d-4046-bce4-fbff4810f266/task-442" finished with result:

The command exited with code 0.
Stdout:
Build succeeded.

Stderr:

Log: file:///C:/Users/sdsle/.gemini/antigravity-acp/brain/73526519-fd6d-4046-bce4-fbff4810f266/.system_generated/tasks/task-442.log
</SYSTEM_MESSAGE>`;

    const formatted = formatTaskNotifications(text);
    expect(formatted).toContain(
      "> **Task Notification** — `73526519-fd6d-4046-bce4-fbff4810f266/task-442` (Exit code 0)",
    );
    expect(formatted).toContain("```console\nBuild succeeded.\n```");
    expect(formatted).not.toContain("<SYSTEM_MESSAGE>");
    expect(formatted).not.toContain("not actually sent by the user");
    expect(formatted).not.toContain("Log: file:///");
  });

  it("formats a markdown Background Task Update into a styled callout", () => {
    const text = `# Background Task Update: \`442d457c-fbe7-4201-8f05-53f7c69bb351/task-32\`

The task exited with the following message:
\`\`\`text
RUN  v4.0.18 E:/work/lightcode/...
 ✓ 1 test
\`\`\`

<task_metadata>
task_id: 442d457c-fbe7-4201-8f05-53f7c69bb351/task-32
status: exited
exit_code: 0
</task_metadata>`;

    const formatted = formatTaskNotifications(text);
    expect(formatted).toContain(
      "> **Task Notification** — `442d457c-fbe7-4201-8f05-53f7c69bb351/task-32` (Exit code 0)",
    );
    expect(formatted).toContain("```console\nRUN  v4.0.18 E:/work/lightcode/...\n ✓ 1 test\n```");
    expect(formatted).not.toContain("Background Task Update");
    expect(formatted).not.toContain("<task_metadata>");
  });

  it("formats a cancelled leftover as Failed rather than a synthesized exit code", () => {
    const text = `# Background Task Update: \`t-cancel\`

<task_metadata>
task_id: t-cancel
status: cancelled
</task_metadata>`;
    const formatted = formatTaskNotifications(text);
    expect(formatted).toContain("> **Task Notification** — `t-cancel` (Failed)");
    expect(formatted).not.toContain("Exit code");
    expect(formatted).not.toContain("The task exited");
    expect(formatted).not.toContain("<task_metadata>");
  });

  it("formats an empty leftover as a header-only callout", () => {
    const text = `# Background Task Update: \`t-empty\`

<task_metadata>
task_id: t-empty
status: exited
exit_code: 0
</task_metadata>`;
    const formatted = formatTaskNotifications(text);
    expect(formatted).toBe("> **Task Notification** — `t-empty` (Exit code 0)");
  });

  it("preserves surrounding markdown around a Background Task Update", () => {
    const text = `Before.\n\n# Background Task Update: \`t-1\`

The task exited with the following message:
\`\`\`text
ok
\`\`\`

<task_metadata>
task_id: t-1
status: exited
exit_code: 0
</task_metadata>\n\nAfter.`;
    const formatted = formatTaskNotifications(text);
    expect(formatted.startsWith("Before.")).toBe(true);
    expect(formatted.endsWith("After.")).toBe(true);
    expect(formatted).toContain("> **Task Notification** — `t-1` (Exit code 0)");
    expect(formatted).toContain("```console\nok\n```");
  });

  it("keeps inner fences in leftover Background Task Update output", () => {
    const text = `# Background Task Update: \`t-1\`

The task exited with the following message:
\`\`\`text
Docs:
\`\`\`md
# Title
\`\`\`
\`\`\`

<task_metadata>
task_id: t-1
status: exited
exit_code: 0
</task_metadata>`;
    const formatted = formatTaskNotifications(text);
    expect(formatted).toContain("````console\nDocs:\n```md\n# Title\n```\n````");
    expect(formatted).not.toContain("Background Task Update");
  });

  it("leaves a Background Task Update inside an outer fenced code block untouched", () => {
    const text = `\`\`\`
# Background Task Update: \`t-1\`

The task exited with the following message:
\`\`\`text
ok
\`\`\`

<task_metadata>
task_id: t-1
status: exited
exit_code: 0
</task_metadata>
\`\`\`
After the block.`;
    expect(formatTaskNotifications(text)).toBe(text);
  });
});
// @vitest-environment node
