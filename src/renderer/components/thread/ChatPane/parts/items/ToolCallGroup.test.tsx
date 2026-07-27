import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    const body = viewport.parentElement;
    if (!body) throw new Error("missing tool group body");
    const showAll = screen.getByRole("button", { name: "Show all" });

    expect(screen.queryByText("Read file 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Read file 2")).not.toBeInTheDocument();
    expect(screen.getByText("Read file 3")).toBeInTheDocument();
    expect(screen.getByText("Read file 10")).toBeInTheDocument();
    expect(viewport.className).not.toContain("overflow-y-auto");
    expect(viewport).toHaveClass("gap-0.5");
    expect(body).toHaveClass("border-l", "border-dashed");
    expect(body).toHaveClass("ml-1.5", "pl-2.5");
    expect(body).not.toHaveClass("border-t");
    expect(showAll.parentElement).toHaveClass("justify-start");
    expect(showAll).toHaveClass("-ml-1");

    fireEvent.click(showAll);

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

  it("does not mount child rows while collapsed and mounts them once expanded", () => {
    const threadId = "thread-1";
    const items = [
      makeToolItem("tool-1", "Read file one"),
      makeToolItem("tool-2", "Read file two"),
    ];
    seedThread(threadId, items);

    // isLive=false → the group starts collapsed. React Aria keeps the panel
    // mounted-but-hidden, so this asserts the `isExpanded` gate actually skips
    // rendering the heavy child rows (not just hiding them).
    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
      false,
    );

    // Header still derives from the summary while collapsed.
    expect(screen.getByText("2 views")).toBeInTheDocument();
    // No child row content and no viewport container are mounted.
    expect(view.container.querySelector(".poracode-tool-call-group-viewport")).toBeNull();
    expect(screen.queryByText("Read file one")).not.toBeInTheDocument();
    expect(screen.queryByText("Read file two")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /2 views/i }));

    // Expanded: child rows mount.
    expect(view.container.querySelector(".poracode-tool-call-group-viewport")).not.toBeNull();
    expect(screen.getByText("Read file one")).toBeInTheDocument();
    expect(screen.getByText("Read file two")).toBeInTheDocument();
  });

  it("requests row remeasurement after the collapsed layout commits", () => {
    const threadId = "thread-1";
    const items = [makeToolItem("tool-1", "Read file one")];
    seedThread(threadId, items);
    let container: HTMLElement | null = null;
    const onHeightChange = vi.fn<() => void>(() => {
      expect(container?.querySelector(".poracode-tool-call-group-viewport")).toBeNull();
    });
    const beginVirtualizerLayoutChange = vi.fn<() => void>();
    const view = renderToolCallGroup(
      threadId,
      [items[0]!.id],
      true,
      onHeightChange,
      beginVirtualizerLayoutChange,
    );
    container = view.container;

    fireEvent.click(screen.getByRole("button", { name: /1 view/i }));

    expect(beginVirtualizerLayoutChange).toHaveBeenCalledOnce();
    expect(beginVirtualizerLayoutChange.mock.invocationCallOrder[0]!).toBeLessThan(
      onHeightChange.mock.invocationCallOrder[0]!,
    );
    expect(onHeightChange).toHaveBeenCalledOnce();
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

  it("shows group and inline disclosure chevrons only on desktop hover", () => {
    const threadId = "thread-1";
    const item = {
      ...makeToolItem("tool-1", "Read file"),
      payload: { name: "Read file", status: "success", args: { path: "README.md" } },
    } satisfies RuntimeChatItem;
    seedThread(threadId, [item]);

    const view = renderToolCallGroup(threadId, [item.id]);
    const indicators = view.container.querySelectorAll(".disclosure__indicator");

    expect(indicators).toHaveLength(2);
    for (const indicator of indicators) {
      expect(indicator).toHaveClass(
        "[@media(hover:hover)]:opacity-0",
        "[@media(hover:hover)]:group-hover:opacity-100",
        "[@media(hover:hover)]:group-focus-visible:opacity-100",
      );
      expect(indicator.closest("button")).toHaveClass("group");
    }
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

    // Edit-only groups stay collapsed while live — open to inspect per-row diffs.
    expandGroup(/2 edits/i);

    expect(screen.getByText("+4")).toHaveClass("text-success");
    expect(screen.getAllByText("-2")[0]).toHaveClass("text-danger");
    expect(screen.getByText("+5")).toHaveClass("text-success");
    expect(screen.queryByText("-0")).not.toBeInTheDocument();
  });

  it("shows combined diff counts for edits in a mixed group header", () => {
    const threadId = "thread-1";
    const items = [
      makeReasoningItem("reasoning-1", "Planning the edits."),
      makeFileChangeItem("file-1", { added: 4, removed: 2 }, "src/one.ts"),
      makeCommandItem("cmd-1", "pnpm run test"),
      makeFileChangeItem("file-2", { added: 5, removed: 3 }, "src/two.ts"),
      makeFileChangeItem("file-3", { added: 2, removed: 1 }, "src/three.ts"),
    ];
    seedThread(threadId, items);

    renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    const heading = screen.getByRole("button", { name: /3 edits/i });
    expect(within(heading).getByText("+11")).toHaveClass("text-success");
    expect(within(heading).getByText("-6")).toHaveClass("text-danger");
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

  it("does not auto-expand live edit-only groups", () => {
    const threadId = "thread-1";
    const items = [
      makeFileChangeItem("file-1", { added: 4, removed: 2 }, "src/a.ts"),
      makeFileChangeItem("file-2", { added: 5, removed: 3 }, "src/b.ts"),
    ];
    seedThread(threadId, items);

    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
      true,
    );

    // Multi-file edit run: still "2 edits", but never open by itself while live.
    const heading = screen.getByRole("button", { name: /2 edits/i });
    expect(heading).toHaveAttribute("aria-expanded", "false");
    expect(view.container.querySelector(".poracode-tool-call-group-viewport")).toBeNull();
  });

  it("still auto-expands live groups that include non-edit tools", () => {
    const threadId = "thread-1";
    const items = [
      makeToolItem("tool-1", "Read file one"),
      makeFileChangeItem("file-1", { added: 1, removed: 0 }),
    ];
    seedThread(threadId, items);

    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
      true,
    );

    expect(view.container.querySelector(".poracode-tool-call-group-viewport")).not.toBeNull();
    expect(screen.getByText("Read file one")).toBeInTheDocument();
  });

  it("flattens same-file edit groups into one merged file diff without per-edit rows", async () => {
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

    expandGroup(/2 edits:/i);

    // No nested per-edit disclosure rows — one merged file diff renders directly.
    expect(screen.queryByRole("button", { name: /^Edit:/i })).not.toBeInTheDocument();
    const viewport = getViewport(view.container);
    expect(viewport.querySelectorAll(":scope > .animate-tool-call-enter")).toHaveLength(1);
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

    expandGroup(/2 edits:/i);
    const viewport = getViewport(view.container);
    expect(viewport.querySelectorAll(":scope > .animate-tool-call-enter")).toHaveLength(1);
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
    // Edit-only groups stay collapsed while live — open the group, then the row.
    expandGroup(/1 edit/i);
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
    expandGroup(/1 edit/i);

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
    expandGroup(/1 edit/i);

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
    expandGroup(/1 edit/i);

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
    expandGroup(/1 edit/i);

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

    expect(document.body).toHaveTextContent("View 1:24 · src/supervisor/runtime.test.ts");
    expect(screen.getByText('Search · "vitest.mjs"')).toBeInTheDocument();
    expect(screen.getByText("Git · git diff -- src/supervisor/runtime.ts")).toBeInTheDocument();
    expect(screen.getByText("Check · pnpm run test")).toBeInTheDocument();
    expect(screen.getByText("Install packages · pnpm install")).toBeInTheDocument();
  });

  it("cleans and syntax-highlights batched Codex sed views", async () => {
    const threadId = "thread-1";
    const item: RuntimeChatItem = {
      ...makeCommandItem(
        "cmd-batched-view",
        `/bin/zsh -lc "sed -n '1,80p' src/shared/settings.ts; sed -n '570,630p' src/shared/settings.ts"`,
      ),
      streams: {
        command_output: 'import { z } from "zod";\nexport const setting = true;\n',
      },
    };
    seedThread(threadId, [item]);

    const view = renderToolCallGroup(threadId, [item.id]);

    expect(screen.queryByText(";src/shared/settings.ts")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("src/shared/settings.ts"));

    await waitFor(() => {
      expect(view.container.querySelector(".lc-shiki")).toBeInTheDocument();
    });
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

    expect(screen.getByText("github · search")).toBeInTheDocument();
    expect(screen.getAllByText("screen.png").length).toBeGreaterThan(0);
    expect(screen.getByText("Tool search · deploy")).toBeInTheDocument();
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

  it("animates running tool titles without adding status text", () => {
    const threadId = "thread-1";
    const items: RuntimeChatItem[] = [
      { ...makeToolItem("tool-1", "Read file"), state: "started" },
      { ...makeCommandItem("command-1", "pnpm run test"), state: "started" },
      { ...makeFileChangeItem("file-1"), state: "started" },
      {
        ...makeWebSearchItem("web-search-1", { query: "Poracode", status: "running" }),
        state: "started",
      },
    ];
    seedThread(threadId, items);

    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    // Rows with structured titles shimmer only the stable prefix (a <span>);
    // plain titles shimmer the whole <code>. The path segment must never be
    // part of the shimmer — mutating text under background-clip:text ghosts.
    const animatedTitles = Array.from(view.container.querySelectorAll(".poracode-thinking-text"));
    expect(animatedTitles).toHaveLength(4);
    expect(animatedTitles.map((title) => title.getAttribute("data-poracode-shimmer-text"))).toEqual(
      ["Read file", "Check · pnpm run test", "Edit · ", "Poracode"],
    );
    expect(screen.queryByText("Working")).not.toBeInTheDocument();
    expect(view.container.querySelector(".poracode-pixel-loader")).toBeNull();
  });

  it("renders reasoning rows inside the group and counts them in the summary", () => {
    const threadId = "thread-1";
    const items = [
      makeReasoningItem(
        "reasoning-1",
        "Weighing the tradeoffs.\nChoosing the focused change.\nEditing the selector.",
      ),
      makeToolItem("tool-1", "Read file"),
      makeToolItem("tool-2", "Read other file"),
    ];
    seedThread(threadId, items);

    renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    expect(screen.getByText("1 thought")).toBeInTheDocument();
    expect(screen.getByText("2 views")).toBeInTheDocument();
    expect(screen.getByText("Thought")).toBeInTheDocument();
    expect(screen.getByText("Read file")).toBeInTheDocument();
    expect(screen.getByText("Read other file")).toBeInTheDocument();
  });

  it("merges consecutive same-file edits inside a mixed group into one edit row", () => {
    const threadId = "thread-1";
    const items = [
      makeToolItem("tool-1", "Read file one"),
      makeFileChangeItem("file-1", { added: 4, removed: 2 }),
      makeFileChangeItem("file-2", { added: 5, removed: 3 }),
    ];
    seedThread(threadId, items);

    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    // Mixed group auto-expands live; the two consecutive foo.ts edits render
    // as one merged "2 edits: foo.ts" run row next to the view row.
    const viewport = getViewport(view.container);
    expect(viewport.querySelectorAll(":scope > .animate-tool-call-enter")).toHaveLength(2);
    const runRow = screen.getByRole("button", { name: /2 edits:/i });
    expect(within(runRow).getByText("foo.ts")).toBeInTheDocument();
    expect(within(runRow).getByText("+9")).toHaveClass("text-success");
    expect(within(runRow).getByText("-5")).toHaveClass("text-danger");
    expect(screen.getByText("Read file one")).toBeInTheDocument();
  });

  it("merges only the consecutive same-file pair in a multi-file edit run", () => {
    const threadId = "thread-1";
    // Mirrors a real Claude turn: five edits across four files where only the
    // 3rd/4th target the same file back-to-back, followed by a lint command.
    const items = [
      makeFileChangeItem("edit-1", { added: 2, removed: 10 }, "src/a/chatPaneSelectors.ts"),
      makeFileChangeItem("edit-2", { added: 3, removed: 4 }, "src/b/toolCallCategorization.ts"),
      makeFileChangeItem("edit-3", { added: 1, removed: 1 }, "src/a/chatPaneSelectors.test.ts"),
      makeFileChangeItem("edit-4", { added: 7, removed: 5 }, "src/a/chatPaneSelectors.test.ts"),
      makeFileChangeItem(
        "edit-5",
        { added: 1, removed: 2 },
        "src/b/toolCallCategorization.test.ts",
      ),
      makeCommandItem("cmd-1", "pnpm run lint"),
    ];
    seedThread(threadId, items);

    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    // Header keeps physical counts; the run merge is a body-level treatment.
    // The command makes this a mixed group, so it auto-expands while live.
    expect(screen.getByText("5 edits")).toBeInTheDocument();

    // 6 items render as 5 rows: the consecutive same-file pair collapses into
    // one "2 edits: chatPaneSelectors.test.ts" row with the summed diff.
    const viewport = getViewport(view.container);
    expect(viewport.querySelectorAll(":scope > .animate-tool-call-enter")).toHaveLength(5);
    const runRow = screen.getByRole("button", { name: /2 edits:/i });
    expect(within(runRow).getByText("chatPaneSelectors.test.ts")).toBeInTheDocument();
    expect(within(runRow).getByText("+8")).toHaveClass("text-success");
    expect(within(runRow).getByText("-6")).toHaveClass("text-danger");
    expect(screen.getAllByText("chatPaneSelectors.test.ts")).toHaveLength(1);
  });

  it("keeps same-file edits separate when another tool call sits between them", () => {
    const threadId = "thread-1";
    const items = [
      makeFileChangeItem("file-1", { added: 4, removed: 2 }),
      makeToolItem("tool-1", "Read file one"),
      makeFileChangeItem("file-2", { added: 5, removed: 3 }),
    ];
    seedThread(threadId, items);

    const view = renderToolCallGroup(
      threadId,
      items.map((item) => item.id),
    );

    // The interposed tool call breaks the run: no merged "2 edits" row, each
    // edit stays its own row — but all three still live in the same group.
    const viewport = getViewport(view.container);
    expect(viewport.querySelectorAll(":scope > .animate-tool-call-enter")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /2 edits:/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("foo.ts")).toHaveLength(2);
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
    expandGroup(/1 edit/i);
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

function renderToolCallGroup(
  threadId: string,
  itemIds: readonly string[],
  isLive = true,
  onHeightChange?: () => void,
  onVirtualizerLayoutChange?: () => void,
) {
  return render(
    <AppProvider>
      <ToolCallGroup
        threadId={threadId}
        itemIds={itemIds}
        isLive={isLive}
        {...(onHeightChange ? { onHeightChange } : {})}
        {...(onVirtualizerLayoutChange ? { onVirtualizerLayoutChange } : {})}
      />
    </AppProvider>,
  );
}

/** Open a live edit-only group that stays collapsed by default. */
function expandGroup(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
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

function makeReasoningItem(id: string, text: string): RuntimeChatItem {
  return {
    id,
    type: "reasoning",
    state: "completed",
    streams: { reasoning_text: text },
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
      ? "/Users/serhiivecherenko/work/poracode/src/renderer/state/runtimeToolGrouping.ts"
      : "/Users/serhiivecherenko/work/poracode/src/renderer/components/thread/ChatPane/chatPaneSelectors.ts";
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
  const element = container.querySelector(".poracode-tool-call-group-viewport");
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
