import { describe, expect, it } from "vitest";
import { Eye, ImageIcon, Pencil, SearchCode, Terminal } from "lucide-react";
import type { ToolCallPayload } from "@/shared/contracts";
import { deriveToolDisplay, isSubAgentTool } from "./toolDisplay";

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
});
