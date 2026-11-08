import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { createAcpMapperState, mapAcpSessionUpdate } from "../../acp/canonicalMapping";
import { createDevinAcpTransform } from "../acpTransform";
import streamed from "../fixtures/subagent-background-streamed.json";
import { DevinSubagentLaunchOrder } from "./subagentLaunchOrder";

const notifications = streamed.notifications as SessionNotification[];
const ALPHA_CALL = "toolu_018J793gKGA4PgDWPUPt42Bo";
const BETA_CALL = "toolu_01UT396QEK91L1A4nnz45s52";
const ALPHA_AGENT = "690c8a5e";
const BETA_AGENT = "bdb98482";
const LEAD_MESSAGE = "e1f6ca5a-236c-4dc7-9e99-2b8b9382371c";

type Meta = Record<string, { agentId?: string; parentAgentId?: string } | string | undefined>;
const metaOf = (notification: SessionNotification) =>
  ((notification.update as { _meta?: Meta })._meta ?? {}) as Meta;
const textOf = (notification: SessionNotification) =>
  (notification.update as { content?: { text?: string } }).content?.text ?? "";
const isAcknowledgement = (notification: SessionNotification, toolCallId: string) =>
  notification.update.sessionUpdate === "tool_call_update" &&
  notification.update.toolCallId === toolCallId &&
  notification.update.status === "completed";
const isStart = (notification: SessionNotification, agentId: string) =>
  (metaOf(notification)["cognition.ai/subagent_started"] as { agentId?: string } | undefined)
    ?.agentId === agentId;

/** Mirrors the shared session: a source sees raw updates first, ingest maps them. */
function replay(input: readonly SessionNotification[], replaying = false) {
  const transform = createDevinAcpTransform();
  const state = createAcpMapperState("thread");
  const events: RuntimeEvent[] = [];
  const map = (notification: SessionNotification) => {
    events.push(...mapAcpSessionUpdate(transform(notification), state));
  };
  const source = new DevinSubagentLaunchOrder(
    map,
    (toolCallId) => transform.awaitsNativeStart(toolCallId),
    () => replaying,
  );
  const feed = (notification: SessionNotification) => {
    if (!source.onSessionUpdate(notification)) map(notification);
  };
  for (const notification of input) feed(notification);
  return { events, source, feed };
}

type Payload = { args?: unknown; title?: unknown } | undefined;

function items(events: readonly RuntimeEvent[]) {
  const byId = new Map<
    string,
    {
      itemId: string;
      itemType: string;
      parentItemId?: string;
      text: string;
      args?: unknown;
      title?: unknown;
    }
  >();
  for (const event of events) {
    if (event.type === "item.started") {
      byId.set(event.itemId, {
        itemId: event.itemId,
        itemType: event.itemType,
        ...(event.parentItemId ? { parentItemId: event.parentItemId } : {}),
        text: "",
        args: (event.payload as Payload)?.args,
        title: (event.payload as Payload)?.title,
      });
    } else if (event.type === "content.delta") {
      const item = byId.get(event.itemId);
      if (item) item.text += event.delta;
    } else if (event.type === "item.updated" || event.type === "item.completed") {
      const item = byId.get(event.itemId);
      const payload = event.payload as Payload;
      if (item && payload?.args) item.args = payload.args;
      if (item && payload?.title) item.title = payload.title;
    }
  }
  return [...byId.values()];
}

const cardFor = (all: ReturnType<typeof items>, title: string) =>
  all.find(
    (item) =>
      item.itemType === "tool_call" &&
      (item.args as { description?: unknown } | undefined)?.description === title,
  );

describe("Devin parallel background launches (3000.12.28 wire)", () => {
  it("captures a launch acknowledged before its native start", () => {
    const acknowledged = notifications.findIndex((note) => isAcknowledgement(note, BETA_CALL));
    const started = notifications.findIndex((note) => isStart(note, BETA_AGENT));
    expect(acknowledged).toBeGreaterThan(-1);
    expect(started).toBeGreaterThan(acknowledged);
  });

  it("keeps both children under their own cards and the lead transcript whole", () => {
    const { events } = replay(notifications);
    const all = items(events);
    const alpha = cardFor(all, "Capture alpha");
    const beta = cardFor(all, "Capture beta");
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    for (const card of [alpha!, beta!]) expect(card).not.toHaveProperty("parentItemId");

    const childText = (agentId: string, sessionUpdate: string) =>
      notifications
        .filter(
          (note) =>
            note.update.sessionUpdate === sessionUpdate &&
            (metaOf(note)["cognition.ai/subagent_context"] as { parentAgentId?: string })
              ?.parentAgentId === agentId,
        )
        .map(textOf)
        .join("");
    const child = (text: string) => all.find((item) => item.text === text);
    for (const [agentId, card] of [
      [ALPHA_AGENT, alpha!],
      [BETA_AGENT, beta!],
    ] as const) {
      for (const sessionUpdate of ["agent_thought_chunk", "agent_message_chunk"]) {
        const text = childText(agentId, sessionUpdate);
        expect(text.length).toBeGreaterThan(0);
        expect(child(text)?.parentItemId).toBe(card.itemId);
      }
    }

    const lead = notifications
      .filter(
        (note) =>
          note.update.sessionUpdate === "agent_message_chunk" &&
          metaOf(note)["cognition.ai/streamingMessageId"] === LEAD_MESSAGE,
      )
      .map(textOf)
      .join("");
    const root = all.filter((item) => !item.parentItemId);
    expect(
      root.filter((item) => item.itemType === "assistant_message").map((item) => item.text),
    ).toEqual([lead, "DONE"]);
    expect(root.filter((item) => item.itemType === "reasoning")).toHaveLength(1);
  });

  it("completes the late-bound card with its report, not the launch receipt", () => {
    const { events } = replay(notifications);
    const all = items(events);
    const beta = cardFor(all, "Capture beta")!;
    const completions = events.filter(
      (event) => event.type === "item.completed" && event.itemId === beta.itemId,
    );
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({
      payload: { subAgentStatus: "completed", result: expect.stringContaining("## Refrigerators") },
    });
    const betaChildren = new Set(
      all.filter((item) => item.parentItemId === beta.itemId).map((item) => item.itemId),
    );
    const lastChildDelta = events.findLastIndex(
      (event) => event.type === "content.delta" && betaChildren.has(event.itemId),
    );
    expect(events.indexOf(completions[0]!)).toBeGreaterThan(lastChildDelta);
  });

  it("names each card once with its own title while the launch input streams", () => {
    const all = items(replay(notifications).events);
    for (const [title, report] of [
      ["Capture alpha", "## Bicycle gears"],
      ["Capture beta", "## Refrigerators"],
    ] as const) {
      const card = cardFor(all, title)!;
      expect(card.title).toBe(title);
      const status = all.find(
        (item) => item.parentItemId === card.itemId && item.itemId.startsWith("subagent"),
      );
      expect(status?.text.startsWith(`${title}\n\n${report}`)).toBe(true);
      expect(status?.text).not.toContain("Running");
    }
  });

  const interleaved: Array<[string, SessionNotification["update"]]> = [
    [
      "child activity",
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "early alpha" },
        _meta: {
          "cognition.ai/streamingMessageId": "alpha-early",
          "cognition.ai/subagent_context": { parentAgentId: ALPHA_AGENT },
        },
      },
    ],
    [
      "another agent's completion",
      {
        sessionUpdate: "tool_call_update",
        toolCallId: "agent-earlier",
        status: "completed",
        _meta: {
          "cognition.ai/subagent_completed": { agentId: "agent-earlier", success: true },
        },
      },
    ],
    ["lead usage", { sessionUpdate: "usage_update", used: 1, size: 1_000_000 }],
    ["a session title", { sessionUpdate: "session_info_update", title: "Renamed" }],
    [
      "another update for the held call",
      {
        sessionUpdate: "tool_call_update",
        toolCallId: BETA_CALL,
        status: "in_progress",
        _meta: { "cognition.ai/inferenceToolName": "run_subagent" },
      },
    ],
  ];
  const withBeforeBetaStart = (update: SessionNotification["update"]) => {
    const started = notifications.findIndex((note) => isStart(note, BETA_AGENT));
    return replay([
      ...notifications.slice(0, started),
      { sessionId: "fixture-session", update },
      ...notifications.slice(started),
    ]).events;
  };
  it.each(interleaved)("keeps the acknowledgement held across %s", (_name, update) => {
    const events = withBeforeBetaStart(update);
    const all = items(events);
    const beta = cardFor(all, "Capture beta")!;
    expect(all.find((item) => item.text.startsWith("## Refrigerators"))?.parentItemId).toBe(
      beta.itemId,
    );
    expect(
      events.filter((event) => event.type === "item.completed" && event.itemId === beta.itemId),
    ).toHaveLength(1);
  });

  it("nests child activity that interleaves with the launch batch under its own card", () => {
    const all = items(withBeforeBetaStart(interleaved[0]![1]));
    expect(all.find((item) => item.text === "early alpha")?.parentItemId).toBe(
      cardFor(all, "Capture alpha")?.itemId,
    );
  });
});

describe("DevinSubagentLaunchOrder release bounds", () => {
  // The beta launch up to its acknowledgement, without the native start.
  const upToAcknowledgement = notifications.slice(
    0,
    notifications.findIndex((note) => isAcknowledgement(note, BETA_CALL)) + 1,
  );
  const leadChunk: SessionNotification = {
    sessionId: "fixture-session",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Lead continues." },
      _meta: { "cognition.ai/streamingMessageId": "lead-next" },
    },
  };
  const betaCompletion = (events: readonly RuntimeEvent[]) => {
    const beta = cardFor(items(events), "Capture beta")!;
    return events.findIndex(
      (event) => event.type === "item.completed" && event.itemId === beta.itemId,
    );
  };

  it("holds the acknowledgement until a start or lead update arrives", () => {
    const { events, feed } = replay(upToAcknowledgement);
    expect(betaCompletion(events)).toBe(-1);
    feed(leadChunk);
    const completed = betaCompletion(events);
    expect(completed).toBeGreaterThan(-1);
    const leadStart = events.findIndex(
      (event) =>
        event.type === "item.started" &&
        event.itemType === "assistant_message" &&
        !event.parentItemId,
    );
    expect(completed).toBeLessThan(leadStart);
  });

  it("releases a held acknowledgement after the turn ends", async () => {
    const { events, source } = replay(upToAcknowledgement);
    source.onTurnEnd();
    expect(betaCompletion(events)).toBe(-1);
    await Promise.resolve();
    expect(betaCompletion(events)).toBeGreaterThan(-1);
  });

  it("drops held acknowledgements on dispose", async () => {
    const { events, source } = replay(upToAcknowledgement);
    source.dispose();
    source.onTurnEnd();
    await Promise.resolve();
    expect(betaCompletion(events)).toBe(-1);
  });

  it("leaves replayed history in wire order", () => {
    const { events } = replay(upToAcknowledgement, true);
    expect(betaCompletion(events)).toBeGreaterThan(-1);
  });

  it("only holds background launches that still await their start", () => {
    const transform = createDevinAcpTransform();
    for (const note of notifications.slice(0, upToAcknowledgement.length - 1)) transform(note);
    expect(transform.awaitsNativeStart(BETA_CALL)).toBe(true);
    expect(transform.awaitsNativeStart(ALPHA_CALL)).toBe(false);
    expect(transform.awaitsNativeStart("unknown")).toBe(false);
  });
});
