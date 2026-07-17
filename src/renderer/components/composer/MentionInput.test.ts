import { createElement, createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Globe, Monitor, Users } from "lucide-react";
import type { PromptSegment } from "@/shared/contracts";
import {
  buildMentionResults,
  MentionInput,
  type McpMentionItem,
  type MentionInputHandle,
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

describe("structured segment insertion", () => {
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
});
