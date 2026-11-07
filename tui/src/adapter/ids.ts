export function sessionId(id: string) {
  return `ses_${id}`;
}

export function threadId(session: string) {
  return session.startsWith("ses_") ? session.slice(4) : session;
}

// Virtual read-only child sessions for subagent task items: the canonical
// tool_call payload carries no child-thread reference, so the adapter
// synthesizes a session per task item nested via `parentItemId`.
export function subSessionId(rawThreadId: string, rawItemId: string) {
  return `ses_${rawThreadId}__${rawItemId.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
}

export function parseSubSessionId(session: string) {
  if (!session.startsWith("ses_")) return undefined;
  const rest = session.slice(4);
  const index = rest.indexOf("__");
  if (index <= 0 || index >= rest.length - 2) return undefined;
  return { threadId: rest.slice(0, index), itemId: rest.slice(index + 2) };
}

export function messageId(value: string) {
  return `msg_${value.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
}

export function itemId(message: string) {
  const value = message.startsWith("msg_") ? message.slice(4) : message;
  return value.replace(/[^A-Za-z0-9_-]/gu, "_");
}

export function permissionId(request: string) {
  return `per_${Buffer.from(request, "utf8").toString("base64url")}`;
}

export function permissionRequestId(permission: string) {
  if (!permission.startsWith("per_")) return "";
  return Buffer.from(permission.slice(4), "base64url").toString("utf8");
}

export function formId(rawThreadId: string, requestId: string) {
  return `frm_${Buffer.from(JSON.stringify([rawThreadId, requestId]), "utf8").toString("base64url")}`;
}

export function requestIdFromFormId(id: string, expectedThreadId: string) {
  if (!id.startsWith("frm_")) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(id.slice(4), "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value[0] !== expectedThreadId ||
    typeof value[1] !== "string" ||
    formId(expectedThreadId, value[1]) !== id
  )
    return undefined;
  return value[1];
}
