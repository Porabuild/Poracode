import { describe, expect, it } from "vitest";
import {
  extractBackgroundTaskCompletedBlock,
  findBackgroundTaskCompletedStart,
  looksLikeClassicTaskReport,
  parseBackgroundTaskUpdateBlock,
  parseTaskNotificationBody,
} from "./taskNotificationText";

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
      phase: "finish",
    });
  });

  it("parses a received_message Task finished dump", () => {
    const parsed =
      parseTaskNotificationBody(`Task 286e9bdd-4a17-46e8-92a9-1736a13640e3/task-890 finished with the following output:
The command exited with code 0.
Output:
   Compiling herogpui-components
test result: ok. 43 passed`);
    expect(parsed).toMatchObject({
      taskId: "286e9bdd-4a17-46e8-92a9-1736a13640e3/task-890",
      exitCode: 0,
      failed: false,
      phase: "finish",
    });
    expect(parsed.output).toContain("43 passed");
  });

  it("parses start and progress classic headers", () => {
    expect(parseTaskNotificationBody("Task task-1 started.")).toMatchObject({
      taskId: "task-1",
      phase: "start",
    });
    expect(
      parseTaskNotificationBody(
        "Task task-1 updated with the following output:\nOutput:\ncompiling",
      ),
    ).toMatchObject({
      taskId: "task-1",
      phase: "progress",
      output: "compiling",
    });
  });
});

describe("looksLikeClassicTaskReport", () => {
  it("accepts Task finished/started headers and rejects ordinary prose", () => {
    expect(
      looksLikeClassicTaskReport(
        "Task 286e9bdd-4a17-46e8-92a9-1736a13640e3/task-890 finished with the following output:",
      ),
    ).toBe(true);
    expect(looksLikeClassicTaskReport("Task task-1 started.")).toBe(true);
    expect(looksLikeClassicTaskReport("I mentioned Task the user asked about.")).toBe(false);
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
    expect(parsed.phase).toBe("finish");
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

const COMPLETED_REPORT = `**Background task completed:** cargo test -p herogpui-components (task id: 286e9bdd-4a17-46e8-92a9-1736a13640e3/task-688).
Exit code: 0.
Duration: 13.91 seconds.

Output:
\`\`\`
   Compiling herogpui-components v0.1.0
    Finished \`test\` profile [unoptimized + debuginfo] target(s) in 10.60s
     Running unittests src\\lib.rs

running 43 tests
...........................................
test result: ok. 43 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.08s
\`\`\`
`;

describe("extractBackgroundTaskCompletedBlock", () => {
  it("parses the current Antigravity ACP completed-report format", () => {
    const extracted = extractBackgroundTaskCompletedBlock(COMPLETED_REPORT);
    expect(extracted.complete).toBe(true);
    expect(extracted.parsed).toMatchObject({
      taskId: "286e9bdd-4a17-46e8-92a9-1736a13640e3/task-688",
      command: "cargo test -p herogpui-components",
      exitCode: 0,
      durationMs: 13910,
      failed: false,
    });
    expect(extracted.parsed.output).toContain("running 43 tests");
    expect(extracted.parsed.output).toContain("43 passed");
    expect(COMPLETED_REPORT.slice(extracted.end).trim()).toBe("");
  });

  it("preserves trailing assistant prose after the output fence", () => {
    const raw = `${COMPLETED_REPORT}\nAll 127 tests passed cleanly!\nNow let's check ToggleButton.`;
    const extracted = extractBackgroundTaskCompletedBlock(raw);
    expect(extracted.complete).toBe(true);
    expect(raw.slice(extracted.end)).toBe(
      "\nAll 127 tests passed cleanly!\nNow let's check ToggleButton.",
    );
  });

  it("keeps heading-plus-metadata incomplete so a streamed Output section is not cut off", () => {
    const prefix = `**Background task completed:** cargo check --workspace (task id: task-746).
Exit code: 0.
Duration: 1.25 seconds.
`;
    const extracted = extractBackgroundTaskCompletedBlock(prefix);
    expect(extracted.complete).toBe(false);
    expect(extracted.parsed.taskId).toBe("task-746");
    expect(extracted.parsed.command).toBe("cargo check --workspace");
  });

  it("completes without output when later prose is not an Output section", () => {
    const raw = `**Background task completed:** cargo check (task id: task-1).
Exit code: 0.
Duration: 1.00 seconds.

The workspace is clean.`;
    const extracted = extractBackgroundTaskCompletedBlock(raw);
    expect(extracted.complete).toBe(true);
    expect(extracted.parsed.output).toBe("");
    expect(raw.slice(extracted.end)).toBe("The workspace is clean.");
  });

  it("parses start and update reports as live phases", () => {
    const started = extractBackgroundTaskCompletedBlock(
      "**Background task started:** cargo test (task id: task-1).\n",
    );
    expect(started.complete).toBe(true);
    expect(started.parsed.phase).toBe("start");
    expect(started.parsed.taskId).toBe("task-1");
    expect(started.parsed.command).toBe("cargo test");

    const update =
      extractBackgroundTaskCompletedBlock(`**Background task update:** cargo test (task id: task-1).

Output:
\`\`\`
running 9 tests
\`\`\`
`);
    expect(update.complete).toBe(true);
    expect(update.parsed.phase).toBe("progress");
    expect(update.parsed.output).toContain("running 9 tests");
  });

  it("finds a line-start heading after surrounding prose", () => {
    const raw = `Before.\n${COMPLETED_REPORT}`;
    expect(findBackgroundTaskCompletedStart(raw, 0)).toBe("Before.\n".length);
    expect(
      findBackgroundTaskCompletedStart("Let's talk about a background task completed later.", 0),
    ).toBe(-1);
  });
});
