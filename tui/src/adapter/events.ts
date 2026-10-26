import { ascending } from "@opencode/schema/identifier";
import type {
  LocationRef,
  OpenCodeEvent,
  FormInfo1,
  PermissionReply,
  PromptFileAttachment,
  SessionInboxUser,
  SessionStructuredError,
  TokenUsageInfo,
} from "@opencode/client";
import {
  messageItemPayloadSchema,
  reasoningItemPayloadSchema,
  runtimeEventSchema,
} from "@/shared/contracts/runtimeEvent";
import { z } from "zod";
import { formId, messageId, permissionId, sessionId, subSessionId } from "./ids";
import { bounded, mapToolItem, record, stringValue, type ToolDefinition } from "./toolMapping";
import {
  ELICITATION_PERMISSION_OPTIONS,
  emptyFormElicitation,
  formInfoForRequest,
  formUnavailableMessage,
} from "./forms";
import { DEFAULT_PERMISSION_OPTIONS } from "./permissions";

type EventType = OpenCodeEvent["type"];
type EventMap = { [Event in OpenCodeEvent as Event["type"]]: Event };
type EventOf<Type extends keyof EventMap> = EventMap[Type];
type EventOptions<Type extends EventType> = Pick<
  EventOf<Type>,
  Extract<keyof EventOf<Type>, "durable" | "location">
>;
export type ThreadEventContext = {
  agent: string;
  providerID: string;
  model: string;
  location: LocationRef;
};
type StreamPart<Kind extends "text" | "reasoning"> = {
  kind: Kind;
  ordinal: number;
  text: string;
  ended: boolean;
};
type TextPart = StreamPart<"text"> | StreamPart<"reasoning">;
type ToolPart = {
  kind: "tool";
  id: string;
  itemType: string;
  definition: ToolDefinition;
  lastProgressAt: number;
};
type Part = TextPart | ToolPart;
type Run = {
  assistantMessageID: string;
  context: ThreadEventContext;
  nextOrdinal: number;
  parts: Map<string, Part>;
};
type SessionState = {
  run?: Run;
  lastError?: SessionStructuredError;
  permissions: Map<string, string>;
  forms: Map<string, string>;
  lastCost: number;
  /** Items already materialized in this session — replays never duplicate parts. */
  seenItemIds: Set<string>;
  /** An open runtime turn (turn.started, not yet turn.completed). */
  turnOpen?: boolean;
};

const remoteEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("thread-runtime-event"),
    threadId: z.string(),
    event: runtimeEventSchema,
  }),
  z.object({
    type: z.literal("thread-runtime-events"),
    threadId: z.string(),
    events: z.array(runtimeEventSchema),
  }),
  z.object({
    type: z.literal("thread-runtime-events-multi"),
    batches: z.array(z.object({ threadId: z.string(), events: z.array(runtimeEventSchema) })),
  }),
]);
const optionsSchema = z.array(
  z.object({
    optionId: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
  }),
);

export class EventStreamHub {
  private readonly controllers = new Map<
    ReadableStreamDefaultController<Uint8Array>,
    ReturnType<typeof setInterval>
  >();
  private readonly sequences = new Map<string, number>();
  private readonly encoder = new TextEncoder();

  constructor(private readonly debug?: (event: string) => void) {}

  nextDurableSequence(sessionID: string) {
    const next = (this.sequences.get(sessionID) ?? 0) + 1;
    this.sequences.set(sessionID, next);
    return next;
  }

  subscribe() {
    this.debug?.("subscribe");
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start: (value) => {
        controller = value;
        const connected = openCodeEvent("server.connected", {}, {});
        this.debug?.(`emit:${connected.type}`);
        value.enqueue(this.encode(connected));
        this.debug?.(`write:${connected.type}`);
        this.controllers.set(
          value,
          setInterval(() => {
            try {
              value.enqueue(this.encoder.encode(": keepalive\n\n"));
            } catch {
              this.remove(value);
            }
          }, 15_000),
        );
      },
      cancel: () => {
        if (controller) this.remove(controller);
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  emit(event: OpenCodeEvent) {
    this.debug?.(`emit:${event.type}`);
    const chunk = this.encode(event);
    for (const controller of this.controllers.keys()) {
      try {
        controller.enqueue(chunk);
        this.debug?.(`write:${event.type}`);
      } catch {
        this.remove(controller);
      }
    }
  }

  resync() {
    this.debug?.("resync");
    for (const controller of this.controllers.keys()) {
      try {
        controller.close();
      } catch {}
      this.remove(controller);
    }
  }

  dispose() {
    this.resync();
  }

  private encode(event: OpenCodeEvent) {
    return this.encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  }

  private remove(controller: ReadableStreamDefaultController<Uint8Array>) {
    const timer = this.controllers.get(controller);
    if (timer) clearInterval(timer);
    if (this.controllers.delete(controller)) this.debug?.("close");
  }
}

export function openCodeEvent<Type extends EventType>(
  type: Type,
  data: EventOf<Type>["data"],
  options: EventOptions<Type>,
): OpenCodeEvent {
  const created = type === "server.connected" ? {} : { created: Date.now() };
  // TypeScript cannot correlate a generic discriminant with its member's payload
  // (microsoft/TypeScript#30581); the signature checks each call site against that exact member.
  return { id: `evt_${ascending()}`, ...created, type, data, ...options } as OpenCodeEvent;
}

export function createEventTranslator(
  contexts: ReadonlyMap<string, ThreadEventContext>,
  nextSequence: (sessionID: string) => number,
) {
  const sessions = new Map<string, SessionState>();
  const permissionReplies = new Map<string, PermissionReply>();
  // Item parentage per thread, learned from item.started events. Child items
  // route to the virtual subsession of their root subagent task ancestor —
  // the same grouping history uses (items nested via parentItemId).
  const itemParents = new Map<string, Map<string, string>>();
  const itemParentsFor = (threadId: string) => {
    let parents = itemParents.get(threadId);
    if (!parents) {
      parents = new Map();
      itemParents.set(threadId, parents);
    }
    return parents;
  };
  const rootAncestorItem = (parents: ReadonlyMap<string, string>, itemId: string) => {
    let current = itemId;
    for (let depth = 0; depth < 50 && parents.has(current); depth += 1)
      current = parents.get(current)!;
    return current;
  };
  const stateFor = (sessionKey: string) => {
    const previous = sessions.get(sessionKey);
    if (previous) return previous;
    const state: SessionState = {
      permissions: new Map(),
      forms: new Map(),
      lastCost: 0,
      seenItemIds: new Set(),
    };
    sessions.set(sessionKey, state);
    return state;
  };
  const durable = (sessionID: string) =>
    ({
      aggregateID: sessionID,
      seq: nextSequence(sessionID),
      version: 1,
    }) satisfies EventOf<"session.execution.started">["durable"];
  const durableTool = (sessionID: string) =>
    ({
      aggregateID: sessionID,
      seq: nextSequence(sessionID),
      version: 2,
    }) satisfies EventOf<"session.tool.success">["durable"];
  const location = (context: ThreadEventContext | undefined) =>
    context ? { location: context.location } : {};
  const toast = (
    message: string,
    variant: "info" | "success" | "warning" | "error",
    context?: ThreadEventContext,
  ) => openCodeEvent("tui.toast.show", { message, variant }, location(context));

  const closeRun = (
    sessionID: string,
    state: SessionState,
    finish: "stop" | "error" | "unknown",
  ) => {
    const run = state.run;
    if (!run) return [];
    const output: OpenCodeEvent[] = [];
    for (const part of run.parts.values()) {
      if (part.kind === "text" && !part.ended) {
        output.push(
          openCodeEvent(
            "session.text.ended",
            {
              sessionID,
              assistantMessageID: run.assistantMessageID,
              ordinal: part.ordinal,
              text: part.text,
            },
            { durable: durable(sessionID), location: run.context.location },
          ),
        );
      }
      if (part.kind === "reasoning" && !part.ended) {
        output.push(
          openCodeEvent(
            "session.reasoning.ended",
            {
              sessionID,
              assistantMessageID: run.assistantMessageID,
              ordinal: part.ordinal,
              text: part.text,
            },
            { durable: durable(sessionID), location: run.context.location },
          ),
        );
      }
      if (part.kind === "tool") {
        output.push(
          failedToolEvent(
            sessionID,
            run,
            part,
            "Tool ended before a result was received",
            durableTool,
          ),
        );
      }
    }
    output.push(
      openCodeEvent(
        "session.step.ended",
        {
          sessionID,
          assistantMessageID: run.assistantMessageID,
          finish,
          cost: 0,
          tokens: emptyTokens(),
        },
        { durable: durable(sessionID), location: run.context.location },
      ),
    );
    state.run = undefined;
    return output;
  };

  const translateRuntime = (threadId: string, event: z.infer<typeof runtimeEventSchema>) => {
    // Child items (a subagent's own turns) route to the virtual subsession of
    // their root task item, never into the parent's parts.
    const parents = itemParentsFor(threadId);
    let sessionID = sessionId(threadId);
    if ("itemId" in event && typeof event.itemId === "string") {
      if (event.type === "item.started" && typeof event.parentItemId === "string")
        parents.set(event.itemId, event.parentItemId);
      const root = rootAncestorItem(parents, event.itemId);
      if (root !== event.itemId) sessionID = subSessionId(threadId, root);
    }
    const state = stateFor(sessionID);
    const context = contexts.get(threadId);
    if (event.type === "session.exited") return [];
    if (event.type === "turn.started") {
      if (state.turnOpen) return []; // duplicate turn.started — already running
      state.turnOpen = true;
      return [
        openCodeEvent(
          "session.execution.started",
          { sessionID },
          { durable: durable(sessionID), ...location(context) },
        ),
      ];
    }
    if (event.type === "turn.completed") {
      state.turnOpen = false;
      const finish =
        event.state === "failed" ? "error" : event.state === "completed" ? "stop" : "unknown";
      const output = closeRun(sessionID, state, finish);
      if (event.state === "failed") {
        output.push(
          openCodeEvent(
            "session.execution.failed",
            {
              sessionID,
              error: state.lastError ?? {
                type: "provider_error",
                message: "Poracode provider failed",
              },
            },
            { durable: durable(sessionID), ...location(context) },
          ),
        );
      } else if (event.state === "interrupted" || event.state === "cancelled") {
        output.push(
          openCodeEvent(
            "session.execution.interrupted",
            { sessionID, reason: "user" },
            { durable: durable(sessionID), ...location(context) },
          ),
        );
      } else {
        output.push(
          openCodeEvent(
            "session.execution.succeeded",
            { sessionID },
            { durable: durable(sessionID), ...location(context) },
          ),
        );
      }
      state.lastError = undefined;
      return output;
    }
    if (event.type === "error") {
      state.lastError = { type: "provider_error", message: event.message };
      return state.run ? [] : [toast(event.message, "error", context)];
    }
    if (event.type === "warning") {
      return event.presentation === "notice" ? [toast(event.message, "warning", context)] : [];
    }
    if (event.type === "usage.spent") {
      const categories = event.usage.tokens;
      state.lastCost = event.usage.cost?.amount ?? 0;
      return [
        openCodeEvent(
          "session.usage.updated",
          {
            sessionID,
            cost: state.lastCost,
            tokens: {
              input: categories?.input ?? 0,
              output: categories?.output ?? 0,
              reasoning: 0,
              cache: {
                read: categories?.cacheRead ?? 0,
                write: categories?.cacheWrite ?? 0,
              },
            },
          },
          location(context),
        ),
      ];
    }
    if (event.type === "context.updated") {
      // `context.updated` carries window occupancy for the dock; put it in the
      // dominant bucket so the total matches the host's occupancy figure.
      return [
        openCodeEvent(
          "session.usage.updated",
          {
            sessionID,
            cost: state.lastCost,
            tokens: {
              input: event.usage.usedTokens ?? 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          location(context),
        ),
      ];
    }
    if (event.type === "request.opened") {
      if (event.requestType === "tool_user_input") {
        // An empty-schema elicitation is a binary accept/decline prompt —
        // surface it as a permission request instead of an empty form.
        const elicitation = emptyFormElicitation(event);
        if (elicitation) {
          const permissionID = permissionId(event.requestId);
          state.permissions.set(event.requestId, permissionID);
          return [
            openCodeEvent(
              "permission.asked",
              {
                id: permissionID,
                sessionID,
                action: "elicitation",
                resources: [],
                message: elicitation.message || event.payload.summary,
                metadata: {
                  requestType: event.requestType,
                  options: [...ELICITATION_PERMISSION_OPTIONS],
                },
              },
              location(context),
            ),
          ];
        }
        const form = formInfoForRequest(event);
        if (!form) return [toast(formUnavailableMessage(), "error", context)];
        state.forms.set(event.requestId, form.id);
        return [
          openCodeEvent("form.created", { form: form as unknown as FormInfo1 }, location(context)),
        ];
      }
      const options = optionsSchema.safeParse(event.payload.options);
      const permissionID = permissionId(event.requestId);
      state.permissions.set(event.requestId, permissionID);
      const permissionOptions =
        options.success && options.data.length > 0
          ? options.data
          : DEFAULT_PERMISSION_OPTIONS.map(({ optionId, name }) => ({ optionId, label: name }));
      return [
        openCodeEvent(
          "permission.asked",
          {
            id: permissionID,
            sessionID,
            action: event.requestType,
            resources: [],
            message: event.payload.summary,
            metadata: {
              requestType: event.requestType,
              options: permissionOptions,
            },
          },
          location(context),
        ),
      ];
    }
    if (event.type === "request.resolved") {
      const formID = state.forms.get(event.requestId);
      if (formID) {
        state.forms.delete(event.requestId);
        return [openCodeEvent("form.cancelled", { id: formID, sessionID }, location(context))];
      }
      const permissionID = state.permissions.get(event.requestId);
      if (!permissionID) return [];
      state.permissions.delete(event.requestId);
      return [
        openCodeEvent(
          "permission.replied",
          {
            sessionID,
            requestID: permissionID,
            reply:
              permissionReplies.get(`${threadId}\0${event.requestId}`) ??
              (event.outcome === "accepted" || event.outcome === "answered" ? "once" : "reject"),
          },
          location(context),
        ),
      ];
    }
    if (event.type === "item.started") {
      // Replays (the subagent buffer drains on subscribe) must not re-add parts.
      if (state.seenItemIds.has(event.itemId)) return [];
      state.seenItemIds.add(event.itemId);
      if (event.itemType === "user_message") {
        const output = closeRun(sessionID, state, "stop");
        output.push(...inboxEvents(event.itemId, event.payload, sessionID, context, durable));
        return output;
      }
      if (!context) return [];
      let run = state.run;
      const first = run === undefined;
      if (!run) {
        run = {
          assistantMessageID: messageId(event.itemId),
          context,
          nextOrdinal: 0,
          parts: new Map(),
        };
        state.run = run;
      }
      const output: OpenCodeEvent[] = [];
      if (first) {
        output.push(
          openCodeEvent(
            "session.step.started",
            {
              sessionID,
              assistantMessageID: run.assistantMessageID,
              agent: context.agent,
              model: { id: context.model, providerID: context.providerID },
              started: Date.now(),
            },
            { durable: durable(sessionID), location: context.location },
          ),
        );
      }
      if (event.itemType === "assistant_message") {
        const part: TextPart = { kind: "text", ordinal: run.nextOrdinal++, text: "", ended: false };
        run.parts.set(event.itemId, part);
        output.push(
          openCodeEvent(
            "session.text.started",
            {
              sessionID,
              assistantMessageID: run.assistantMessageID,
              ordinal: part.ordinal,
            },
            { durable: durable(sessionID), location: run.context.location },
          ),
        );
        return output;
      }
      if (event.itemType === "reasoning") {
        const parsed = reasoningItemPayloadSchema.safeParse(event.payload);
        const part: TextPart = {
          kind: "reasoning",
          ordinal: run.nextOrdinal++,
          text: parsed.success ? (parsed.data.summary ?? "") : "",
          ended: false,
        };
        run.parts.set(event.itemId, part);
        output.push(
          openCodeEvent(
            "session.reasoning.started",
            {
              sessionID,
              assistantMessageID: run.assistantMessageID,
              ordinal: part.ordinal,
            },
            { durable: durable(sessionID), location: run.context.location },
          ),
        );
        return output;
      }
      const tool = mapToolItem(event.itemType, event.payload, {
        threadId,
        itemId: event.itemId,
      });
      if (!tool) return output;
      const part: ToolPart = {
        kind: "tool",
        id: event.itemId,
        itemType: event.itemType,
        definition: tool,
        lastProgressAt: 0,
      };
      run.nextOrdinal += 1;
      run.parts.set(event.itemId, part);
      output.push(
        openCodeEvent(
          "session.tool.input.started",
          {
            sessionID,
            assistantMessageID: run.assistantMessageID,
            id: part.id,
            name: part.definition.name,
          },
          { durable: durable(sessionID), location: run.context.location },
        ),
        openCodeEvent(
          "session.tool.input.ended",
          {
            sessionID,
            assistantMessageID: run.assistantMessageID,
            id: part.id,
            text: JSON.stringify(part.definition.input),
          },
          { durable: durable(sessionID), location: run.context.location },
        ),
        openCodeEvent(
          "session.tool.called",
          {
            sessionID,
            assistantMessageID: run.assistantMessageID,
            id: part.id,
            input: part.definition.input,
            executed: true,
          },
          { durable: durable(sessionID), location: run.context.location },
        ),
      );
      return output;
    }
    if (event.type === "item.updated") {
      const run = state.run;
      const part = run?.parts.get(event.itemId);
      if (!run || !part || part.kind !== "tool") return [];
      const update = mapToolItem(part.itemType, event.payload, {
        threadId,
        itemId: event.itemId,
      });
      if (update) {
        part.definition = {
          ...update,
          output: bounded(part.definition.output + update.output),
        };
      }
      return progress(sessionID, run, part);
    }
    if (event.type === "content.delta") {
      const run = state.run;
      const part = run?.parts.get(event.itemId);
      if (!run || !part) return [];
      if (part.kind === "text" && event.stream === "assistant_text") {
        part.text = event.replace ? bounded(event.delta) : bounded(part.text + event.delta);
        if (event.replace) {
          part.ended = true;
          return [
            openCodeEvent(
              "session.text.ended",
              {
                sessionID,
                assistantMessageID: run.assistantMessageID,
                ordinal: part.ordinal,
                text: part.text,
              },
              { durable: durable(sessionID), location: run.context.location },
            ),
          ];
        }
        return [
          openCodeEvent(
            "session.text.delta",
            {
              sessionID,
              assistantMessageID: run.assistantMessageID,
              ordinal: part.ordinal,
              delta: event.delta,
            },
            { location: run.context.location },
          ),
        ];
      }
      if (part.kind === "reasoning" && event.stream === "reasoning_text") {
        part.text = event.replace ? bounded(event.delta) : bounded(part.text + event.delta);
        if (event.replace) {
          part.ended = true;
          return [
            openCodeEvent(
              "session.reasoning.ended",
              {
                sessionID,
                assistantMessageID: run.assistantMessageID,
                ordinal: part.ordinal,
                text: part.text,
              },
              { durable: durable(sessionID), location: run.context.location },
            ),
          ];
        }
        return [
          openCodeEvent(
            "session.reasoning.delta",
            {
              sessionID,
              assistantMessageID: run.assistantMessageID,
              ordinal: part.ordinal,
              delta: event.delta,
            },
            { location: run.context.location },
          ),
        ];
      }
      if (part.kind === "tool" && isToolOutputStream(event.stream)) {
        part.definition.output = bounded(
          event.replace ? event.delta : part.definition.output + event.delta,
        );
        return progress(sessionID, run, part);
      }
      return [];
    }
    if (event.type === "item.completed") {
      const run = state.run;
      const part = run?.parts.get(event.itemId);
      if (!run || !part) return [];
      run.parts.delete(event.itemId);
      if (part.kind === "text") {
        const fullText = authoritativeText(event.payload) ?? part.text;
        return [
          openCodeEvent(
            "session.text.ended",
            {
              sessionID,
              assistantMessageID: run.assistantMessageID,
              ordinal: part.ordinal,
              text: bounded(fullText),
            },
            { durable: durable(sessionID), location: run.context.location },
          ),
        ];
      }
      if (part.kind === "reasoning") {
        const fullText = summaryText(event.payload) || part.text;
        return [
          openCodeEvent(
            "session.reasoning.ended",
            {
              sessionID,
              assistantMessageID: run.assistantMessageID,
              ordinal: part.ordinal,
              text: bounded(fullText),
            },
            { durable: durable(sessionID), location: run.context.location },
          ),
        ];
      }
      return toolCompletion(sessionID, run, part, event.payload, durableTool);
    }
    return [];
  };

  const translate = (value: unknown): OpenCodeEvent[] => {
    const envelope = remoteEventSchema.safeParse(value);
    if (!envelope.success) return [];
    if (envelope.data.type === "thread-runtime-event") {
      return translateRuntime(envelope.data.threadId, envelope.data.event);
    }
    if (envelope.data.type === "thread-runtime-events") {
      const threadId = envelope.data.threadId;
      return envelope.data.events.flatMap((event) => translateRuntime(threadId, event));
    }
    return envelope.data.batches.flatMap((batch) =>
      batch.events.flatMap((event) => translateRuntime(batch.threadId, event)),
    );
  };

  const recordPermissionReply = (threadId: string, requestId: string, reply: PermissionReply) => {
    permissionReplies.set(`${threadId}\0${requestId}`, reply);
  };
  const recordFormRequest = (threadId: string, requestId: string) => {
    const id = formId(threadId, requestId);
    stateFor(sessionId(threadId)).forms.set(requestId, id);
    return id;
  };
  const forgetFormRequest = (threadId: string, requestId: string) => {
    sessions.get(sessionId(threadId))?.forms.delete(requestId);
  };

  return {
    translate,
    recordPermissionReply,
    recordFormRequest,
    forgetFormRequest,
    resetThread(threadId: string) {
      const sessionKey = sessionId(threadId);
      sessions.delete(sessionKey);
      for (const key of sessions.keys()) {
        if (key.startsWith(`${sessionKey}__`)) sessions.delete(key);
      }
      itemParents.delete(threadId);
      for (const key of permissionReplies.keys()) {
        if (key.startsWith(`${threadId}\0`)) permissionReplies.delete(key);
      }
    },
    // Whether a run is open for this session — the ground truth the adapter's
    // wait/interrupt routes need, since thread-state events can lag or be
    // dropped while turn.started/turn.completed always arrive on the runtime
    // stream.
    hasActiveRun(sessionID: string) {
      const state = sessions.get(sessionID);
      return state !== undefined && (state.turnOpen === true || state.run !== undefined);
    },
  };
}

function progress(sessionID: string, run: Run, part: ToolPart) {
  const now = Date.now();
  if (now - part.lastProgressAt < 100) return [];
  part.lastProgressAt = now;
  return [
    openCodeEvent(
      "session.tool.progress",
      {
        sessionID,
        assistantMessageID: run.assistantMessageID,
        id: part.id,
        metadata: { ...part.definition.metadata, output: bounded(part.definition.output) },
      },
      { location: run.context.location },
    ),
  ];
}

function toolCompletion(
  sessionID: string,
  run: Run,
  part: ToolPart,
  payload: unknown,
  durableTool: (sessionID: string) => EventOf<"session.tool.success">["durable"],
) {
  const result = record(payload);
  const errorMessage = stringValue(result.errorMessage ?? record(result.error).message);
  if (result.status === "error" || errorMessage) {
    return [failedToolEvent(sessionID, run, part, errorMessage || "Tool failed", durableTool)];
  }
  const output = bounded(part.definition.output || stringValue(result.result) || "Completed");
  return [
    openCodeEvent(
      "session.tool.success",
      {
        sessionID,
        assistantMessageID: run.assistantMessageID,
        id: part.id,
        content: [{ type: "text", text: output }],
        metadata: { ...part.definition.metadata, output },
        executed: true,
      },
      { durable: durableTool(sessionID), location: run.context.location },
    ),
  ];
}

function failedToolEvent(
  sessionID: string,
  run: Run,
  part: ToolPart,
  message: string,
  durableTool: (sessionID: string) => EventOf<"session.tool.success">["durable"],
) {
  const error: SessionStructuredError = { type: "tool_error", message };
  return openCodeEvent(
    "session.tool.failed",
    {
      sessionID,
      assistantMessageID: run.assistantMessageID,
      id: part.id,
      error,
      content: [{ type: "text", text: bounded(part.definition.output || message) }],
      metadata: { ...part.definition.metadata, output: bounded(part.definition.output) },
      executed: true,
    },
    { durable: durableTool(sessionID), location: run.context.location },
  );
}

function inboxEvents(
  itemID: string,
  payload: unknown,
  sessionID: string,
  context: ThreadEventContext | undefined,
  durable: (sessionID: string) => EventOf<"session.execution.started">["durable"],
) {
  const parsed = messageItemPayloadSchema.safeParse(payload);
  const blocks = parsed.success ? parsed.data.content : [];
  const text = blocks.flatMap((block) => (block.kind === "text" ? [block.text] : [])).join("");
  const files = blocks.flatMap((block): PromptFileAttachment[] => {
    if (block.kind === "file") {
      return [
        {
          data: "",
          mime: block.mimeType ?? "application/octet-stream",
          ...(block.name ? { name: block.name } : {}),
          source: { type: "uri", uri: block.path },
        },
      ];
    }
    if (block.kind === "image") {
      return [
        {
          data: block.dataUrl.split(",").at(-1) ?? "",
          mime: block.mimeType,
          ...(block.name ? { name: block.name } : {}),
          source: { type: "inline" },
        },
      ];
    }
    return [];
  });
  const inboxID = messageId(itemID);
  const item: SessionInboxUser = {
    id: inboxID,
    sessionID,
    time: { created: Date.now() },
    type: "user",
    payload: { text, ...(files.length > 0 ? { files } : {}) },
    delivery: "steer",
  };
  const location = context ? { location: context.location } : {};
  return [
    openCodeEvent(
      "session.inbox.enqueued",
      { sessionID, inboxID, item },
      { durable: durable(sessionID), ...location },
    ),
    openCodeEvent(
      "session.inbox.delivered",
      { sessionID, inboxID },
      { durable: durable(sessionID), ...location },
    ),
  ];
}

function authoritativeText(payload: unknown) {
  const parsed = messageItemPayloadSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.displayAuthoritative) return undefined;
  return parsed.data.content
    .flatMap((block) => (block.kind === "text" ? [block.text] : []))
    .join("");
}

function summaryText(payload: unknown) {
  const parsed = reasoningItemPayloadSchema.safeParse(payload);
  return parsed.success ? (parsed.data.summary ?? "") : "";
}

function isToolOutputStream(stream: string) {
  return stream === "command_output" || stream === "file_change_output" || stream === "plan_text";
}

function emptyTokens(): TokenUsageInfo {
  return { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
}
