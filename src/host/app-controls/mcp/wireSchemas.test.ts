import { describe, expect, it } from "vitest";
import {
  ALL_OPERATIONS,
  APP_CONTROLS_MCP_INSTRUCTIONS,
  TOOLS,
  dispatchTool,
  formatToolResult,
  type AppControlsToolContext,
} from "./toolRegistry";
import { compactAppControlInputSchema, summarizeToolDescription } from "./wireSchemas";

describe("app-controls wire schema compaction & context budget", () => {
  it("keeps the advertised MCP surface compact across all providers", () => {
    const advertisedBytes = Buffer.byteLength(JSON.stringify(TOOLS), "utf8");
    expect(TOOLS.length).toBeLessThanOrEqual(25);
    expect(advertisedBytes).toBeLessThan(20_000);
    expect(APP_CONTROLS_MCP_INSTRUCTIONS.length).toBeLessThan(2_600);
  });

  it("compacts repeated nested UI schemas without copy-pasting selectionBinding or crew trees", () => {
    const serializedAll = JSON.stringify(ALL_OPERATIONS);
    expect(serializedAll).not.toContain('"inertValues"');
    expect(serializedAll).not.toContain('"crew-only"');

    const createThread = TOOLS.find((tool) => tool.name === "create_thread")!;
    expect(JSON.stringify(createThread).length).toBeLessThan(2_500);
    expect(createThread.inputSchema.properties).not.toHaveProperty("attachments");
    expect(createThread.inputSchema.properties).not.toHaveProperty("worktree");
    expect(createThread.inputSchema.properties).not.toHaveProperty("browserMcp");
  });

  it("compacts forgeAccount and segments sub-schemas cleanly", () => {
    const schema = compactAppControlInputSchema({
      type: "object",
      properties: {
        forgeAccount: {
          type: "object",
          required: ["forge", "host", "login"],
          properties: {
            forge: { type: "string", enum: ["github", "gitlab"] },
            host: { type: "string", description: "Very long host description..." },
            login: { type: "string", minLength: 1, description: "Very long login description..." },
          },
        },
        segments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["text", "attachment"] },
              path: { type: "string" },
              mimeType: { type: "string" },
            },
          },
        },
      },
    });
    expect(schema.properties).toMatchObject({
      forgeAccount: {
        type: "object",
        required: ["forge", "host", "login"],
      },
      segments: { type: "array" },
    });
  });

  it("preserves screenshot_device multimodal image output when invoked via poracode_read", async () => {
    const ctx = {
      identity: { threadId: "thread-1" },
      getThread: () => ({ id: "thread-1", projectId: "project-1", config: {} }),
      getProject: () => ({ id: "project-1" }),
      settings: { read: () => ({ installedPlugins: {} }) },
      deviceWorkspace: {
        authorizeAgent: () => {},
        agentSession: () => ({ principal: "agent", session: { id: "sess-1" } }),
        frame: async () => ({
          version: 1,
          id: "11111111-1111-4111-8111-111111111111",
          capturedAt: 1_700_000_000_000,
          width: 100,
          height: 200,
          mimeType: "image/jpeg",
          base64: "AAAA",
        }),
      },
    } as unknown as AppControlsToolContext;

    const raw = await dispatchTool(
      "poracode_read",
      { operation: "screenshot_device", params: {} },
      ctx,
    );
    const formatted = formatToolResult("poracode_read", raw);
    expect(formatted).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            version: 1,
            id: "11111111-1111-4111-8111-111111111111",
            capturedAt: 1_700_000_000_000,
            width: 100,
            height: 200,
          }),
        },
        { type: "image", data: "AAAA", mimeType: "image/jpeg" },
      ],
    });
  });

  it("extracts concise one-sentence summaries for discovery rows", () => {
    expect(summarizeToolDescription("First sentence. Second longer sentence.")).toBe(
      "First sentence.",
    );
    expect(summarizeToolDescription("a".repeat(200), 40)).toHaveLength(40);
  });

  it("refuses removed legacy flat create_thread and create_schedule input shapes", async () => {
    const ctx = { identity: { threadId: "thread-1" } } as unknown as AppControlsToolContext;
    await expect(
      dispatchTool(
        "create_thread",
        {
          projectId: "project-1",
          prompt: "x",
          browserMcp: true,
          attachments: [{ path: "/tmp/a.png" }],
          worktree: { enabled: true },
        },
        ctx,
      ),
    ).rejects.toThrow(/unrecognized/i);

    await expect(
      dispatchTool(
        "create_schedule",
        {
          name: "Daily",
          prompt: "x",
          recurrence: { kind: "hourly", minute: 0 },
          model: "gpt-5.6",
          effort: "high",
        },
        ctx,
      ),
    ).rejects.toThrow(/unrecognized/i);
  });
});
