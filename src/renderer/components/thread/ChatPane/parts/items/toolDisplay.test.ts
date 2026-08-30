import { describe, expect, it } from "vitest";
import { Eye, GitBranch, ImageIcon, Pencil, SearchCode, Sparkles, Terminal } from "lucide-react";
import type { ToolCallPayload } from "@/shared/contracts";
import { isCrossagentSpawnAgentTool } from "@/shared/toolCallClassification";
import {
  deriveToolDisplay,
  isCrossagentTool,
  isDelegatedAgentTool,
  isSubAgentTool,
} from "./toolDisplay";

function makePayload(payload: Partial<ToolCallPayload>): ToolCallPayload {
  return {
    name: "tool",
    status: "success",
    ...payload,
  } as ToolCallPayload;
}

describe("deriveToolDisplay", () => {
  it("labels ACP read tools from kind plus a path-like title", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "src/renderer/components/thread/ChatPane/parts/items/UserMessage.tsx",
        title: "src/renderer/components/thread/ChatPane/parts/items/UserMessage.tsx",
        kind: "read",
      }),
    );

    expect(display.title).toBe(
      "View: src/renderer/components/thread/ChatPane/parts/items/UserMessage.tsx",
    );
    expect(display.parts).toEqual({
      prefix: "View: ",
      path: "src/renderer/components/thread/ChatPane/parts/items/UserMessage.tsx",
      filePath: true,
    });
    expect(display.Icon).toBe(Eye);
  });

  it("labels ACP edit tools from a Gemini symbol-edit title", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "src/renderer/notifications.ts: function showToast => function showToast",
        title: "src/renderer/notifications.ts: function showToast => function showToast",
        kind: "edit",
      }),
    );

    expect(display.title).toBe("Edit: src/renderer/notifications.ts");
    expect(display.parts).toEqual({
      prefix: "Edit: ",
      path: "src/renderer/notifications.ts",
      filePath: true,
    });
    expect(display.Icon).toBe(Pencil);
  });

  it("labels ACP edit tools from apply_patch patchText args", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "apply_patch",
        title: "apply_patch",
        kind: "edit",
        args: {
          patchText: [
            "*** Begin Patch",
            "*** Update File: src/renderer/notifications.ts",
            "@@",
            "-before",
            "+after",
            "*** End Patch",
          ].join("\n"),
        },
      }),
    );

    expect(display.title).toBe("Edit: src/renderer/notifications.ts");
    expect(display.parts).toEqual({
      prefix: "Edit: ",
      path: "src/renderer/notifications.ts",
      filePath: true,
    });
    expect(display.Icon).toBe(Pencil);
  });

  it("labels ACP local search tools with only the query", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "'attachment' in src/renderer/**",
        title: "'attachment' in src/renderer/**",
        kind: "search",
        args: { query: "attachment", path: "src/renderer/**" },
      }),
    );

    expect(display.title).toBe('Search: "attachment"');
    expect(display.parts).toBeUndefined();
    expect(display.Icon).toBe(SearchCode);
  });

  it("does not treat search patterns containing image as image tools", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: String.raw`\"document\"|\"image\"|\"other\" in src`,
        title: String.raw`\"document\"|\"image\"|\"other\" in src`,
        kind: "search",
        args: { pattern: String.raw`\"document\"|\"image\"|\"other\"`, path: "src" },
      }),
    );

    expect(display.title).toBe(String.raw`Search: "\"document\"|\"image\"|\"other\""`);
    expect(display.parts).toBeUndefined();
    expect(display.Icon).toBe(SearchCode);
  });

  it("still labels explicit image tools as image rows", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "ViewImage",
        args: { path: "screen.png" },
      }),
    );

    expect(display.title).toBe("Image: screen.png");
    expect(display.parts).toEqual({ prefix: "Image: ", path: "screen.png", filePath: true });
    expect(display.Icon).toBe(ImageIcon);
  });

  it("labels Codex imageView tools as image rows", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "imageView",
        args: { path: "screen.png" },
      }),
    );

    expect(display.title).toBe("Image: screen.png");
    expect(display.parts).toEqual({ prefix: "Image: ", path: "screen.png", filePath: true });
    expect(display.Icon).toBe(ImageIcon);
  });

  it("normalizes Claude raw read tools to view file displays", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "Read",
        args: { file_path: "src/foo.ts" },
      }),
    );

    expect(display.title).toBe("View: src/foo.ts");
    expect(display.parts).toEqual({ prefix: "View: ", path: "src/foo.ts", filePath: true });
    expect(display.Icon).toBe(Eye);
  });

  it("normalizes skill file reads to skill displays", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "Read",
        args: { file_path: String.raw`C:\Users\sdsle\.codex\skills\.system\imagegen\SKILL.md` },
      }),
    );

    expect(display.title).toBe("Skill: imagegen");
    expect(display.parts).toBeUndefined();
    expect(display.Icon).toBe(Sparkles);
  });

  it("includes line ranges for read tools that provide offsets", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "src/foo.ts",
        title: "src/foo.ts",
        kind: "read",
        locations: [{ path: "src/foo.ts" }],
        args: { filePath: "src/foo.ts", offset: 1051, limit: 80 },
      }),
    );

    expect(display.title).toBe("View 1051:1130: src/foo.ts");
    expect(display.parts).toEqual({
      prefix: "View 1051:1130: ",
      path: "src/foo.ts",
      filePath: true,
    });
    expect(display.Icon).toBe(Eye);
  });

  it("uses the dominant persisted summary category for compacted tool runs", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "2 commands, 1 edit",
      }),
    );

    expect(display.title).toBe("2 commands, 1 edit");
    expect(display.Icon).toBe(Terminal);
  });

  it("recognizes Copilot-style subagent payloads", () => {
    const payload = makePayload({
      name: "Critiquing path fixes",
      title: "Critiquing path fixes",
      isSubAgent: true,
      args: {
        description: "Critiquing path fixes",
        agent_type: "rubber-duck",
        name: "path-fix-duck",
        prompt: "We need to get a clean green run.",
      },
    });

    expect(isSubAgentTool(payload)).toBe(true);
    expect(deriveToolDisplay(payload).title).toBe("Agent (rubber-duck): Critiquing path fixes");
  });

  it("labels a resumed sub-agent distinctly from a fresh launch", () => {
    // Claude Code's SendMessage resuming an agent: the args name the agent, not
    // the run, so the provider supplies the send's summary plus the type.
    const payload = makePayload({
      name: "SendMessage",
      title: "list repo files",
      subAgentType: "general-purpose",
      isSubAgent: true,
      isSubAgentResume: true,
      args: { to: "af31fc7876375a53a", message: "…", summary: "list repo files" },
    });

    expect(isSubAgentTool(payload)).toBe(true);
    expect(deriveToolDisplay(payload).title).toBe(
      "Agent Resume (general-purpose): list repo files",
    );
  });

  it("does not label a fresh Agent launch as a resume", () => {
    const payload = makePayload({
      name: "Agent",
      isSubAgent: true,
      args: { description: "probe worker alpha", subagent_type: "general-purpose" },
    });

    expect(deriveToolDisplay(payload).title).toBe("Agent (general-purpose): probe worker alpha");
  });

  it("keeps Crossagents distinct from native subagents", () => {
    const payload = makePayload({
      name: "Critiquing path fixes",
      isCrossagent: true,
      args: {
        description: "Critiquing path fixes",
        agent_type: "rubber-duck",
      },
    });

    expect(isCrossagentTool(payload)).toBe(true);
    expect(isSubAgentTool(payload)).toBe(false);
    expect(isDelegatedAgentTool(payload)).toBe(true);
    expect(deriveToolDisplay(payload).title).toBe(
      "Crossagent (rubber-duck): Critiquing path fixes",
    );
  });

  it("drops the kind prefix from bare agent titles used by grouped docks", () => {
    const crossagent = makePayload({
      name: "Drive collection closures — Factory Droid · DeepSeek V4 Flash 0731 (Droid Core) - High",
      isCrossagent: true,
    });
    expect(deriveToolDisplay(crossagent).title).toBe(
      "Crossagent: Drive collection closures — Factory Droid · DeepSeek V4 Flash 0731 (Droid Core) - High",
    );
    expect(deriveToolDisplay(crossagent, { bareAgentTitle: true }).title).toBe(
      "Drive collection closures — Factory Droid · DeepSeek V4 Flash 0731 (Droid Core) - High",
    );

    const subagent = makePayload({
      name: "probe worker alpha",
      isSubAgent: true,
      args: { subagent_type: "general-purpose" },
    });
    expect(deriveToolDisplay(subagent, { bareAgentTitle: true }).title).toBe("probe worker alpha");

    const claudeTask = makePayload({
      name: "Task",
      isSubAgent: true,
      args: { subagent_type: "general-purpose" },
    });
    expect(deriveToolDisplay(claudeTask, { bareAgentTitle: true }).title).toBe("general-purpose");
  });

  it("recognizes Claude Workflow tool calls as background work", () => {
    const payload = makePayload({
      name: "Workflow",
      args: { description: "Run the release checklist" },
    });

    expect(isSubAgentTool(payload)).toBe(true);
    const display = deriveToolDisplay(payload);
    expect(display.title).toBe("Workflow: Run the release checklist");
    expect(display.Icon).toBe(GitBranch);
  });

  it("does not treat any Crossagents MCP call as the agent itself", () => {
    for (const tool of [
      "list_agents",
      "get_agent",
      "spawn_agent",
      "run_agent",
      "wait_for_agent",
      "get_status",
      "cancel",
      "create_thread",
      "wait_for_thread",
    ]) {
      expect(
        isSubAgentTool(
          makePayload({
            name: `mcp__crossagents__${tool}`,
            isSubAgent: true,
          }),
        ),
      ).toBe(false);
    }
    expect(
      isSubAgentTool(
        makePayload({ name: "spawn_agent", serverId: "crossagents", isSubAgent: true }),
      ),
    ).toBe(false);
  });

  it.each([
    ["mcp__crossagents__run_agent", undefined, true],
    ["mcp__crossagents__spawn_agent", undefined, true],
    ["crossagents-mcp-server-run_agent", undefined, true],
    ["crossagents-mcp-server-spawn_agent", undefined, true],
    ["crossagents__run_agent", undefined, true],
    ["crossagents__spawn_agent", undefined, true],
    ["crossagents_run_agent", undefined, true],
    ["crossagents_spawn_agent", undefined, true],
    ["run_agent", "crossagents", true],
    ["spawn_agent", "crossagents", true],
    ["mcp__other__run_agent", undefined, false],
    ["mcp__crossagents__list_agents", undefined, false],
  ])("classifies the Crossagents spawn transport %s", (name, serverId, expected) => {
    expect(
      isCrossagentSpawnAgentTool(makePayload({ name, ...(serverId ? { serverId } : {}) })),
    ).toBe(expected);
  });

  it("labels Droid ApplyPatch as edit even when kind is other", () => {
    const display = deriveToolDisplay(
      makePayload({
        name: "ApplyPatch",
        title: "ApplyPatch",
        kind: "other",
        args: {
          patch: [
            "*** Begin Patch",
            "*** Update File: src/renderer/notifications.ts",
            "@@",
            "-before",
            "+after",
            "*** End Patch",
          ].join("\n"),
        },
      }),
    );

    expect(display.title).toBe("Edit: src/renderer/notifications.ts");
    expect(display.parts).toEqual({
      prefix: "Edit: ",
      path: "src/renderer/notifications.ts",
      filePath: true,
    });
    expect(display.Icon).toBe(Pencil);
  });

  it("prefers live ACP subagent update titles over the launch description", () => {
    const payload = makePayload({
      name: "Reading README.md",
      title: "Reading README.md",
      isSubAgent: true,
      args: {
        description: "Explore worktree watcher",
        subagent_type: "worker",
        prompt: "Trace watcher flow",
      },
    });

    expect(deriveToolDisplay(payload).title).toBe("Agent (worker): Reading README.md");
  });
});
