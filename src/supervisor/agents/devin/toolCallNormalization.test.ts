import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import toolCallsFixture from "./fixtures/tool-calls.json";
import { createDevinAcpTransform } from "./acpTransform";
import { normalizeDevinToolCall } from "./toolCallNormalization";

const INFERENCE_TOOL_NAME_META_KEY = "cognition.ai/inferenceToolName";

type ToolCallScenarioName =
  | "readText"
  | "readRange"
  | "readImage"
  | "grepMany"
  | "findMany"
  | "webSearch"
  | "webFetch"
  | "askUserQuestion"
  | "edit"
  | "write";

const scenarios = toolCallsFixture as unknown as Record<
  ToolCallScenarioName,
  SessionNotification[]
>;
const expectedReplayItems: Record<ToolCallScenarioName, Record<string, unknown>[]> = {
  readText: [
    {
      itemType: "tool_call",
      kind: "read",
      locations: expect.any(Array),
      result: undefined,
    },
  ],
  readRange: [
    {
      itemType: "tool_call",
      kind: "read",
      locations: expect.any(Array),
      result: undefined,
    },
  ],
  readImage: [{ images: ["data:image/png;base64,Zm9v"] }],
  grepMany: [
    {
      result: [
        "C:/fixture/project/three.md",
        "C:/fixture/project/a/one.txt",
        "C:/fixture/project/b/two.txt",
        "C:/fixture/project/notes.txt",
      ].join("\n"),
    },
  ],
  findMany: [
    {
      result: [
        "C:/fixture/project/a/one.txt",
        "C:/fixture/project/b/two.txt",
        "C:/fixture/project/notes.txt",
      ].join("\n"),
    },
  ],
  webSearch: [
    {
      result: [
        'Found 5 result(s) for "agent client protocol specification"',
        "https://agentclientprotocol.com/protocol/v2/overview",
        "https://agentclientprotocol.com/protocol/v1/schema",
        "https://agentclientprotocol.com/protocol/v2/initialization",
        "https://github.com/agentclientprotocol/agent-client-protocol/",
        "https://agentclientprotocol.com/protocol/v2/transports",
      ].join("\n"),
    },
  ],
  webFetch: [{ result: "Fetched 157 characters from https://example.com" }],
  askUserQuestion: [],
  edit: [
    {
      itemType: "file_change",
      result: expect.stringMatching(/alpha[\s\S]*omega/),
    },
  ],
  write: [
    {
      itemType: "file_change",
      result: expect.stringContaining("hello"),
    },
  ],
};

function note(update: Record<string, unknown>): SessionNotification {
  return { sessionId: "fixture-session", update } as unknown as SessionNotification;
}

function textContent(text: string) {
  return [{ type: "content", content: { type: "text", text } }];
}

function updateRecord(notification: SessionNotification): Record<string, unknown> {
  return notification.update as unknown as Record<string, unknown>;
}

function normalizedMeta(notification: SessionNotification): Record<string, unknown> {
  const meta = updateRecord(notification)._meta;
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

describe("normalizeDevinToolCall", () => {
  it("removes only completed read line-count summaries", () => {
    const original = note({
      sessionUpdate: "tool_call_update",
      toolCallId: "read",
      status: "completed",
      content: textContent(" 2 lines (truncated) "),
      _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "read", "cognition.ai/timestamp": "stamp" },
    });

    const normalized = normalizeDevinToolCall(original);

    expect(normalized.update).not.toHaveProperty("content");
    expect(normalizedMeta(normalized)).toEqual(normalizedMeta(original));
  });

  it("leaves non-summary, failed, multi-block, and non-read content unchanged", () => {
    const cases = [
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "read-text",
        status: "completed",
        content: textContent("View image .\\pixel.png (2x2)"),
        _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "read" },
      }),
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "read-failed",
        status: "failed",
        content: textContent("5 lines"),
        _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "read" },
      }),
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "read-multiple",
        status: "completed",
        content: [...textContent("5 lines"), ...textContent("extra")],
        _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "read" },
      }),
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "other",
        status: "completed",
        content: textContent("5 lines"),
        _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "write" },
      }),
    ];

    for (const original of cases) expect(normalizeDevinToolCall(original)).toBe(original);
  });

  it("adds a read location from path or file_path only when none is present", () => {
    for (const field of ["path", "file_path"] as const) {
      const original = note({
        sessionUpdate: "tool_call",
        toolCallId: field,
        kind: "read",
        rawInput: { [field]: "C:\\fixture\\project\\shot.png" },
      });
      const normalized = normalizeDevinToolCall(original);
      expect(updateRecord(normalized).locations).toEqual([
        { path: "C:\\fixture\\project\\shot.png" },
      ]);
    }

    const emptyLocation = note({
      sessionUpdate: "tool_call",
      toolCallId: "empty-location",
      kind: "read",
      rawInput: { file_path: "C:\\fixture\\project\\shot.png" },
      locations: [{ path: " " }],
    });
    expect(updateRecord(normalizeDevinToolCall(emptyLocation)).locations).toEqual([
      { path: "C:\\fixture\\project\\shot.png" },
    ]);

    const existingLocation = note({
      sessionUpdate: "tool_call",
      toolCallId: "existing",
      kind: "read",
      rawInput: { path: "C:\\fixture\\project\\shot.png" },
      locations: [{ path: "existing.png" }],
    });
    expect(normalizeDevinToolCall(existingLocation)).toBe(existingLocation);

    const nonRead = note({
      sessionUpdate: "tool_call",
      toolCallId: "other-kind",
      kind: "edit",
      rawInput: { path: "C:\\fixture\\project\\shot.png" },
    });
    expect(normalizeDevinToolCall(nonRead)).toBe(nonRead);
  });

  it("adds the question identity to every question-tool notification and preserves metadata", () => {
    const original = note({
      sessionUpdate: "tool_call_update",
      toolCallId: "question",
      status: "in_progress",
      title: "Asked user Pick a color",
      _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "ask_user_question", "cognition.ai/id": "42" },
    });

    const normalized = normalizeDevinToolCall(original);

    expect(normalizedMeta(normalized)).toMatchObject({
      [INFERENCE_TOOL_NAME_META_KEY]: "ask_user_question",
      "cognition.ai/id": "42",
      toolName: "ask_user_question",
    });
    const other = note({
      sessionUpdate: "tool_call",
      toolCallId: "other",
      _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "read" },
    });
    expect(normalizeDevinToolCall(other)).toBe(other);
  });

  it("appends at most twenty HTTP(S) result URLs after existing content", () => {
    const urls: unknown[] = [
      "https://example.com/one",
      "ftp://example.com/file",
      5,
      "http://example.com/two",
      ...Array.from({ length: 21 }, (_, index) => `https://example.com/${index}`),
    ];
    const original = note({
      sessionUpdate: "tool_call_update",
      toolCallId: "search",
      status: "completed",
      content: textContent('Found results for "query"'),
      _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "web_search", "cognition.ai/resultUrls": urls },
    });

    const normalized = normalizeDevinToolCall(original);
    const content = updateRecord(normalized).content as Array<Record<string, unknown>>;
    const addedBlock = content[1]?.content as Record<string, unknown>;

    expect(content).toHaveLength(2);
    expect((content[0]!.content as Record<string, unknown>).text).toBe('Found results for "query"');
    expect(addedBlock).toMatchObject({
      type: "text",
      text: [
        "https://example.com/one",
        "http://example.com/two",
        ...Array.from({ length: 18 }, (_, index) => `https://example.com/${index}`),
      ].join("\n"),
    });
  });

  it("creates URL content only when valid results exist and leaves other tools untouched", () => {
    const withUrl = normalizeDevinToolCall(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "empty-content",
        status: "completed",
        _meta: {
          [INFERENCE_TOOL_NAME_META_KEY]: "web_search",
          "cognition.ai/resultUrls": ["https://example.com/result"],
        },
      }),
    );
    expect(updateRecord(withUrl).content).toEqual([
      {
        type: "content",
        content: { type: "text", text: "https://example.com/result" },
      },
    ]);

    const noUrls = note({
      sessionUpdate: "tool_call_update",
      toolCallId: "empty",
      status: "completed",
      _meta: {
        [INFERENCE_TOOL_NAME_META_KEY]: "web_search",
        "cognition.ai/resultUrls": ["file:///tmp/a"],
      },
    });
    expect(normalizeDevinToolCall(noUrls)).toBe(noUrls);

    const otherTool = note({
      sessionUpdate: "tool_call_update",
      toolCallId: "fetch",
      status: "completed",
      _meta: {
        [INFERENCE_TOOL_NAME_META_KEY]: "webfetch",
        "cognition.ai/resultUrls": ["https://example.com"],
      },
    });
    expect(normalizeDevinToolCall(otherTool)).toBe(otherTool);
  });
});

describe("captured tool-call mapping", () => {
  it.each([
    "readText",
    "readRange",
    "readImage",
    "grepMany",
    "findMany",
    "webSearch",
    "webFetch",
    "askUserQuestion",
    "edit",
    "write",
  ] as const)("replays %s through the provider transform and shared mapper", (scenarioName) => {
    const state = createAcpMapperState(`thread-${scenarioName}`);
    state.resolveLocalImage = (path) =>
      /^(?:[A-Za-z]:\\|\/)/.test(path) && path.toLowerCase().endsWith(".png")
        ? "data:image/png;base64,Zm9v"
        : undefined;
    const transform = createDevinAcpTransform();
    const events = scenarios[scenarioName].flatMap((notification) =>
      mapAcpSessionUpdate(transform(notification), state),
    );
    const items = new Map<string, { itemType?: string; payload: Record<string, unknown> }>();

    for (const event of events) {
      if (
        (event.type !== "item.started" &&
          event.type !== "item.updated" &&
          event.type !== "item.completed") ||
        !("payload" in event)
      ) {
        continue;
      }
      const previous = items.get(event.itemId);
      items.set(event.itemId, {
        ...(event.type === "item.started"
          ? { itemType: event.itemType }
          : previous?.itemType
            ? { itemType: previous.itemType }
            : {}),
        payload: {
          ...previous?.payload,
          ...(event.payload as Record<string, unknown>),
        },
      });
    }

    const actual = [...items.values()].map((item) => ({
      itemType: item.itemType,
      kind: item.payload.kind,
      result: item.payload.result,
      locations: item.payload.locations,
      images: item.payload.images,
    }));
    expect(actual).toMatchObject(expectedReplayItems[scenarioName]);
  });

  it("recovers an image path from the read shape when a tool_call has no locations", () => {
    const state = createAcpMapperState("view-image-thread");
    state.resolveLocalImage = (path) =>
      path === "C:\\fixture\\project\\shot.png" ? "data:image/png;base64,Zm9v" : undefined;
    const transform = createDevinAcpTransform();
    const started = mapAcpSessionUpdate(
      transform(
        note({
          sessionUpdate: "tool_call",
          toolCallId: "view-image",
          title: "Read file",
          kind: "read",
          rawInput: { path: "C:\\fixture\\project\\shot.png" },
          _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "unverified" },
        }),
      ),
      state,
    );
    const startedItem = started.find((event) => event.type === "item.started")!;
    const itemId = startedItem.itemId;
    expect((startedItem.payload as Record<string, unknown>).locations).toEqual([
      { path: "C:\\fixture\\project\\shot.png" },
    ]);
    const completed = mapAcpSessionUpdate(
      transform(
        note({
          sessionUpdate: "tool_call_update",
          toolCallId: "view-image",
          status: "completed",
          content: textContent("View image .\\shot.png (2x2)"),
          _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "unverified" },
        }),
      ),
      state,
    );
    const payload = completed.find(
      (event) => event.type === "item.completed" && event.itemId === itemId,
    );

    expect(payload && "payload" in payload ? payload.payload : {}).toMatchObject({
      images: ["data:image/png;base64,Zm9v"],
    });
  });
});
