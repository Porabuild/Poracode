import { createElement, createRef } from "react";
import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Globe, Monitor, Users } from "lucide-react";
import type { PromptSegment } from "@/shared/contracts";
import {
  buildMentionResults,
  MentionInput,
  type McpMentionItem,
  type MentionInputHandle,
  type PluginMentionItem,
  type ThreadMentionItem,
} from "./MentionInput";

vi.mock("./MentionPopover", () => ({ MentionPopover: () => null }));

function typeMention(query: string) {
  const editor = screen.getByRole("textbox");
  const text = document.createTextNode(`@${query}`);
  editor.appendChild(text);
  const range = document.createRange();
  range.setStart(text, text.length);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.input(editor);
  return editor;
}

describe("buildMentionResults", () => {
  const fileResults = [{ type: "file" as const, path: "README.md", name: "README.md" }];

  const browser: McpMentionItem = {
    id: "browser",
    name: "Browser",
    icon: Globe,
    detail: "MCP server",
    enabled: false,
  };
  const crossagents: McpMentionItem = {
    id: "crossagents",
    name: "Crossagents",
    icon: Users,
    detail: "MCP server",
    enabled: true,
  };
  const computerUse: McpMentionItem = {
    id: "computer-use",
    name: "Computer Use",
    icon: Monitor,
    detail: "Computer Use",
    enabled: true,
  };
  const github: PluginMentionItem = {
    id: "github",
    name: "GitHub",
    detail: "Plugin",
    command: {
      id: "github",
      label: "GitHub",
      skillName: "github",
      skillPath: "C:\\plugins\\github\\skills\\github\\SKILL.md",
      skillInvocation: "$github",
      skillProvider: "GitHub",
      skillScope: "global",
      pluginId: "github",
      pluginName: "GitHub",
    },
  };

  it("shows a plugin as one result before its underlying MCP and files", () => {
    expect(buildMentionResults(fileResults, "git", [browser], [github])).toEqual([
      {
        type: "plugin",
        path: "github",
        name: "GitHub",
        detail: "Plugin",
        command: github.command,
      },
      ...fileResults,
    ]);
  });

  it("shows Browser when typing an empty @ mention", () => {
    expect(buildMentionResults(fileResults, "", [browser])).toEqual([
      {
        type: "mcp",
        path: "browser",
        name: "Browser",
        icon: Globe,
        detail: "MCP server",
        enabled: false,
      },
      ...fileResults,
    ]);
  });

  it("shows Browser when the query matches browser", () => {
    expect(buildMentionResults(fileResults, "browser", [browser])).toEqual([
      {
        type: "mcp",
        path: "browser",
        name: "Browser",
        icon: Globe,
        detail: "MCP server",
        enabled: false,
      },
      ...fileResults,
    ]);
  });

  it("does not show any MCP mention when the list is empty", () => {
    expect(buildMentionResults(fileResults, "browser", [])).toEqual(fileResults);
    expect(buildMentionResults(fileResults, "browser")).toEqual(fileResults);
  });

  it("filters MCP mentions by case-insensitive name prefix", () => {
    // "browser" does not prefix-match "Crossagents" / "Computer Use".
    expect(
      buildMentionResults(fileResults, "browser", [browser, crossagents, computerUse]),
    ).toEqual([
      {
        type: "mcp",
        path: "browser",
        name: "Browser",
        icon: Globe,
        detail: "MCP server",
        enabled: false,
      },
      ...fileResults,
    ]);
  });

  it("shows Crossagents when the query matches crossagents", () => {
    expect(buildMentionResults(fileResults, "cross", [browser, crossagents])).toEqual([
      {
        type: "mcp",
        path: "crossagents",
        name: "Crossagents",
        icon: Users,
        detail: "MCP server",
        enabled: true,
      },
      ...fileResults,
    ]);
  });

  it("shows Computer Use when the query matches", () => {
    expect(buildMentionResults(fileResults, "computer", [computerUse])).toEqual([
      {
        type: "mcp",
        path: "computer-use",
        name: "Computer Use",
        icon: Monitor,
        detail: "Computer Use",
        enabled: true,
      },
      ...fileResults,
    ]);
  });

  it("matches a stable alias while preserving the localized display name", () => {
    const localizedServer: McpMentionItem = {
      id: "figma-id",
      name: "Фигма",
      searchAliases: ["Figma"],
      icon: Monitor,
      detail: "Фигма",
      enabled: true,
    };

    expect(buildMentionResults([], "fig", [localizedServer])).toEqual([
      {
        type: "mcp",
        path: "figma-id",
        name: "Фигма",
        icon: Monitor,
        detail: "Фигма",
        enabled: true,
      },
    ]);
  });

  it("preserves the caller's order for an empty @ mention", () => {
    expect(buildMentionResults(fileResults, "", [browser, crossagents, computerUse])).toEqual([
      {
        type: "mcp",
        path: "browser",
        name: "Browser",
        icon: Globe,
        detail: "MCP server",
        enabled: false,
      },
      {
        type: "mcp",
        path: "crossagents",
        name: "Crossagents",
        icon: Users,
        detail: "MCP server",
        enabled: true,
      },
      {
        type: "mcp",
        path: "computer-use",
        name: "Computer Use",
        icon: Monitor,
        detail: "Computer Use",
        enabled: true,
      },
      ...fileResults,
    ]);
  });

  it("orders thread mentions after MCPs, matches titles by substring, and caps them", () => {
    const threads: ThreadMentionItem[] = Array.from({ length: 6 }, (_, index) => ({
      threadId: `thread-${index}`,
      title: `Old discussion ${index}`,
      updatedAt: `2026-08-${String(29 - index).padStart(2, "0")}T00:00:00.000Z`,
    }));
    expect(buildMentionResults(fileResults, "discussion", [browser], [github], threads)).toEqual([
      {
        type: "thread",
        path: "thread-0",
        name: "Old discussion 0",
        detail: "thread-0",
      },
      {
        type: "thread",
        path: "thread-1",
        name: "Old discussion 1",
        detail: "thread-1",
      },
      {
        type: "thread",
        path: "thread-2",
        name: "Old discussion 2",
        detail: "thread-2",
      },
      {
        type: "thread",
        path: "thread-3",
        name: "Old discussion 3",
        detail: "thread-3",
      },
      {
        type: "thread",
        path: "thread-4",
        name: "Old discussion 4",
        detail: "thread-4",
      },
      ...fileResults,
    ]);
  });

  it("matches workspace threads by project and disambiguates duplicate titles", () => {
    const results = buildMentionResults(
      [],
      "project beta",
      [],
      [],
      [
        {
          threadId: "thread-duplicate-a",
          title: "Investigate failure",
          updatedAt: "2026-08-29T00:00:00.000Z",
          projectName: "Project Beta",
        },
        {
          threadId: "thread-duplicate-b",
          title: "Investigate failure",
          updatedAt: "2026-08-28T00:00:00.000Z",
          projectName: "Project Beta",
        },
      ],
    );

    expect(results.map((entry) => ("detail" in entry ? entry.detail : undefined))).toEqual([
      "Project Beta · licate-a",
      "Project Beta · licate-b",
    ]);
  });

  it("shows at most three recent threads for an empty query", () => {
    const threads: ThreadMentionItem[] = Array.from({ length: 4 }, (_, index) => ({
      threadId: `thread-${index}`,
      title: `Thread ${index}`,
      updatedAt: `2026-08-${String(29 - index).padStart(2, "0")}T00:00:00.000Z`,
    }));
    expect(buildMentionResults([], "", [], [], threads).map((entry) => entry.path)).toEqual([
      "thread-0",
      "thread-1",
      "thread-2",
    ]);
  });

  it("matches threads by worktree name and displays full worktree name in detail", () => {
    const results = buildMentionResults(
      [],
      "gpu-support",
      [],
      [],
      [
        {
          threadId: "thread-gpu",
          title: "Add full GPU support for macOS and Linux",
          updatedAt: "2026-08-29T00:00:00.000Z",
          worktreeName: "poracode-feature-gpu-support-b127b363",
        },
        {
          threadId: "thread-gpu-ws",
          title: "Add full GPU support for macOS and Linux",
          updatedAt: "2026-08-29T00:00:00.000Z",
          projectName: "Lightcode",
          worktreeName: "poracode-feature-gpu-support-b127b363",
        },
      ],
    );

    expect(results).toEqual([
      {
        type: "thread",
        path: "thread-gpu",
        name: "Add full GPU support for macOS and Linux",
        detail: "poracode-feature-gpu-support-b127b363",
      },
      {
        type: "thread",
        path: "thread-gpu-ws",
        name: "Add full GPU support for macOS and Linux",
        detail: "Lightcode · poracode-feature-gpu-support-b127b363",
      },
    ]);
  });

  it("does not match short hex queries against thread ids over title matches", () => {
    const results = buildMentionResults(
      [],
      "ed",
      [],
      [],
      [
        {
          threadId: "b1ededed-2222-4333-8444-555555555555",
          title: "Worktree sync task",
          updatedAt: "2026-08-29T10:00:00.000Z",
        },
        {
          threadId: "aaaaaaaa-1111-4222-8333-666666666666",
          title: "Editor polish",
          updatedAt: "2026-08-29T09:00:00.000Z",
        },
      ],
    );

    expect(results).toEqual([
      {
        type: "thread",
        path: "aaaaaaaa-1111-4222-8333-666666666666",
        name: "Editor polish",
        detail: "66666666",
      },
    ]);
  });

  it("matches thread ids once the query is long enough", () => {
    const results = buildMentionResults(
      [],
      "66666666",
      [],
      [],
      [
        {
          threadId: "aaaaaaaa-1111-4222-8333-666666666666",
          title: "Something else",
          updatedAt: "2026-08-29T10:00:00.000Z",
        },
      ],
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe("aaaaaaaa-1111-4222-8333-666666666666");
  });

  it("inserts a thread mention chip that round-trips its title and id", () => {
    const ref = createRef<MentionInputHandle>();
    render(
      createElement(MentionInput, {
        ...{
          placeholder: "Send a message...",
          projectLocation: undefined,
          onTextChange: vi.fn<(hasText: boolean) => void>(),
          onSubmit: vi.fn<(segments: PromptSegment[]) => void>(),
        },
        ref,
        threadMentions: [
          {
            threadId: "thread-1",
            title: "Fix the composer",
            updatedAt: "2026-08-29T00:00:00.000Z",
          },
        ],
      }),
    );

    const editor = typeMention("composer");
    fireEvent.keyDown(editor, { key: "Enter" });

    const chip = editor.querySelector("[data-thread-mention-id]");
    expect(chip).not.toBeNull();
    expect(chip).toHaveAttribute("data-thread-mention-id", "thread-1");
    expect(chip).toHaveAttribute("data-thread-mention-title", "Fix the composer");
    expect(chip).toHaveClass("poracode-thread-mention-chip");
    expect(chip).toHaveAttribute("title", "Fix the composer");
    expect(ref.current?.serializeSegments()).toEqual([
      { kind: "thread", threadId: "thread-1", title: "Fix the composer" },
      { kind: "text", content: " " },
    ]);
  });
});

describe("MCP mention selection", () => {
  const baseProps = {
    placeholder: "Send a message...",
    projectLocation: undefined,
    onTextChange: vi.fn<(hasText: boolean) => void>(),
    onSubmit: vi.fn<(segments: PromptSegment[]) => void>(),
  };

  it("inserts an enabled MCP mention as a badge that flattens to the agent directive", () => {
    const onMcpMentionSelect = vi.fn<(id: string) => void>();
    const ref = createRef<MentionInputHandle>();
    render(
      createElement(MentionInput, {
        ...baseProps,
        ref,
        mcpMentions: [
          {
            id: "browser",
            name: "Browser",
            icon: Globe,
            detail: "MCP server",
            enabled: true,
          },
        ],
        onMcpMentionSelect,
      }),
    );

    const editor = typeMention("bro");
    fireEvent.keyDown(editor, { key: "Enter" });

    const chip = editor.querySelector("[data-mcp-name]");
    expect(chip).not.toBeNull();
    expect(chip).toHaveAttribute("data-mcp-id", "browser");
    expect(chip).toHaveAttribute("data-mcp-name", "Browser");
    // The badge still flattens to the `@Browser` directive the agent reads.
    expect(ref.current?.serialize()).toBe("@Browser");
    expect(onMcpMentionSelect).not.toHaveBeenCalled();
  });

  it("enables a disabled MCP without adding prompt text", () => {
    const onMcpMentionSelect = vi.fn<(id: string) => void>();
    render(
      createElement(MentionInput, {
        ...baseProps,
        mcpMentions: [
          {
            id: "browser",
            name: "Browser",
            icon: Globe,
            detail: "MCP server",
            enabled: false,
          },
        ],
        onMcpMentionSelect,
      }),
    );

    const editor = typeMention("bro");
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(editor).toBeEmptyDOMElement();
    expect(onMcpMentionSelect).toHaveBeenCalledWith("browser");
  });
});

describe("plugin mention selection", () => {
  it("inserts one plugin badge that preserves the core skill and plugin identity", () => {
    const ref = createRef<MentionInputHandle>();
    render(
      createElement(MentionInput, {
        ref,
        placeholder: "Send a message...",
        projectLocation: undefined,
        onTextChange: vi.fn<(hasText: boolean) => void>(),
        onSubmit: vi.fn<(segments: PromptSegment[]) => void>(),
        pluginMentions: [
          {
            id: "github",
            name: "GitHub",
            detail: "Plugin",
            command: {
              id: "github",
              label: "GitHub",
              skillName: "github",
              skillPath: "C:\\plugins\\github\\skills\\github\\SKILL.md",
              skillInvocation: "$github",
              skillProvider: "GitHub",
              skillScope: "global",
              pluginId: "github",
              pluginName: "GitHub",
            },
          },
        ],
      }),
    );

    const editor = typeMention("git");
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(editor.querySelector('[data-plugin-id="github"]')).toHaveTextContent("GitHub");
    expect(editor.querySelector('[data-plugin-id="github"]')).toHaveAttribute(
      "aria-label",
      "GitHub",
    );
    expect(ref.current?.serializeSegments()).toEqual([
      {
        kind: "skill",
        name: "github",
        path: "C:\\plugins\\github\\skills\\github\\SKILL.md",
        invocation: "$github",
        provider: "GitHub",
        scope: "global",
        pluginId: "github",
        pluginName: "GitHub",
      },
      { kind: "text", content: " " },
    ]);
  });

  it("turns on the built-in servers whose mention rows the plugin replaces", () => {
    const onMcpMentionSelect = vi.fn<(id: string) => void>();
    render(
      createElement(MentionInput, {
        placeholder: "Send a message...",
        projectLocation: undefined,
        onTextChange: vi.fn<(hasText: boolean) => void>(),
        onSubmit: vi.fn<(segments: PromptSegment[]) => void>(),
        onMcpMentionSelect,
        pluginMentions: [
          {
            id: "browser-tools",
            name: "Browser",
            enablesMcpServerIds: ["browser"],
            command: {
              id: "browser-control",
              label: "Browser Control",
              skillName: "browser-control",
              skillPath: String.raw`C:\plugins\browser-tools\skills\browser-control\SKILL.md`,
              skillInvocation: "$browser-control",
              skillProvider: "Browser",
              skillScope: "global",
              pluginId: "browser-tools",
              pluginName: "Browser",
            },
          },
        ],
      }),
    );

    const editor = typeMention("bro");
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(editor.querySelector('[data-plugin-id="browser-tools"]')).not.toBeNull();
    expect(onMcpMentionSelect).toHaveBeenCalledWith("browser");
  });
});

describe("Enter handling", () => {
  const baseProps = {
    placeholder: "Send a message...",
    projectLocation: undefined,
    onTextChange: vi.fn<(hasText: boolean) => void>(),
  };

  it("submits with Enter by default", () => {
    const onSubmit = vi.fn<(segments: PromptSegment[]) => void>();
    render(
      createElement(MentionInput, {
        ...baseProps,
        onSubmit,
      }),
    );

    const editor = screen.getByRole("textbox");
    editor.appendChild(document.createTextNode("hello"));
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith([{ kind: "text", content: "hello" }]);
  });

  it("leaves Enter available for newline insertion when submitOnEnter is false", () => {
    const onSubmit = vi.fn<(segments: PromptSegment[]) => void>();
    render(
      createElement(MentionInput, {
        ...baseProps,
        onSubmit,
        submitOnEnter: false,
      }),
    );

    const editor = screen.getByRole("textbox");
    editor.appendChild(document.createTextNode("hello"));
    const event = createEvent.keyDown(editor, { key: "Enter" });
    fireEvent(editor, event);

    expect(event.defaultPrevented).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("structured segment insertion", () => {
  it("renders and restores multiple diff-comment badges", () => {
    const ref = createRef<MentionInputHandle>();
    const comments: PromptSegment[] = [
      {
        kind: "diff_comment",
        path: "src/a.ts",
        lineNumber: 12,
        side: "new",
        staged: false,
        body: "Keep this guard.",
      },
      { kind: "text", content: "\n\n" },
      {
        kind: "diff_comment",
        path: "src/b.ts",
        lineNumber: 7,
        side: "old",
        staged: true,
        body: "Why was this removed?",
      },
    ];
    render(
      createElement(MentionInput, {
        ref,
        placeholder: "Send a message...",
        projectLocation: undefined,
        onTextChange: vi.fn<(hasText: boolean) => void>(),
        onSubmit: vi.fn<(segments: PromptSegment[]) => void>(),
      }),
    );

    act(() => ref.current?.restoreFromSegments(comments));

    expect(screen.getByRole("textbox").querySelectorAll("[data-diff-comment-path]")).toHaveLength(
      2,
    );
    expect(ref.current?.serializeSegments()).toEqual(comments);
  });

  it("deletes a diff-comment badge with Backspace", () => {
    const ref = createRef<MentionInputHandle>();
    render(
      createElement(MentionInput, {
        ref,
        placeholder: "Send a message...",
        projectLocation: undefined,
        onTextChange: vi.fn<(hasText: boolean) => void>(),
        onSubmit: vi.fn<(segments: PromptSegment[]) => void>(),
      }),
    );

    act(() => {
      ref.current?.restoreFromSegments([
        {
          kind: "diff_comment",
          path: "src/a.ts",
          lineNumber: 3,
          side: "new",
          staged: false,
          body: "Need a check",
        },
      ]);
    });

    const editor = screen.getByRole("textbox");
    const chip = editor.querySelector("[data-diff-comment-path]");
    expect(chip).not.toBeNull();
    const selection = window.getSelection();
    expect(selection).not.toBeNull();
    const range = document.createRange();
    const safeSelection = selection!;
    const safeChip = chip!;
    range.setStartAfter(safeChip);
    range.collapse(true);
    safeSelection.removeAllRanges();
    safeSelection.addRange(range);

    fireEvent.keyDown(editor, { key: "Backspace" });

    expect(editor.querySelector("[data-diff-comment-path]")).toBeNull();
    expect(ref.current?.serializeSegments()).toEqual([]);
  });

  it("inserts a seeded skill directly without requiring a caret trigger", () => {
    const ref = createRef<MentionInputHandle>();
    render(
      createElement(MentionInput, {
        ref,
        placeholder: "Send a message...",
        projectLocation: undefined,
        onTextChange: vi.fn<(hasText: boolean) => void>(),
        onSubmit: vi.fn<(segments: PromptSegment[]) => void>(),
      }),
    );

    act(() => {
      ref.current?.insertSegments([
        {
          kind: "skill",
          name: "skill-creator",
          path: "/bundled/skill-creator/SKILL.md",
          invocation: "Use the skill-creator skill.",
          provider: "Codex",
          scope: "global",
        },
        { kind: "text", content: " Create a managed skill." },
      ]);
    });

    expect(
      screen.getByRole("textbox").querySelector('[data-slash-command="skill-creator"]'),
    ).not.toBeNull();
    expect(ref.current?.serializeSegments()).toEqual([
      {
        kind: "skill",
        name: "skill-creator",
        path: "/bundled/skill-creator/SKILL.md",
        invocation: "Use the skill-creator skill.",
        provider: "Codex",
        scope: "global",
      },
      { kind: "text", content: " Create a managed skill." },
    ]);
  });

  it("can append segments without stealing focus", () => {
    const ref = createRef<MentionInputHandle>();
    render(
      createElement(MentionInput, {
        ref,
        placeholder: "Send a message...",
        projectLocation: undefined,
        onTextChange: vi.fn<(hasText: boolean) => void>(),
        onSubmit: vi.fn<(segments: PromptSegment[]) => void>(),
      }),
    );
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    act(() => {
      ref.current?.insertSegments([{ kind: "text", content: "review note" }], {
        atEnd: true,
        focus: false,
      });
    });

    expect(ref.current?.serialize()).toBe("review note");
    expect(outside).toHaveFocus();
    outside.remove();
  });
});
