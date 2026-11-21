import { describe, expect, it } from "vitest";
import { Globe, Monitor } from "lucide-react";
import type { AgentSlashCommand } from "@/shared/contracts";
import type { McpMentionItem, PluginMentionItem, ThreadMentionItem } from "./MentionInput";
import { parsePastedTokens } from "./parsePastedTokens";

const goalCommand: AgentSlashCommand = {
  id: "goal",
  label: "goal",
  description: "Set a goal",
};

const planCommand: AgentSlashCommand = {
  id: "plan",
  label: "plan",
  description: "Switch to plan mode",
};

const reviewSkill: AgentSlashCommand = {
  id: "review-code",
  label: "review-code",
  section: "skills",
  skillName: "review-code",
  skillPath: "/skills/review-code/SKILL.md",
  skillInvocation: "$review-code",
  skillProvider: "Shared",
  skillScope: "global",
};

const reviewSkillV2: AgentSlashCommand = {
  id: "review-code-v2",
  label: "review-code-v2",
  section: "skills",
  skillName: "review-code-v2",
  skillPath: "/skills/review-code-v2/SKILL.md",
  skillInvocation: "$review-code-v2",
  skillProvider: "Shared",
  skillScope: "global",
};

const acpSkill: AgentSlashCommand = {
  id: "skill:finalize",
  label: "finalize",
  section: "skills",
  skillName: "finalize",
};

const browserMcp: McpMentionItem = {
  id: "browser",
  name: "Browser",
  icon: Globe,
  detail: "MCP server",
  enabled: true,
};

const disabledComputerUseMcp: McpMentionItem = {
  id: "computer-use",
  name: "Computer Use",
  searchAliases: ["Desktop"],
  icon: Monitor,
  detail: "Computer Use",
  enabled: false,
};

const githubPlugin: PluginMentionItem = {
  id: "github",
  name: "GitHub",
  searchAliases: ["GH"],
  detail: "Plugin",
  enablesMcpServerIds: ["github-mcp"],
  command: {
    id: "github",
    label: "GitHub",
    section: "skills",
    skillName: "github",
    skillPath: "/plugins/github/skills/github/SKILL.md",
    skillInvocation: "$github",
    skillProvider: "GitHub",
    skillScope: "global",
    pluginId: "github",
    pluginName: "GitHub",
  },
};

const sampleThread: ThreadMentionItem = {
  threadId: "thread-abc12345",
  title: "Fix paste badges",
  updatedAt: "2026-11-21T00:00:00Z",
};

const baseOptions = {
  atEditorStart: true,
  startsAtTokenBoundary: true,
  followedByWhitespace: false,
  slashCommands: [goalCommand, planCommand, reviewSkill, reviewSkillV2, acpSkill],
  mcpMentions: [browserMcp, disabledComputerUseMcp],
  pluginMentions: [githubPlugin],
  threadMentions: [sampleThread],
  crewMentions: [{ label: "reviewer" }],
};

describe("parsePastedTokens", () => {
  it("converts leading /goal with or without trailing text", () => {
    expect(parsePastedTokens("/goal", baseOptions)).toEqual({
      pieces: [
        { kind: "slash_command", command: goalCommand },
        { kind: "text", content: " " },
      ],
      enableMcpServerIds: [],
    });

    expect(parsePastedTokens("/goal ship the feature", baseOptions)).toEqual({
      pieces: [
        { kind: "slash_command", command: goalCommand },
        { kind: "text", content: " ship the feature" },
      ],
      enableMcpServerIds: [],
    });

    expect(parsePastedTokens("/goal ", baseOptions)).toEqual({
      pieces: [
        { kind: "slash_command", command: goalCommand },
        { kind: "text", content: " " },
      ],
      enableMcpServerIds: [],
    });
  });

  it("does not convert /goal away from editor start or for unknown commands", () => {
    expect(parsePastedTokens("/goal fix it", { ...baseOptions, atEditorStart: false })).toEqual({
      pieces: [{ kind: "text", content: "/goal fix it" }],
      enableMcpServerIds: [],
    });

    expect(parsePastedTokens("/unknown fix it", baseOptions)).toEqual({
      pieces: [{ kind: "text", content: "/unknown fix it" }],
      enableMcpServerIds: [],
    });

    expect(parsePastedTokens("/Users/me/project/file.ts", baseOptions)).toEqual({
      pieces: [{ kind: "text", content: "/Users/me/project/file.ts" }],
      enableMcpServerIds: [],
    });
  });

  it("converts leading slash-invoked skills including ACP /skill:<name> form", () => {
    expect(parsePastedTokens("/review-code check diff", baseOptions)).toEqual({
      pieces: [
        { kind: "slash_command", command: reviewSkill },
        { kind: "text", content: " check diff" },
      ],
      enableMcpServerIds: [],
    });

    expect(parsePastedTokens("/skill:review-code check diff", baseOptions)).toEqual({
      pieces: [
        { kind: "slash_command", command: reviewSkill },
        { kind: "text", content: " check diff" },
      ],
      enableMcpServerIds: [],
    });

    expect(parsePastedTokens("/finalize", baseOptions)).toEqual({
      pieces: [
        { kind: "slash_command", command: acpSkill },
        { kind: "text", content: " " },
      ],
      enableMcpServerIds: [],
    });
  });

  it("converts inline $skill tokens anywhere and prefers longest match", () => {
    expect(
      parsePastedTokens("Please run $review-code-v2 and $review-code.", {
        ...baseOptions,
        atEditorStart: false,
      }),
    ).toEqual({
      pieces: [
        { kind: "text", content: "Please run " },
        { kind: "slash_command", command: reviewSkillV2 },
        { kind: "text", content: " and " },
        { kind: "slash_command", command: reviewSkill },
        { kind: "text", content: "." },
      ],
      enableMcpServerIds: [],
    });

    expect(parsePastedTokens("keep $PATH, $50, $goal, and foo$review-code", baseOptions)).toEqual({
      pieces: [{ kind: "text", content: "keep $PATH, $50, $goal, and foo$review-code" }],
      enableMcpServerIds: [],
    });
  });

  it("converts @plugin, @mcp, @thread, and @file mentions while keeping @crew and non-paths plain", () => {
    const result = parsePastedTokens(
      "Use @GitHub, @Browser, @Computer Use, @Fix paste badges, @reviewer, and @src/app.ts.",
      baseOptions,
    );
    expect(result).toEqual({
      pieces: [
        { kind: "text", content: "Use " },
        {
          kind: "plugin",
          item: githubPlugin,
          skill: {
            kind: "skill",
            name: "github",
            path: "/plugins/github/skills/github/SKILL.md",
            invocation: "$github",
            provider: "GitHub",
            scope: "global",
            pluginId: "github",
            pluginName: "GitHub",
          },
        },
        { kind: "text", content: ", " },
        { kind: "mcp", item: browserMcp },
        { kind: "text", content: ", " },
        { kind: "mcp", item: disabledComputerUseMcp },
        { kind: "text", content: ", " },
        { kind: "thread", item: sampleThread },
        { kind: "text", content: ", @reviewer, and " },
        { kind: "file", path: "src/app.ts", isDirectory: false },
        { kind: "text", content: "." },
      ],
      enableMcpServerIds: ["github-mcp", "computer-use"],
    });
  });

  it("handles aliases, file extensions colliding with MCP names, balanced parens, and non-mentions", () => {
    expect(
      parsePastedTokens("Check @Browser.tsx and (@src/app/(auth)/page.tsx)", baseOptions),
    ).toEqual({
      pieces: [
        { kind: "text", content: "Check " },
        { kind: "file", path: "Browser.tsx", isDirectory: false },
        { kind: "text", content: " and (" },
        { kind: "file", path: "src/app/(auth)/page.tsx", isDirectory: false },
        { kind: "text", content: ")" },
      ],
      enableMcpServerIds: [],
    });

    expect(
      parsePastedTokens(
        "email me@example.com, install @heroui/react, ask @alice., or @.",
        baseOptions,
      ),
    ).toEqual({
      pieces: [
        {
          kind: "text",
          content: "email me@example.com, install @heroui/react, ask @alice., or @.",
        },
      ],
      enableMcpServerIds: [],
    });

    expect(parsePastedTokens("Use @GH", baseOptions)).toEqual({
      pieces: [
        { kind: "text", content: "Use " },
        {
          kind: "plugin",
          item: githubPlugin,
          skill: {
            kind: "skill",
            name: "github",
            path: "/plugins/github/skills/github/SKILL.md",
            invocation: "$github",
            provider: "GitHub",
            scope: "global",
            pluginId: "github",
            pluginName: "GitHub",
          },
        },
        { kind: "text", content: " " },
      ],
      enableMcpServerIds: ["github-mcp"],
    });
  });

  it("skips tokens inside inline backticks and fenced code blocks", () => {
    const input = [
      "Check `@src/skip.ts` and `$review-code`.",
      "```ts",
      "// @Browser $review-code @src/inside.ts",
      "```",
      "Outside: $review-code @src/outside.ts",
    ].join("\n");

    expect(parsePastedTokens(input, baseOptions)).toEqual({
      pieces: [
        {
          kind: "text",
          content:
            "Check `@src/skip.ts` and `$review-code`.\n```ts\n// @Browser $review-code @src/inside.ts\n```\nOutside: ",
        },
        { kind: "slash_command", command: reviewSkill },
        { kind: "text", content: " " },
        { kind: "file", path: "src/outside.ts", isDirectory: false },
        { kind: "text", content: " " },
      ],
      enableMcpServerIds: [],
    });
  });

  it("omits trailing space when whitespace already follows the paste point", () => {
    expect(parsePastedTokens("/goal", { ...baseOptions, followedByWhitespace: true })).toEqual({
      pieces: [{ kind: "slash_command", command: goalCommand }],
      enableMcpServerIds: [],
    });
  });

  it("does not convert a leading @ or $ token when preceding editor text is mid-word", () => {
    expect(
      parsePastedTokens("@example.com", {
        ...baseOptions,
        atEditorStart: false,
        startsAtTokenBoundary: false,
      }),
    ).toEqual({
      pieces: [{ kind: "text", content: "@example.com" }],
      enableMcpServerIds: [],
    });
  });
});
