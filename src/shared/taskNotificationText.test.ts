import { describe, expect, it } from "vitest";
import { parseBackgroundTaskUpdateBlock, parseTaskNotificationBody } from "./taskNotificationText";

const MARKDOWN_UPDATE = `# Background Task Update: \`442d457c-fbe7-4201-8f05-53f7c69bb351/task-32\`

The task exited with the following message:
\`\`\`text
RUN  v4.0.18 E:/work/lightcode/.poracode/worktrees/fix-pnpm-global-shims-windows

 ✓ src/supervisor/agents/codex/windowsExecutable.test.ts (1 test) 8ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
\`\`\`

<task_metadata>
task_id: 442d457c-fbe7-4201-8f05-53f7c69bb351/task-32
status: exited
exit_code: 0
</task_metadata>`;

describe("parseTaskNotificationBody", () => {
  it("parses a classic task_notification body", () => {
    const parsed = parseTaskNotificationBody(
      "Task t-1 completed with exit code 0.\nOutput:\nBuild succeeded",
    );
    expect(parsed).toEqual({
      taskId: "t-1",
      exitCode: 0,
      failed: false,
      output: "Build succeeded",
    });
  });
});

describe("parseBackgroundTaskUpdateBlock", () => {
  it("parses Antigravity markdown background task updates with task_metadata", () => {
    const parsed = parseBackgroundTaskUpdateBlock(MARKDOWN_UPDATE);
    expect(parsed.taskId).toBe("442d457c-fbe7-4201-8f05-53f7c69bb351/task-32");
    expect(parsed.exitCode).toBe(0);
    expect(parsed.failed).toBe(false);
    expect(parsed.output).toContain("RUN  v4.0.18");
    expect(parsed.output).toContain("Test Files  1 passed (1)");
    expect(parsed.output).not.toContain("<task_metadata>");
  });

  it("prefers task_metadata over the heading id and maps failed status", () => {
    const parsed = parseBackgroundTaskUpdateBlock(`# Background Task Update: \`heading-id\`

The task exited with the following message:
\`\`\`text
boom
\`\`\`

<task_metadata>
task_id: meta-id
status: failed
exit_code: 2
</task_metadata>`);
    expect(parsed.taskId).toBe("meta-id");
    expect(parsed.exitCode).toBe(2);
    expect(parsed.failed).toBe(true);
    expect(parsed.output).toBe("boom");
  });

  it("derives exit code from success status when exit_code is missing", () => {
    const parsed = parseBackgroundTaskUpdateBlock(`# Background Task Update: \`t-1\`

<task_metadata>
task_id: t-1
status: exited
</task_metadata>`);
    expect(parsed.taskId).toBe("t-1");
    expect(parsed.exitCode).toBe(0);
    expect(parsed.failed).toBe(false);
  });

  it("marks cancelled metadata as failed without synthesizing an exit code", () => {
    const parsed = parseBackgroundTaskUpdateBlock(`# Background Task Update: \`t-1\`

<task_metadata>
task_id: t-1
status: cancelled
</task_metadata>`);
    expect(parsed.taskId).toBe("t-1");
    expect(parsed.exitCode).toBeUndefined();
    expect(parsed.failed).toBe(true);
  });

  it("reads the heading id when metadata is truncated", () => {
    const parsed = parseBackgroundTaskUpdateBlock(`# Background Task Update: \`t-trunc\`

The task exited with the following message:
partial out`);
    expect(parsed.taskId).toBe("t-trunc");
    expect(parsed.output).toBe("partial out");
  });

  it("reads exit_code from unterminated task_metadata at a turn boundary", () => {
    const parsed = parseBackgroundTaskUpdateBlock(`# Background Task Update: \`t-1\`

The task exited with the following message:
\`\`\`text
boom
\`\`\`
<task_metadata>
task_id: t-1
status: failed
exit_code: 2
`);
    expect(parsed.taskId).toBe("t-1");
    expect(parsed.exitCode).toBe(2);
    expect(parsed.failed).toBe(true);
    expect(parsed.output).toBe("boom");
  });

  it("keeps inner markdown fences inside wrapped command output", () => {
    const parsed = parseBackgroundTaskUpdateBlock(`# Background Task Update: \`t-1\`

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
</task_metadata>`);
    expect(parsed.output).toBe("Docs:\n```md\n# Title\n```");
  });

  it("strips an unclosed wrapping fence from truncated output", () => {
    const parsed = parseBackgroundTaskUpdateBlock(`# Background Task Update: \`t-5\`

The task exited with the following message:
\`\`\`text
partial out`);
    expect(parsed.taskId).toBe("t-5");
    expect(parsed.output).toBe("partial out");
  });

  it("keeps a truncated inner fence that is not a wrapping closer", () => {
    const parsed = parseBackgroundTaskUpdateBlock(`# Background Task Update: \`t-5\`

The task exited with the following message:
\`\`\`text
Docs:
\`\`\``);
    expect(parsed.output).toBe("Docs:\n```");
  });

  it("keeps unfenced output that ends with backticks", () => {
    const parsed = parseBackgroundTaskUpdateBlock(`# Background Task Update: \`t-1\`

The task exited with the following message:
use \`\`\` in docs
\`\`\`
<task_metadata>
task_id: t-1
status: exited
exit_code: 0
</task_metadata>`);
    expect(parsed.output).toBe("use ``` in docs\n```");
  });
});
