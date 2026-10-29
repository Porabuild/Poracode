import type { RequestPermissionRequest, SessionNotification } from "@agentclientprotocol/sdk";
import type { ThreadConfig } from "@/shared/contracts";
import type { AcpSelectBooleanConfigBinding } from "../acp/modelConfigOptions";
import type { AcpPromptSteering } from "../acp/promptSteering";
import type { AcpConfigOptionsNormalizer } from "../base/types";
import type { AcpSessionUpdateTransform } from "../base";
import { PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY } from "../acp/canonicalMapping/subagents";
import { fxPermissionModeFor } from "./argv";

/**
 * Resolve the ACP session mode for this thread's approval policy. fx 0.0.13
 * named its unrestricted mode "code"; 0.0.15 calls it "full-access".
 */
export function resolveFxAcpMode(
  config: ThreadConfig,
  availableModeIds: string[],
): string | undefined {
  const wanted = fxPermissionModeFor(config.approvalPolicy);
  if (availableModeIds.includes(wanted)) return wanted;
  if (wanted === "full-access" && availableModeIds.includes("code")) return "code";
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * fx advertises `agentCapabilities._meta.fx.steering` and joins a
 * `session/prompt` marked `_meta.fx.steer` to the running turn (fx 0.0.15
 * `handleSteeringPrompt`).
 */
export const FX_ACP_PROMPT_STEERING: AcpPromptSteering = {
  isSupported: (initialize) =>
    asRecord(asRecord(initialize.agentCapabilities?._meta)?.["fx"])?.["steering"] === true,
  requestMeta: { fx: { steer: true } },
};

/** Binds Poracode's Fast toggle to fx's exact `fast` select ("false"/"true") so it can never claim the higher-priced `ultrafast` select. */
export const FX_ACP_FAST_CONFIG_BINDING: AcpSelectBooleanConfigBinding = {
  configId: "fast",
  disabled: "false",
  enabled: "true",
};

/** Drop the duplicated `name` when it only repeats the value. */
function stripDuplicateOptionName(entry: unknown): unknown {
  const record = asRecord(entry);
  if (!record || typeof record.value !== "string" || record.name !== record.value) return entry;
  const copy = { ...record };
  delete copy["name"];
  return copy;
}

function groupOptionsByModelPrefix(values: readonly unknown[]): readonly unknown[] {
  const groups = new Map<string, unknown[]>();
  for (const value of values) {
    const id = asRecord(value)?.["value"];
    if (typeof id !== "string") return values;
    const slash = id.indexOf("/");
    if (slash < 0) return values;
    const prefix = id.slice(0, slash);
    const bucket = groups.get(prefix);
    if (bucket) bucket.push(value);
    else groups.set(prefix, [value]);
  }
  return [...groups].map(([prefix, options]) => ({ group: prefix, name: prefix, options }));
}

/**
 * fx advertises a `provider` select with the `model` category, and the shared
 * reduction picks the first model-category select as the model control. Drop
 * `provider` (switching stays in `fx provider`) and tidy the model select:
 * repeated labels removed, flat `vendor/model` values grouped per vendor.
 */
export const normalizeFxAcpConfigOptions: AcpConfigOptionsNormalizer = (configOptions) => {
  if (!Array.isArray(configOptions)) return configOptions;
  return configOptions
    .filter((entry) => asRecord(entry)?.["id"] !== "provider")
    .map((entry) => {
      const record = asRecord(entry);
      if (!record || record["id"] !== "model" || record["type"] !== "select") return entry;
      if (!Array.isArray(record["options"])) return entry;
      const values = record["options"].map(stripDuplicateOptionName);
      const flat =
        values.length > 0 &&
        values.every((value) => typeof asRecord(value)?.["value"] === "string");
      if (!flat) return { ...record, options: values };
      return {
        ...record,
        options: groupOptionsByModelPrefix(values),
      };
    });
};

function firstLineOf(text: string): string {
  return text.split("\n", 1)[0]?.trim() ?? "";
}

const MCP_CONTENT_TYPES = new Set(["text", "image", "audio", "resource_link", "resource"]);

function parsedTextEnvelope(text: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(text.trim()));
  } catch {
    return undefined;
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function replaceContentText(
  entry: Record<string, unknown>,
  content: Record<string, unknown>,
  text: string,
): unknown[] {
  return [{ ...entry, content: { ...content, text } }];
}

/** Sub-agent results: `{ ok, result, error_code }` -> the text the tool produced. */
function subagentEnvelopeText(envelope: Record<string, unknown>): string | undefined {
  if (typeof envelope["ok"] !== "boolean") return undefined;
  if (envelope["ok"] === true) return nonEmptyString(envelope["result"]);
  const error = asRecord(envelope["error"]);
  return (
    nonEmptyString(envelope["error"]) ??
    nonEmptyString(error?.["message"]) ??
    nonEmptyString(envelope["result"]) ??
    nonEmptyString(envelope["error_code"])
  );
}

/** MCP results: `{ server, tool, result: { content: [...] } }` -> one entry per item. */
function mcpEnvelopeEntries(envelope: Record<string, unknown>): unknown[] | undefined {
  const content = asRecord(envelope["result"])?.["content"];
  if (!Array.isArray(content) || content.length === 0) return undefined;
  const entries: unknown[] = [];
  for (const item of content) {
    const record = asRecord(item);
    const type = record?.["type"];
    if (!record || typeof type !== "string" || !MCP_CONTENT_TYPES.has(type)) return undefined;
    entries.push({ type: "content", content: item });
  }
  return entries;
}

/**
 * fx's own tool errors: `{ error: { type, tool_name, message, details? } }` ->
 * the message, plus `details.error` when it adds something ("Tool execution
 * failed: Cancelled"). A failed command's stdout arrives unwrapped, so the
 * `type` + `tool_name` signature keeps its own JSON from being rewritten.
 */
function fxToolErrorMessage(envelope: Record<string, unknown>): string | undefined {
  const error = asRecord(envelope["error"]);
  if (!error || !nonEmptyString(error["type"]) || !nonEmptyString(error["tool_name"])) {
    return undefined;
  }
  const message = nonEmptyString(error["message"]);
  if (!message) return undefined;
  const detail = nonEmptyString(asRecord(error["details"])?.["error"]);
  return detail && detail !== message ? `${message}: ${detail}` : message;
}

function rewriteToolContentEntry(
  entry: unknown,
  context: { subagent: boolean; mcp: boolean; failed: boolean },
): unknown[] | undefined {
  const record = asRecord(entry);
  if (!record || record["type"] !== "content") return undefined;
  const content = asRecord(record["content"]);
  if (!content || content["type"] !== "text" || typeof content["text"] !== "string") {
    return undefined;
  }
  const envelope = parsedTextEnvelope(content["text"]);
  if (!envelope) return undefined;

  // Precedence: sub-agent envelope, then MCP wrapper, then fx tool error.
  if (context.subagent) {
    const text = subagentEnvelopeText(envelope);
    if (text !== undefined) return replaceContentText(record, content, text);
  }
  if (context.mcp) {
    const entries = mcpEnvelopeEntries(envelope);
    if (entries) return entries;
  }
  if (context.failed) {
    const text = fxToolErrorMessage(envelope);
    if (text !== undefined) return replaceContentText(record, content, text);
  }
  return undefined;
}

/**
 * fx provider-boundary normalization for ACP updates. It unwraps the JSON
 * envelopes fx returns as tool output (sub-agent `{ok, result, error_code}`,
 * fx tool errors `{error: {type, tool_name, message}}`, MCP
 * `{server, tool, result}`) into the text the tool produced, and starts a new
 * assistant item whenever an `agent_message_chunk` carries a new `messageId` so
 * separate fx messages in one turn do not merge. It also maps `subagent`
 * `action: "run"` calls to the canonical subagent input; `action: "message"`
 * stays a plain tool call.
 */
export function createFxAcpSessionUpdateTransform(): AcpSessionUpdateTransform {
  const subagentToolCallIds = new Set<string>();
  const mcpToolCallIds = new Set<string>();
  let previousMessageId: string | undefined;

  return (notification) => {
    const update = asRecord(notification.update);
    if (!update) return notification;
    const sessionUpdate = update["sessionUpdate"];

    if (sessionUpdate === "agent_message_chunk") {
      const messageId = update["messageId"];
      if (typeof messageId !== "string" || messageId.length === 0) return notification;
      const startsNewMessage = previousMessageId !== undefined && previousMessageId !== messageId;
      previousMessageId = messageId;
      if (!startsNewMessage) return notification;
      const markedUpdate: Record<string, unknown> = {
        ...update,
        _meta: {
          ...(asRecord(update["_meta"]) ?? {}),
          [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: "owner",
        },
      };
      return { ...notification, update: markedUpdate } as SessionNotification;
    }

    if (sessionUpdate !== "tool_call" && sessionUpdate !== "tool_call_update") {
      return notification;
    }

    const toolCallId = update["toolCallId"];
    const id = typeof toolCallId === "string" && toolCallId.length > 0 ? toolCallId : undefined;
    if (id) {
      if (update["name"] === "subagent") subagentToolCallIds.add(id);
      const mcp = asRecord(asRecord(asRecord(update["_meta"])?.["fx"])?.["toolCall"])?.["mcp"];
      if (asRecord(mcp)) mcpToolCallIds.add(id);
    }

    let nextUpdate = update;
    if (id && subagentToolCallIds.has(id)) {
      const rawInput = asRecord(update["rawInput"]);
      if (rawInput?.["action"] === "run") {
        const task = rawInput["task"];
        if (typeof task === "string") {
          const title = typeof update["title"] === "string" ? update["title"].trim() : "";
          const description = title.length > 0 ? title : firstLineOf(task).slice(0, 80);
          nextUpdate = {
            ...nextUpdate,
            rawInput: {
              ...rawInput,
              subagent_type: "agent",
              prompt: task,
              description,
            },
          };
        }
      }
    }

    const content = update["content"];
    if (Array.isArray(content)) {
      const rewritten: unknown[] = [];
      let changed = false;
      for (const entry of content) {
        const replacement = rewriteToolContentEntry(entry, {
          subagent: id !== undefined && subagentToolCallIds.has(id),
          mcp: id !== undefined && mcpToolCallIds.has(id),
          failed: update["status"] === "failed",
        });
        if (replacement) {
          rewritten.push(...replacement);
          changed = true;
        } else {
          rewritten.push(entry);
        }
      }
      if (changed) nextUpdate = { ...nextUpdate, content: rewritten };
    }

    if (nextUpdate === update) return notification;
    return { ...notification, update: nextUpdate } as SessionNotification;
  };
}

/**
 * fx titles every file approval `file_mutation`, which became the approval
 * heading. Name it the way fx names shell approvals (`shell.run <command>`):
 * fx's tool and the path, for example `edit_file src/app.ts`.
 */
export function normalizeFxPermissionRequest(
  request: RequestPermissionRequest,
): RequestPermissionRequest {
  const toolCall = request.toolCall;
  if (toolCall.title !== "file_mutation") return request;
  const path = nonEmptyString(asRecord(toolCall.rawInput)?.["path"]);
  if (!path) return request;
  // fx sends the tool `name` outside the ACP ToolCallUpdate type.
  const tool = nonEmptyString(asRecord(toolCall)?.["name"])?.trim() ?? "file_mutation";
  return { ...request, toolCall: { ...toolCall, title: `${tool} ${path}` } };
}
