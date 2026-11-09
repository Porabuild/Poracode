import "../../../opencode/packages/tui/test/preload";
import { expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { Effect, FileSystem } from "effect";
import { Global } from "@opencode/util/global";
import { Plugin } from "@opencode/plugin/tui";
import type { Thread } from "@/shared/contracts";
import type { PersistedCompletedTurn, PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { buildSubAgentProgressParts } from "../../desktop/presentation";
import {
  createEventStream,
  createFetch,
  directory,
  json,
} from "../../../opencode/packages/tui/test/fixture/tui-client";
import { tmpdir } from "../../../opencode/packages/tui/test/fixture/fixture";
import { historyMessages } from "../../adapter/history";
import { registerTranscriptUi } from ".";

type Setup = Awaited<ReturnType<typeof createTestRenderer>>;

const thread = (status: string, ended?: string) =>
  ({
    id: "thread-sample",
    title: "Sample",
    agentKind: "claude",
    config: { model: "claude-opus" },
    createdAt: "2026-11-08T10:00:00.000Z",
    lastTurnStartedAt: "2026-11-08T10:00:05.000Z",
    ...(ended ? { lastTurnEndedAt: ended } : {}),
    status,
  }) as unknown as Thread;

const file = `${directory}/src/app.ts`;
const item = (
  id: string,
  type: string,
  payload: unknown,
  streams: Record<string, string> = {},
  state: PersistedRuntimeItem["state"] = "completed",
): PersistedRuntimeItem => ({ id, type, state, payload, streams });

const opening = [
  item("u1", "user_message", {
    content: [{ kind: "text", text: "Make the server port configurable and run the tests." }],
  }),
  item("r1", "reasoning", {}, { reasoning_text: "**Planning**\n\nFind where the server starts." }),
  item("t1", "tool_call", {
    name: "Grep",
    status: "success",
    kind: "search",
    args: { pattern: "start\\(", path: "src" },
  }),
  item("t2", "tool_call", {
    name: "Read",
    status: "success",
    kind: "read",
    args: { file_path: file },
    locations: [{ path: file }],
  }),
];

const turn = [
  ...opening,
  item("c1", "command_execution", { command: 'rg -n "PORT" src', exitCode: 1, durationMs: 120 }),
  item(
    "a1",
    "assistant_message",
    { content: [{ kind: "text", text: "Updating the entry point." }] },
    {
      assistant_text: "Updating the entry point.",
    },
  ),
  item("e1", "tool_call", {
    name: "Edit",
    status: "success",
    kind: "edit",
    args: {
      file_path: file,
      old_string: "start()",
      new_string: "const port = 3000\nstart({ port })",
    },
    locations: [{ path: file }],
  }),
  item(
    "c2",
    "command_execution",
    { command: "bun test", exitCode: 0, durationMs: 4300 },
    {
      command_output: "1 pass\n0 fail\n",
    },
  ),
  item("w1", "web_search", { query: "bun test port", resultCount: 5 }),
  item("s1", "tool_call", {
    name: "Task",
    status: "success",
    isSubAgent: true,
    args: { description: "Review the change", subagent_type: "reviewer" },
  }),
  item("p1", "plan", { steps: [{ step: "Hidden plan step", status: "completed" }] }),
  item("g1", "goal", { action: "set", objective: "Hidden goal objective" }),
  item(
    "a2",
    "assistant_message",
    { content: [{ kind: "text", text: "Done." }] },
    {
      assistant_text: "Done.",
    },
  ),
];

const transcript = Plugin.define({
  id: "poracode.transcript",
  setup: (context) => registerTranscriptUi(context),
});

async function renderTranscript(input: {
  thread: Thread;
  items: PersistedRuntimeItem[];
  turns?: PersistedCompletedTurn[];
  waitFor: string;
  verbosity?: "low" | "medium" | "high";
  width?: number;
  act?: (setup: Setup) => Promise<void>;
}) {
  await using state = await tmpdir();
  const setup = await createTestRenderer({
    width: input.width ?? 100,
    height: 60,
    kittyKeyboard: true,
  });
  await setup.renderer.setupTerminal();
  setup.renderer.start();
  const session = {
    id: "ses_thread-sample",
    title: "Sample",
    projectID: "proj_test",
    location: { directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 0, updated: 0 },
  };
  const messages = historyMessages(input.thread, input.items, true, input.turns);
  const calls = createFetch((url) => {
    if (url.pathname === "/api/session") return json({ data: [session], cursor: {} });
    if (url.pathname === `/api/session/${session.id}`) return json({ data: session });
    if (url.pathname === `/api/session/${session.id}/message`)
      return json({ data: messages, cursor: {} });
    if (url.pathname.startsWith(`/api/session/${session.id}/`)) return json({ data: [] });
    return undefined;
  }, createEventStream());
  const server = Bun.serve({ port: 0, idleTimeout: 0, fetch: (request) => calls.fetch(request) });
  const { run } = await import("@opencode/tui");
  const task = Effect.runPromise(
    run({
      app: { name: "test", version: "test", channel: "test" },
      server: { endpoint: { url: server.url.toString() } },
      config: {
        get: async () => ({
          animations: false,
          tabs: { enabled: false },
          session: { verbosity: input.verbosity ?? "low" },
        }),
        update: async () => ({}),
      },
      packages: { prepare: async () => ({ directory: "" }) },
      args: { sessionID: session.id },
      terminalHandoff: async () => ({ renderer: setup.renderer, mode: "dark", complete: () => {} }),
      plugins: { local: false, server: false, internal: [transcript] },
      log: () => {},
    }).pipe(
      Effect.provide(Global.layerWith({ state: state.path })),
      Effect.provide(FileSystem.layerNoop({})),
    ),
  );
  try {
    await setup.waitForFrame((frame) => frame.includes(input.waitFor));
    await setup.waitForVisualIdle({ quietFrames: 3 });
    await input.act?.(setup);
    return setup.captureCharFrame();
  } finally {
    setup.renderer.destroy();
    await task;
    await server.stop();
  }
}

async function click(setup: Setup, text: string) {
  const lines = setup.captureCharFrame().split("\n");
  const row = lines.findIndex((line) => line.includes(text));
  expect(row).toBeGreaterThanOrEqual(0);
  await setup.mockMouse.click(lines[row]!.indexOf(text) + 1, row);
  await setup.waitForVisualIdle({ quietFrames: 3 });
}

test("a finished turn reads like the desktop chat: bubble, collapsed groups, pills, and the turn line", async () => {
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: turn,
    waitFor: "Worked for",
  });
  expect(frame).toContain("╭");
  expect(frame).toContain("│ Make the server port configurable and run the tests.");
  // The desktop group summary orders categories by count, then view/search/edit/command priority.
  expect(frame).toContain("✱ 2 searches · ◉ 1 view · ✻ 1 thought");
  expect(frame).toContain("✱ 1 search · ✎ 1 edit +2 -1 · $ 1 command");
  expect(frame).toContain("❖ Agent (reviewer) · Review the change");
  // The latest turn runs from the thread's lastTurnStartedAt (10:00:05) to its end (10:02:10).
  expect(frame).toContain("Worked for 2m 05s");
  // Rows with nothing to present (the goal, a step without an end) leave no gap.
  expect(frame).toMatch(/Review the change · done\s*\n\s*\n\s+Done\./u);
  // Plans and goals live in docks on desktop, never in the transcript.
  expect(frame).not.toContain("Hidden plan step");
  expect(frame).not.toContain("Hidden goal objective");
  expect(frame).not.toContain("Explored");
}, 30000);

test("opening a group lists its rows on a rail, and an edit row opens its diff", async () => {
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: turn,
    waitFor: "Worked for",
    act: async (setup) => {
      await click(setup, "1 edit");
      await click(setup, "Edit · ");
    },
  });
  expect(frame).toContain("│ ✎ Edit · app.ts src · +2 -1");
  expect(frame).toContain("│ $ Run · bun test");
  expect(frame).toContain("│ ◎ bun test port · 5 results");
  expect(frame).toContain("const port = 3000");
}, 30000);

test("the live tail stays open while the agent works", async () => {
  const frame = await renderTranscript({
    thread: thread("working"),
    items: [...opening, item("c9", "command_execution", { command: "bun test" }, {}, "started")],
    waitFor: "Run · bun test",
  });
  // Equal counts fall back to the desktop priority: view, search, edit, command, …, thought.
  expect(frame).toContain("◉ 1 view · ✱ 1 search · $ 1 command · ✻ 1 thought ▾");
  expect(frame).toContain("│ ✻ Thought · Planning · Find where the server starts.");
  expect(frame).toContain('│ ✱ Grep · "start\\(" in src');
  expect(frame).toContain("│ $ Run · bun test");
  expect(frame).not.toContain("Worked for");
}, 30000);

test("completed turns give each turn its own Worked-for footer", async () => {
  const frame = await renderTranscript({
    thread: {
      ...thread("idle"),
      lastTurnStartedAt: undefined,
      lastTurnEndedAt: undefined,
    } as unknown as Thread,
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "First question." }] }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "First answer." }] },
        { assistant_text: "First answer." },
      ),
      item("u2", "user_message", { content: [{ kind: "text", text: "Second question." }] }),
      item(
        "a2",
        "assistant_message",
        { content: [{ kind: "text", text: "Second answer." }] },
        { assistant_text: "Second answer." },
      ),
    ],
    turns: [
      {
        startedAt: "2026-11-08T10:00:00.000Z",
        endedAt: "2026-11-08T10:00:42.000Z",
        anchorItemId: "a1",
      },
      {
        startedAt: "2026-11-08T10:01:00.000Z",
        endedAt: "2026-11-08T10:04:42.000Z",
        anchorItemId: "a2",
      },
    ],
    waitFor: "Worked for 3m 42s",
  });
  expect(frame).toContain("Worked for 42s");
  expect(frame).toContain("Worked for 3m 42s");
}, 30000);

test("a question_answer item renders the desktop answer card", async () => {
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "Set up auth." }] }),
      item("qa1", "question_answer", {
        questions: [
          {
            header: "Auth provider",
            question: "Which auth provider should the new service use?",
            selected: [
              { label: "WorkOS", description: "Managed auth with SSO and directories" },
              { label: "Staged", description: "Flag-gated rollout" },
            ],
            customAnswer: "Start with internal projects only.",
          },
        ],
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "Switched to WorkOS." }] },
        { assistant_text: "Switched to WorkOS." },
      ),
    ],
    waitFor: "AUTH PROVIDER",
  });
  expect(frame).toContain("AUTH PROVIDER");
  expect(frame).toContain("Which auth provider should the new service use?");
  expect(frame).toContain("✓ WorkOS");
  expect(frame).toContain("Managed auth with SSO and directories");
  expect(frame).toContain("› Start with internal projects only.");
}, 30000);

test("subagent progress meta joins parts with the desktop separator", async () => {
  const progress = { model: "claude-opus-4-8", effort: "high", tokens: 12400 };
  const expected = buildSubAgentProgressParts({ progress })
    .map((part) => part.label)
    .join(" · ");
  expect(expected).toContain("·");
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "Review." }] }),
      item("s1", "tool_call", {
        name: "Task",
        title: "Explore auth flow",
        isSubAgent: true,
        subAgentType: "Explore",
        subAgentStatus: "completed",
        status: "success",
        args: { description: "Explore auth flow", subagent_type: "Explore" },
        result: "Mapped the flow.",
        progress,
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "Done." }] },
        { assistant_text: "Done." },
      ),
    ],
    waitFor: expected,
  });
  expect(frame).toContain(expected);
}, 30000);

test("delegated results use the desktop disclosure labels", async () => {
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "Audit." }] }),
      item("x1", "tool_call", {
        name: "Task",
        isCrossagent: true,
        crossagentStatus: "completed",
        status: "success",
        args: { description: "Cross-repo audit", prompt: "Compare auth." },
        result: "Found 3 inconsistencies.",
      }),
      item("c1", "tool_call", {
        name: "Task",
        isCrossagent: true,
        subAgentType: "researcher",
        crossagentStatus: "completed",
        status: "success",
        args: { description: "Crew audit", prompt: "Compare auth." },
        result: "Crew finished.",
      }),
      item("w1", "tool_call", {
        name: "Workflow",
        isSubAgent: true,
        subAgentStatus: "completed",
        status: "success",
        args: { script: "export const meta = {}", description: "Nightly audit" },
        result: JSON.stringify({
          findings: [
            { dimension: "auth", summary: "Token refresh timing differs." },
            { dimension: "logout", summary: "Logout does not propagate." },
          ],
        }),
        workflow: { name: "nightly-audit", runId: "wf_1", summary: "Nightly audit" },
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "All audits done." }] },
        { assistant_text: "All audits done." },
      ),
    ],
    waitFor: "Workflow results",
  });
  expect(frame).toContain("Crossagent Result");
  expect(frame).toContain("Crew Result");
  expect(frame).toContain("Workflow results");
  expect(frame).toContain("2 dimensions");
  expect(frame).not.toContain("Subagent Result");
}, 30000);

test("a failed agent still discloses its result like the desktop", async () => {
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "Check the migration." }] }),
      item("f1", "tool_call", {
        name: "Task",
        isSubAgent: true,
        subAgentType: "general",
        subAgentStatus: "failed",
        status: "error",
        errorMessage: "Subagent exceeded the step limit",
        args: {
          description: "Run migration check",
          subagent_type: "general",
          prompt: "Verify the migration against staging.",
        },
        result: { error: "step limit exceeded after 40 steps" },
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "The check failed." }] },
        { assistant_text: "The check failed." },
      ),
    ],
    waitFor: "Subagent Result",
    act: (setup) => click(setup, "Subagent Result"),
  });
  expect(frame).toContain("Subagent Result");
  expect(frame).toContain("step limit exceeded");
}, 30000);

test("an expanded workflow result lists one row per item", async () => {
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "Audit nightly." }] }),
      item("w1", "tool_call", {
        name: "Workflow",
        isSubAgent: true,
        subAgentStatus: "completed",
        status: "success",
        args: { script: "export const meta = {}", description: "Nightly audit" },
        result: JSON.stringify({
          findings: [
            { dimension: "auth", summary: "Token refresh timing differs." },
            { dimension: "logout", summary: "Logout does not propagate." },
          ],
        }),
        workflow: { name: "nightly-audit", runId: "wf_1", summary: "Nightly audit" },
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "Audit done." }] },
        { assistant_text: "Audit done." },
      ),
    ],
    waitFor: "Workflow results",
    act: (setup) => click(setup, "Workflow results"),
  });
  expect(frame).toContain("Workflow results");
  expect(frame).toContain("auth");
  expect(frame).toContain("Token refresh timing differs.");
  expect(frame).toContain("logout");
  expect(frame).toContain("Logout does not propagate.");
}, 30000);

test("a plain workflow result renders inline without a toggle", async () => {
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "Audit nightly." }] }),
      item("w1", "tool_call", {
        name: "Workflow",
        isSubAgent: true,
        subAgentStatus: "completed",
        status: "success",
        args: { script: "export const meta = {}", description: "Nightly audit" },
        result:
          "Workflow wf_9f2c1 completed: 3 agents ran, 0 failures. Run ID abc123. Transcript dir /tmp/wf.",
        workflow: { name: "nightly-audit", runId: "wf_9f2c1", summary: "Nightly audit" },
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "Audit done." }] },
        { assistant_text: "Audit done." },
      ),
    ],
    waitFor: "3 agents ran",
  });
  expect(frame).toContain("Workflow wf_9f2c1 completed: 3 agents ran, 0 failures.");
  expect(frame).not.toContain("Workflow results");
}, 30000);

test("a non-list JSON workflow result renders as a code block", async () => {
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "Audit nightly." }] }),
      item("w1", "tool_call", {
        name: "Workflow",
        isSubAgent: true,
        subAgentStatus: "completed",
        status: "success",
        args: { script: "export const meta = {}", description: "Nightly audit" },
        result: '{"status":"running","tokens":12}',
        workflow: { name: "nightly-audit", runId: "wf_1", summary: "Nightly audit" },
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "Audit done." }] },
        { assistant_text: "Audit done." },
      ),
    ],
    waitFor: '"status": "running"',
  });
  expect(frame).toContain('"status": "running"');
  expect(frame).toContain('"tokens": 12');
  expect(frame).not.toContain("Workflow results");
}, 30000);

test("a tool_use_error workflow result renders nothing", async () => {
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "Audit nightly." }] }),
      item("w1", "tool_call", {
        name: "Workflow",
        isSubAgent: true,
        subAgentStatus: "completed",
        status: "error",
        args: { script: "export const meta = {}", description: "Nightly audit" },
        result:
          "<tool_use_error>workflow scripts must be deterministic: Date.now() is unavailable.</tool_use_error>",
        workflow: { name: "nightly-audit", runId: "wf_1", summary: "Nightly audit" },
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "Audit done." }] },
        { assistant_text: "Audit done." },
      ),
    ],
    waitFor: "Nightly audit",
  });
  expect(frame).not.toContain("tool_use_error");
  expect(frame).not.toContain("Workflow results");
}, 30000);

test("an inline image_view stays out of the tool group", async () => {
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "Look at this." }] }),
      item("g1", "tool_call", {
        name: "Grep",
        status: "success",
        kind: "search",
        args: { pattern: "port", path: "src" },
      }),
      item("g2", "tool_call", {
        name: "Grep",
        status: "success",
        kind: "search",
        args: { pattern: "host", path: "src" },
      }),
      item("i1", "image_view", {
        name: "ViewImage",
        path: `${directory}/docs/shot.png`,
        args: { path: `${directory}/docs/shot.png` },
        result:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        status: "success",
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "Seen." }] },
        { assistant_text: "Seen." },
      ),
    ],
    waitFor: "searches",
  });
  const groupLine = frame.split("\n").find((line) => line.includes("searches"));
  expect(groupLine).toBeDefined();
  expect(groupLine).not.toContain("view");
  expect(groupLine).toContain("2 searches");
}, 30000);

test("a long file path keeps its basename at narrow widths", async () => {
  const filler = "extended-validation-and-reporting-pipeline";
  const filePath = `${directory}/src/features/${filler}/${filler}/${filler}/extended-validation-and-reporting-pipe`;
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", { content: [{ kind: "text", text: "Read it." }] }),
      item("v1", "tool_call", {
        name: "Read",
        status: "success",
        kind: "read",
        args: { file_path: filePath },
        locations: [{ path: filePath }],
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "Read." }] },
        { assistant_text: "Read." },
      ),
    ],
    waitFor: "extended-validation-and-reporting-pipe",
    width: 60,
  });
  const row = frame.split("\n").find((line) => line.includes("extended-validation"));
  expect(row).toBeDefined();
  expect(row).toContain("extended-validation-and-reporting-pipe");
  // The muted directory tail is dropped rather than left as a dangling fragment.
  expect(row).not.toContain("…");
}, 30000);

test("an expanded group's inline rows keep their diff stat at narrow widths", async () => {
  const longA = `${directory}/src/${"a-very-long-directory-name-".repeat(3)}one.ts`;
  const longB = `${directory}/src/${"another-extremely-long-directory-name-".repeat(2)}two.ts`;
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: [
      item("u1", "user_message", {
        content: [{ kind: "text", text: "Edit both files." }],
      }),
      item("e1", "tool_call", {
        name: "Edit",
        status: "success",
        kind: "edit",
        args: { file_path: longA, old_string: "alpha", new_string: "beta\ngamma" },
        locations: [{ path: longA }],
      }),
      item("e2", "tool_call", {
        name: "Edit",
        status: "success",
        kind: "edit",
        args: { file_path: longB, old_string: "one", new_string: "two" },
        locations: [{ path: longB }],
      }),
      item(
        "a1",
        "assistant_message",
        { content: [{ kind: "text", text: "Done." }] },
        { assistant_text: "Done." },
      ),
    ],
    waitFor: "Worked for",
    width: 50,
    act: async (setup) => {
      await click(setup, "edits");
    },
  });
  const rail = frame.split("\n").filter((line) => line.includes("Edit ·"));
  expect(rail.some((line) => line.includes("+2 -1"))).toBe(true);
  expect(rail.some((line) => line.includes("+1 -1"))).toBe(true);
}, 30000);

test("the sticky prompt header names the prompt once its rows scroll out of view", async () => {
  const prompt = "A prompt that scrolled far above the viewport.";
  const tall = [
    item("u1", "user_message", { content: [{ kind: "text", text: prompt }] }),
    ...Array.from({ length: 40 }, (_, index) =>
      item(
        `a${index}`,
        "assistant_message",
        { content: [{ kind: "text", text: `Response line ${index} ${"x".repeat(90)}` }] },
        { assistant_text: `Response line ${index}` },
      ),
    ),
  ];
  const frame = await renderTranscript({
    thread: thread("idle", "2026-11-08T10:02:10.000Z"),
    items: tall,
    waitFor: "Worked for",
  });
  // The user bubble is scrolled out of view, so the prompt text can only come
  // from the pinned header bar near the top of the transcript.
  const lines = frame.split("\n");
  const barRow = lines.findIndex((line) => line.includes("A prompt that scrolled"));
  expect(barRow).toBeGreaterThanOrEqual(0);
  expect(barRow).toBeLessThan(8);
}, 30000);
