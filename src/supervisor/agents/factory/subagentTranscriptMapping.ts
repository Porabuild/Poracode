import type { SessionNotification } from "@agentclientprotocol/sdk";
import { PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY } from "../acp/canonicalMapping/subagents";

export function mapFactoryTranscriptRecord(
  childSessionId: string,
  parentToolCallId: string,
  value: unknown,
): SessionNotification[] {
  const record = factoryRecord(value);
  if (record.type !== "message") return [];
  const message = factoryRecord(record.message);
  const content = Array.isArray(message.content) ? message.content : [];
  const notifications: SessionNotification[] = [];

  if (message.role === "assistant") {
    for (const rawBlock of content) {
      const block = factoryRecord(rawBlock);
      if (block.type === "thinking") {
        const thinking = factoryString(block.thinking);
        if (thinking) {
          notifications.push(
            factoryNotification(childSessionId, parentToolCallId, {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: thinking },
            }),
          );
        }
      } else if (block.type === "text") {
        const text = factoryString(block.text);
        if (text) {
          notifications.push(
            factoryNotification(childSessionId, parentToolCallId, {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text },
            }),
          );
        }
      } else if (block.type === "tool_use") {
        const toolCallId = factoryString(block.id);
        const name = factoryString(block.name);
        if (!toolCallId || !name) continue;
        const rawInput = factoryRecord(block.input);
        notifications.push(
          factoryNotification(childSessionId, parentToolCallId, {
            sessionUpdate: "tool_call",
            toolCallId,
            name,
            title: factoryToolTitle(name, rawInput),
            kind: factoryToolKind(name),
            status: "in_progress",
            rawInput,
          }),
        );
      }
    }
  } else if (message.role === "user") {
    for (const rawBlock of content) {
      const block = factoryRecord(rawBlock);
      if (block.type !== "tool_result") continue;
      const toolCallId = factoryString(block.tool_use_id);
      if (!toolCallId) continue;
      const text = factoryContentText(block.content);
      notifications.push(
        factoryNotification(childSessionId, parentToolCallId, {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: block.is_error === true ? "failed" : "completed",
          ...(text ? { rawOutput: { text } } : {}),
        }),
      );
    }
  }

  return notifications;
}

export function isFactoryTaskTool(update: Record<string, unknown>): boolean {
  const title = factoryString(update.title)?.toLowerCase();
  const name = factoryString(update.name)?.toLowerCase();
  const rawInput = factoryRecord(update.rawInput);
  return title === "task" || name === "task" || factoryString(rawInput.subagent_type) !== undefined;
}

export function factoryRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function factoryString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function factoryNotification(
  sessionId: string,
  parentToolCallId: string,
  update: Record<string, unknown>,
): SessionNotification {
  return {
    sessionId,
    update: {
      ...update,
      _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: parentToolCallId },
    },
  } as unknown as SessionNotification;
}

function factoryToolKind(name: string): string {
  const normalized = name.toLowerCase();
  if (["execute", "exec", "shell", "bash"].includes(normalized)) return "execute";
  if (["edit", "write", "applypatch", "apply_patch"].includes(normalized)) return "edit";
  if (["grep", "glob", "search", "websearch"].includes(normalized)) return "search";
  return normalized;
}

function factoryToolTitle(name: string, input: Record<string, unknown>): string {
  const normalized = name.toLowerCase();
  if (normalized === "task") return factoryString(input.description) ?? name;
  if (normalized === "read") {
    const path = factoryString(input.file_path) ?? factoryString(input.path);
    return path ? `Read ${path}` : name;
  }
  if (normalized === "grep") {
    const pattern = factoryString(input.pattern);
    const path = factoryString(input.path);
    return pattern ? `Grep ${pattern}${path ? ` in ${path}` : ""}` : name;
  }
  if (normalized === "glob") {
    const patterns = Array.isArray(input.patterns)
      ? input.patterns.filter((value): value is string => typeof value === "string").join(", ")
      : factoryString(input.pattern);
    return patterns ? `Glob ${patterns}` : name;
  }
  const command = factoryString(input.command);
  return command ?? name;
}

function factoryContentText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  const parts = value.flatMap((entry) => {
    const block = factoryRecord(entry);
    const text = factoryString(block.text);
    return text ? [text] : [];
  });
  return parts.length > 0 ? parts.join("\n") : undefined;
}
