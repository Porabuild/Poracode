import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ToolCallGroup } from "./ToolCallGroup";

describe("ToolCallGroup", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      runtimeStructuralVersionByThread: {},
    });
  });

  it("renders only the last 8 rows when collapsed and reveals the rest via Show all", () => {
    const threadId = "thread-1";
    const items = Array.from({ length: 10 }, (_, index) =>
      makeToolItem(`tool-${index + 1}`, `Read file ${index + 1}`),
    );
    seedThread(threadId, items);

    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );
    const viewport = getViewport(view.container);

    expect(screen.queryByText("Read file 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Read file 2")).not.toBeInTheDocument();
    expect(screen.getByText("Read file 3")).toBeInTheDocument();
    expect(screen.getByText("Read file 10")).toBeInTheDocument();
    expect(viewport.className).not.toContain("overflow-y-auto");

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));

    expect(screen.getByText("Read file 1")).toBeInTheDocument();
    expect(screen.getByText("Read file 10")).toBeInTheDocument();
    expect(viewport.className).toContain("overflow-y-auto");
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));

    expect(screen.queryByText("Read file 1")).not.toBeInTheDocument();
    expect(screen.getByText("Read file 10")).toBeInTheDocument();
    expect(viewport.className).not.toContain("overflow-y-auto");
  });

  it("renders every row inline when the group fits under the cap", () => {
    const threadId = "thread-1";
    const items = Array.from({ length: 6 }, (_, index) =>
      makeToolItem(`tool-${index + 1}`, `Read file ${index + 1}`),
    );
    seedThread(threadId, items);

    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );
    const viewport = getViewport(view.container);

    for (let i = 1; i <= 6; i += 1) {
      expect(screen.getByText(`Read file ${i}`)).toBeInTheDocument();
    }
    expect(viewport.className).not.toContain("overflow-y-auto");
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
  });

  it("colors file-change diff summary counts and hides zero values", () => {
    const threadId = "thread-1";
    const items = [
      makeFileChangeItem("file-1", { added: 4, removed: 2 }),
      makeFileChangeItem("file-2", { added: 5, removed: 0 }, "src/bar.ts"),
    ];
    seedThread(threadId, items);

    renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    expect(screen.getByText("+4")).toHaveClass("text-success");
    expect(screen.getAllByText("-2")[0]).toHaveClass("text-danger");
    expect(screen.getByText("+5")).toHaveClass("text-success");
    expect(screen.queryByText("-0")).not.toBeInTheDocument();
  });

  it("summarizes same-file edit groups with the file path and total diff", () => {
    const threadId = "thread-1";
    const items = [
      makeFileChangeItem("file-1", { added: 4, removed: 2 }),
      makeFileChangeItem("file-2", { added: 5, removed: 3 }),
    ];
    seedThread(threadId, items);

    renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    const heading = screen.getByRole("button", { name: /2 edits:/i });
    expect(within(heading).getByText("foo.ts")).toBeInTheDocument();
    expect(within(heading).getByText("src")).toBeInTheDocument();
    expect(within(heading).getByText("+9")).toHaveClass("text-success");
    expect(within(heading).getByText("-5")).toHaveClass("text-danger");
  });

  it("flattens same-file edit groups into stacked diffs without per-edit rows", async () => {
    const threadId = "thread-1";
    const items = [
      makeFileChangeItem("file-1", { added: 4, removed: 2 }),
      makeFileChangeItem("file-2", { added: 5, removed: 3 }),
    ];
    seedThread(threadId, items);

    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    // No nested per-edit disclosure rows — diffs render directly.
    expect(screen.queryByRole("button", { name: /^Edit:/i })).not.toBeInTheDocument();
    const viewport = getViewport(view.container);
    expect(within(viewport).queryAllByRole("button")).toHaveLength(0);
    await waitFor(() => {
      expect((viewport.textContent?.match(/new/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });
  });

  // One fixture per provider payload shape: Claude (metadata.changes from
  // structuredPatch), Codex (args.changes[]), OpenCode (metadata.changes), and
  // ACP providers like Gemini/Cursor/Copilot (editOldText/editNewText).
  it.each([
    ["claude", makeProviderEditItem("claude")],
    ["codex", makeProviderEditItem("codex")],
    ["opencode", makeProviderEditItem("opencode")],
    ["acp", makeProviderEditItem("acp")],
  ] as const)("flattens same-file edit groups for %s payloads", async (_provider, makeItem) => {
    const threadId = "thread-1";
    const items = [makeItem("edit-1"), makeItem("edit-2")];
    seedThread(threadId, items);

    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    expect(screen.getByRole("button", { name: /2 edits:/i })).toBeInTheDocument();
    const viewport = getViewport(view.container);
    expect(within(viewport).queryAllByRole("button")).toHaveLength(0);
    await waitFor(() => {
      expect((viewport.textContent?.match(/const answer = 42;/g) ?? []).length).toBe(2);
    });
  });

  it("renders file-change diffs directly instead of args/result sections", async () => {
    const threadId = "thread-1";
    const item = makeFileChangeItem("file-1");
    seedThread(threadId, [item]);

    renderToolCallGroup(threadId, [item.id]);
    fireEvent.click(screen.getByText("src/foo.ts"));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/old/);
      expect(document.body).toHaveTextContent(/new/);
    });
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });

  it("renders changes-array edits as diffs instead of raw args/result JSON", async () => {
    const threadId = "thread-1";
    const item = makeChangesArrayFileChangeItem("file-changes-array-edit", "edit");
    seedThread(threadId, [item]);

    renderToolCallGroup(threadId, [item.id]);

    expect(screen.getByText("+3")).toHaveClass("text-success");
    fireEvent.click(screen.getByText("chatPaneSelectors.ts"));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/canShareRuntimeToolGroup/);
      expect(document.body).toHaveTextContent(/groupIds\.push/);
    });
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });

  it("renders apply_patch tool-call edits with diff counts and rich diff body", async () => {
    const threadId = "thread-1";
    const item = makeApplyPatchToolItem("tool-apply-patch");
    seedThread(threadId, [item]);

    renderToolCallGroup(threadId, [item.id]);

    expect(screen.getByText("+1")).toHaveClass("text-success");
    expect(screen.getByText("-1")).toHaveClass("text-danger");
    fireEvent.click(screen.getByText("toolDisplay.ts"));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/before/);
      expect(document.body).toHaveTextContent(/after/);
    });
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });

  it("renders Droid ApplyPatch tool-call edits with diff counts and rich diff body", async () => {
    const threadId = "thread-1";
    const item = makeDroidApplyPatchToolItem("tool-droid-applypatch");
    seedThread(threadId, [item]);

    renderToolCallGroup(threadId, [item.id]);

    expect(screen.getByText("+1")).toHaveClass("text-success");
    expect(screen.getByText("-1")).toHaveClass("text-danger");
    fireEvent.click(screen.getByText("droidFile.ts"));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/old droid/);
      expect(document.body).toHaveTextContent(/new droid/);
    });
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });

  it("renders read tool-call results as highlighted file content", async () => {
    const threadId = "thread-1";
    const item = makeReadToolItem("tool-read");
    seedThread(threadId, [item]);

    renderToolCallGroup(threadId, [item.id]);
    fireEvent.click(screen.getByText("source.ts"));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/export const value = 1/);
    });
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });

  it("renders Grok structured read results as highlighted file content", async () => {
    const threadId = "thread-1";
    const item = makeGrokReadToolItem("tool-grok-read");
    seedThread(threadId, [item]);

    renderToolCallGroup(threadId, [item.id]);
    fireEvent.click(screen.getByText("store.js"));

    const viewport = await waitFor(() => {
      const rich = findRichViewport();
      if (!rich.textContent?.includes("export function subscribe")) {
        throw new Error("read viewport not populated yet");
      }
      return rich;
    });

    expect(viewport.textContent).toContain("let todos = [];");
    expect(viewport.textContent).not.toContain('"type": "ReadFile"');
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });

  it("renders changes-array creates as highlighted file content", async () => {
    const threadId = "thread-1";
    const item = makeChangesArrayFileChangeItem("file-changes-array-create", "create");
    seedThread(threadId, [item]);

    renderToolCallGroup(threadId, [item.id]);

    expect(screen.getByText("+2")).toHaveClass("text-success");
    fireEvent.click(screen.getByText("runtimeToolGrouping.ts"));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/const EDIT_TOOL_NAMES/);
      expect(document.body).toHaveTextContent(/export function canShareRuntimeToolGroup/);
    });
    expect(screen.queryByText('"changes"')).not.toBeInTheDocument();
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });

  it("uses command intent titles inside grouped command rows", () => {
    const threadId = "thread-1";
    const items = [
      makeCommandItem("cmd-1", "sed -n '1,24p' src/supervisor/runtime.test.ts"),
      makeCommandItem("cmd-2", "find node_modules/.pnpm -maxdepth 4 -type f -name 'vitest.mjs'"),
      makeCommandItem("cmd-3", "git diff -- src/supervisor/runtime.ts"),
      makeCommandItem("cmd-4", "pnpm run test"),
      makeCommandItem("cmd-5", "pnpm install --prod=false"),
    ];
    seedThread(threadId, items);

    renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    expect(document.body).toHaveTextContent("View 1:24: src/supervisor/runtime.test.ts");
    expect(screen.getByText('Search: "vitest.mjs"')).toBeInTheDocument();
    expect(screen.getByText("Git: git diff -- src/supervisor/runtime.ts")).toBeInTheDocument();
    expect(screen.getByText("Check: pnpm run test")).toBeInTheDocument();
    expect(screen.getByText("Install packages: pnpm install")).toBeInTheDocument();
  });

  it("categorizes persisted compacted tool summaries by their labels", () => {
    const threadId = "thread-1";
    const items = [
      makeToolItem("summary-1", "7 commands"),
      makeToolItem("summary-2", "5 commands"),
      makeToolItem("summary-3", "4 edits"),
    ];
    seedThread(threadId, items);

    renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    expect(screen.getByText("2 commands")).toBeInTheDocument();
    expect(screen.getByText("1 edit")).toBeInTheDocument();
  });

  it("categorizes ApplyPatch tool calls as edits in the group heading", () => {
    const threadId = "thread-1";
    const items = [
      makeDroidApplyPatchToolItem("droid-patch-1", "src/alpha.ts"),
      makeDroidApplyPatchToolItem("droid-patch-2", "src/beta.ts"),
    ];
    seedThread(threadId, items);

    renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    expect(screen.getByText("2 edits")).toBeInTheDocument();
  });

  it("renders semantic tool-like item buckets as tool rows", () => {
    const threadId = "thread-1";
    const items = [
      makeSemanticToolItem("mcp-1", "mcp_tool_call", {
        name: "mcp__github__search",
        status: "success",
        args: { query: "deploy" },
      }),
      makeSemanticToolItem("image-1", "image_view", {
        name: "ViewImage",
        status: "success",
        args: { path: "screen.png" },
      }),
      makeSemanticToolItem("dynamic-1", "dynamic_tool_call", {
        name: "ToolSearch",
        status: "success",
        args: { query: "deploy" },
      }),
    ];
    seedThread(threadId, items);

    renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    expect(screen.getByText("github: search")).toBeInTheDocument();
    expect(screen.getAllByText("screen.png").length).toBeGreaterThan(0);
    expect(screen.getByText("Tool search: deploy")).toBeInTheDocument();
  });

  it("keeps web searches visible when Codex omits the query", () => {
    const threadId = "thread-1";
    const item = makeWebSearchItem("web-search-1", {
      query: "",
      name: "WebSearch",
      args: { type: "other" },
      status: "success",
    });
    seedThread(threadId, [item]);

    renderToolCallGroup(threadId, [item.id]);

    expect(screen.getByText("Web search")).toBeInTheDocument();
  });

  it("categorizes sub-agent tools as commands", () => {
    const threadId = "thread-1";
    const items = [makeAgentItem("agent-1")];
    seedThread(threadId, items);

    renderToolCallGroup(threadId, [items[0]!.id]);

    expect(screen.getByText("1 command")).toBeInTheDocument();
  });

  it("prefers a synthesized diff over non-diff streamed status text", async () => {
    const threadId = "thread-1";
    const item = makeReplacementFileChangeItem("file-2");
    seedThread(threadId, [item]);

    renderToolCallGroup(threadId, [item.id]);
    fireEvent.click(screen.getByText("src/foo.ts"));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/old value/);
      expect(document.body).toHaveTextContent(/new value/);
    });
    expect(screen.queryByText("Edit applied successfully.")).not.toBeInTheDocument();
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });
});

function renderToolCallGroup(threadId: string, itemIds: readonly string[]) {
  return render(
    <AppProvider>
      <ToolCallGroup threadId={threadId} itemIds={itemIds} isLive />
    </AppProvider>,
  );
}

function seedThread(threadId: string, items: readonly RuntimeChatItem[]) {
  useAppStore.setState({
    runtimeItemIdsByThread: { [threadId]: items.map((item) => item.id) },
    runtimeItemsByIdByThread: {
      [threadId]: Object.fromEntries(items.map((item) => [item.id, item])),
    },
    runtimeStructuralVersionByThread: { [threadId]: items.length },
  });
}

function makeCommandItem(id: string, command: string): RuntimeChatItem {
  return {
    id,
    type: "command_execution",
    state: "completed",
    payload: { command, exitCode: 0 },
    streams: {},
  };
}

function makeToolItem(id: string, name: string): RuntimeChatItem {
  return {
    id,
    type: "tool_call",
    state: "completed",
    payload: { name, status: "success" },
    streams: {},
  };
}

function makeSemanticToolItem(
  id: string,
  type: "mcp_tool_call" | "image_view" | "dynamic_tool_call",
  payload: RuntimeChatItem["payload"],
): RuntimeChatItem {
  return {
    id,
    type,
    state: "completed",
    payload,
    streams: {},
  };
}

function makeWebSearchItem(id: string, payload: RuntimeChatItem["payload"]): RuntimeChatItem {
  return {
    id,
    type: "web_search",
    state: "completed",
    payload,
    streams: {},
  };
}

function makeAgentItem(id: string): RuntimeChatItem {
  return {
    id,
    type: "tool_call",
    state: "completed",
    payload: {
      name: "Agent",
      status: "success",
      args: { description: "Review code", subagent_type: "general-purpose" },
    },
    streams: {},
  };
}

function makeApplyPatchToolItem(id: string): RuntimeChatItem {
  return {
    id,
    type: "tool_call",
    state: "completed",
    payload: {
      name: "apply_patch",
      title: "apply_patch",
      kind: "edit",
      status: "success",
      args: {
        patchText: [
          "*** Begin Patch",
          "*** Update File: src/renderer/components/thread/ChatPane/parts/items/toolDisplay.ts",
          "@@",
          "-before",
          "+after",
          "*** End Patch",
        ].join("\n"),
      },
      result:
        "Success. Updated the following files:\nM src/renderer/components/thread/ChatPane/parts/items/toolDisplay.ts",
    },
    streams: {},
  };
}

function makeDroidApplyPatchToolItem(id: string, filePath?: string): RuntimeChatItem {
  const path = filePath ?? "src/renderer/components/thread/ChatPane/parts/items/droidFile.ts";
  return {
    id,
    type: "tool_call",
    state: "completed",
    payload: {
      name: "ApplyPatch",
      title: "ApplyPatch",
      kind: "other",
      status: "success",
      args: {
        patch: [
          "*** Begin Patch",
          `*** Update File: ${path}`,
          "@@",
          "-old droid",
          "+new droid",
          "*** End Patch",
        ].join("\n"),
      },
      result: `Success. Updated the following files:\nM ${path}`,
    },
    streams: {},
  };
}

function makeReadToolItem(id: string): RuntimeChatItem {
  return {
    id,
    type: "tool_call",
    state: "completed",
    payload: {
      name: "src/source.ts",
      title: "src/source.ts",
      kind: "read",
      locations: [{ path: "src/source.ts" }],
      args: { filePath: "src/source.ts" },
      result: "export const value = 1;\n",
      status: "success",
    },
    streams: {},
  };
}

function makeGrokReadToolItem(id: string): RuntimeChatItem {
  return {
    id,
    type: "tool_call",
    state: "completed",
    payload: {
      name: "View 1:80: store.js",
      title: "View 1:80: store.js",
      kind: "read",
      args: { file_path: "/home/sdsleon/work/todo-app/js/store.js", offset: 1, limit: 80 },
      result: {
        type: "ReadFile",
        content: [
          "1: import { STORAGE_KEY } from './constants.js';",
          "2: let todos = [];",
          "3: export function subscribe(fn) {",
          "4:   return () => {};",
          "5: }",
        ].join("\n"),
        content_concise: "1: import { STORAGE_KEY } from './constants.js';",
        absolute_path: "/home/sdsleon/work/todo-app/js/store.js",
      },
      status: "success",
    },
    streams: {},
  };
}

function makeFileChangeItem(
  id: string,
  diffSummary: { added: number; removed: number } = { added: 1, removed: 1 },
  path = "src/foo.ts",
): RuntimeChatItem {
  return {
    id,
    type: "file_change",
    state: "completed",
    payload: {
      path,
      changeKind: "edit",
      diffSummary,
      args: [
        "*** Begin Patch",
        `*** Update File: ${path}`,
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ].join("\n"),
      result: {
        detailedContent: [
          `diff --git a/${path} b/${path}`,
          `--- a/${path}`,
          `+++ b/${path}`,
          "@@ -1 +1 @@",
          "-old",
          "+new",
          "",
        ].join("\n"),
      },
    },
    streams: {},
  };
}

/**
 * Edit `file_change` payloads as each provider mapper actually emits them:
 * - claude: `metadata.changes[].diff` from tool_use_result.structuredPatch
 * - codex: `args.changes[].diff` from the app-server turn diff
 * - opencode: `metadata.changes[].diff` from the SDK metadata
 * - acp (Gemini/Cursor/Copilot/Grok): `editOldText`/`editNewText` snapshots
 */
function makeProviderEditItem(
  provider: "claude" | "codex" | "opencode" | "acp",
): (id: string) => RuntimeChatItem {
  const path = "src/app.ts";
  const diff = [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -11,3 +11,3 @@",
    " context line 11",
    "-const answer = 41;",
    "+const answer = 42;",
    " context line 13",
  ].join("\n");
  const change = { path, kind: { type: "update", move_path: null }, diff };
  return (id: string) => ({
    id,
    type: "file_change",
    state: "completed",
    payload: {
      path,
      changeKind: "edit",
      status: "success",
      diffSummary: { added: 1, removed: 1 },
      ...(provider === "claude"
        ? {
            args: {
              file_path: path,
              old_string: "const answer = 41;",
              new_string: "const answer = 42;",
            },
            result: "Edit applied.",
            metadata: { changes: [change] },
          }
        : provider === "codex"
          ? { args: { changes: [change] } }
          : provider === "opencode"
            ? { metadata: { changes: [change] } }
            : { editOldText: "const answer = 41;\n", editNewText: "const answer = 42;\n" }),
    },
    streams: {},
  });
}

function makeReplacementFileChangeItem(id: string): RuntimeChatItem {
  return {
    id,
    type: "file_change",
    state: "completed",
    payload: {
      path: "src/foo.ts",
      changeKind: "edit",
      diffSummary: { added: 1, removed: 1 },
      args: {
        filePath: "src/foo.ts",
        oldString: "old value",
        newString: "new value",
      },
      result: { content: "Edit applied successfully." },
    },
    streams: { file_change_output: "Edit applied successfully." },
  };
}

function makeChangesArrayFileChangeItem(
  id: string,
  changeKind: "create" | "edit",
): RuntimeChatItem {
  const path =
    changeKind === "create"
      ? "/Users/serhiivecherenko/work/lightcode/src/renderer/state/runtimeToolGrouping.ts"
      : "/Users/serhiivecherenko/work/lightcode/src/renderer/components/thread/ChatPane/chatPaneSelectors.ts";
  const diff =
    changeKind === "create"
      ? [
          "@@ -0,0 +1,2 @@",
          '+const EDIT_TOOL_NAMES = new Set(["Edit", "Write"]);',
          "+export function canShareRuntimeToolGroup() { return true; }",
          "",
        ].join("\n")
      : [
          "@@ -6,2 +6,3 @@",
          ' import type { ToolCallPayload } from "@/shared/contracts";',
          '+import { canShareRuntimeToolGroup } from "@/renderer/state/runtimeToolGrouping";',
          "+if (!canShareRuntimeToolGroup(item, next)) {",
          "+  break;",
          " groupIds.push(nextId);",
          "",
        ].join("\n");

  return {
    id,
    type: "file_change",
    state: "completed",
    payload: {
      path,
      changeKind,
      args: {
        changes: [
          {
            path,
            kind: {
              type: changeKind === "create" ? "add" : "update",
              move_path: null,
            },
            diff,
          },
        ],
      },
      result: {
        changes: [
          {
            path,
            kind: {
              type: changeKind === "create" ? "add" : "update",
              move_path: null,
            },
            diff,
          },
        ],
      },
    },
    streams: {},
  };
}

function getViewport(container: HTMLElement): HTMLDivElement {
  const element = container.querySelector(".lightcode-tool-call-group-viewport");
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("missing tool call group viewport");
  }
  return element;
}

function findRichViewport(): HTMLElement {
  const viewport = document.querySelector(".lc-shiki, pre");
  if (!(viewport instanceof HTMLElement)) throw new Error("rich viewport not found");
  return viewport;
}
