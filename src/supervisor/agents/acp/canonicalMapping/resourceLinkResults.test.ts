import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { createAcpMapperState, mapAcpSessionUpdate } from "../canonicalMapping";

function note(update: Record<string, unknown>): SessionNotification {
  return { sessionId: "session", update } as SessionNotification;
}

function resourceLink(uri?: string, name?: string) {
  return {
    type: "content",
    content: {
      type: "resource_link",
      ...(uri ? { uri } : {}),
      ...(name ? { name } : {}),
    },
  };
}

function resultFor(
  events: ReturnType<typeof mapAcpSessionUpdate>,
  type: "item.started" | "item.updated" | "item.completed",
  itemId: string,
): unknown {
  const event = events.find((entry) => entry.type === type && entry.itemId === itemId);
  return event && "payload" in event
    ? (event.payload as Record<string, unknown>).result
    : undefined;
}

function openSearch(
  state: ReturnType<typeof createAcpMapperState>,
  toolCallId: string,
  fields: Record<string, unknown> = {},
) {
  return mapAcpSessionUpdate(
    note({
      sessionUpdate: "tool_call",
      toolCallId,
      title: "Find files",
      kind: "search",
      status: "in_progress",
      ...fields,
    }),
    state,
  );
}

describe("ACP search resource-link results", () => {
  it("uses ordered Windows, POSIX, non-file, and name targets on a tool call", () => {
    const state = createAcpMapperState("thread");
    const links = [
      resourceLink("file:///C:/fixture/project/three.md", "ignored.md"),
      resourceLink("file:///home/demo/a%20b.txt", "ignored.txt"),
      resourceLink("https://example.test/search?q=1", "ignored web result"),
      resourceLink(undefined, "named result"),
    ];

    const events = openSearch(state, "call", { content: links });
    const itemId = events.find((event) => event.type === "item.started")!.itemId;

    expect(resultFor(events, "item.started", itemId)).toBe(
      "C:/fixture/project/three.md\n/home/demo/a b.txt\nhttps://example.test/search?q=1\nnamed result",
    );
  });

  it("maps search update links and retains their result through a content-free completion", () => {
    const state = createAcpMapperState("thread");
    const started = openSearch(state, "call");
    const itemId = started.find((event) => event.type === "item.started")!.itemId;
    const links = [
      resourceLink("file:///C:/fixture/project/three.md"),
      resourceLink("file:///C:/fixture/project/a/one.txt"),
    ];

    const updated = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "call",
        status: "in_progress",
        content: links,
      }),
      state,
    );
    expect(resultFor(updated, "item.updated", itemId)).toBe(
      "C:/fixture/project/three.md\nC:/fixture/project/a/one.txt",
    );

    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "call",
        status: "completed",
      }),
      state,
    );
    expect(resultFor(completed, "item.completed", itemId)).toBe(
      "C:/fixture/project/three.md\nC:/fixture/project/a/one.txt",
    );
  });

  it("keeps a hit on a video in the path list instead of turning the search into a video result", () => {
    // A file search reports a matched video like any other hit. The hit is a
    // reference to an existing file, not a clip the search produced.
    const links = [
      resourceLink("file:///C:/fixture/project/a/one.ts"),
      resourceLink("file:///C:/fixture/project/clip.mp4"),
    ];
    const expected = "C:/fixture/project/a/one.ts\nC:/fixture/project/clip.mp4";

    const opened = openSearch(createAcpMapperState("open-thread"), "open", { content: links });
    expect(
      resultFor(
        opened,
        "item.started",
        opened.find((event) => event.type === "item.started")!.itemId,
      ),
    ).toBe(expected);

    const state = createAcpMapperState("update-thread");
    const started = openSearch(state, "update");
    const itemId = started.find((event) => event.type === "item.started")!.itemId;
    const updated = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "update",
        status: "in_progress",
        content: links,
      }),
      state,
    );
    expect(resultFor(updated, "item.updated", itemId)).toBe(expected);
    const completed = mapAcpSessionUpdate(
      note({ sessionUpdate: "tool_call_update", toolCallId: "update", status: "completed" }),
      state,
    );
    expect(resultFor(completed, "item.completed", itemId)).toBe(expected);
  });

  it("still preserves an MCP App resource on a search-kind call", () => {
    const app = {
      type: "resource",
      resource: {
        uri: "ui://fixture/chart",
        mimeType: "text/html;profile=mcp-app",
        text: "<h1>Chart</h1>",
      },
    };
    const hit = resourceLink("file:///C:/fixture/project/clip.mp4");
    const events = openSearch(createAcpMapperState("search-app-thread"), "search-app", {
      content: [{ type: "content", content: app }, hit],
    });
    const itemId = events.find((event) => event.type === "item.started")!.itemId;
    expect(resultFor(events, "item.started", itemId)).toEqual({ content: [app, hit.content] });
  });

  it("leaves a single-shot search's rawOutput hit list in its original shape", () => {
    // Only hits reported in `content` can become the path list. Links carried by
    // `rawOutput` keep the structured result; the renderer keeps them off a player.
    const links = [
      { type: "resource_link", name: "a.ts", uri: "file:///C:/fixture/project/a.ts" },
      { type: "resource_link", name: "clip.mp4", uri: "file:///C:/fixture/project/clip.mp4" },
    ];
    for (const content of [undefined, []]) {
      const events = openSearch(createAcpMapperState("raw-thread"), "raw", {
        status: "completed",
        ...(content ? { content } : {}),
        rawOutput: { content: links },
      });
      const itemId = events.find((event) => event.type === "item.started")!.itemId;
      expect(resultFor(events, "item.started", itemId)).toEqual({ content: links });
    }
  });

  it("prefers text content and preserves substantial raw output", () => {
    const textState = createAcpMapperState("text-thread");
    const links = [resourceLink("file:///C:/fixture/project/result.txt")];
    const textEvents = openSearch(textState, "text-call", {
      content: [
        ...links,
        resourceLink("file:///C:/fixture/project/clip.mp4"),
        { type: "content", content: { type: "text", text: "reported text" } },
      ],
    });
    const textItemId = textEvents.find((event) => event.type === "item.started")!.itemId;
    expect(resultFor(textEvents, "item.started", textItemId)).toBe("reported text");

    const rawState = createAcpMapperState("raw-thread");
    const rawStarted = openSearch(rawState, "raw-call");
    const rawItemId = rawStarted.find((event) => event.type === "item.started")!.itemId;
    const rawEvents = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "raw-call",
        status: "in_progress",
        rawOutput: "raw output",
        content: links,
      }),
      rawState,
    );
    expect(resultFor(rawEvents, "item.updated", rawItemId)).toBe("raw output");
  });

  it("does not use resource links for non-search tool calls", () => {
    const state = createAcpMapperState("other-thread");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "other",
        title: "Inspect",
        kind: "other",
        status: "in_progress",
        content: [resourceLink("file:///C:/fixture/project/result.txt")],
      }),
      state,
    );
    const started = events.find((event) => event.type === "item.started")!;
    expect(started.itemType).toBe("tool_call");
    expect(started.payload).not.toHaveProperty("result");
  });
});
