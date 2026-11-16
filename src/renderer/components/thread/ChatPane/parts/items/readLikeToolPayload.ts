import type { ToolCallPayload } from "@/shared/contracts";

export function isReadLikeToolPayload(payload: ToolCallPayload): boolean {
  const kind = payload.kind?.trim().toLowerCase();
  if (kind === "read" || kind === "readfile") return true;
  if (payload.name === "Read" || payload.name === "NotebookRead" || payload.name === "ReadFile")
    return true;
  const title = payload.title?.trim() || payload.name.trim();
  return /^(?:view|read)(?:ing)?(?:\s|:|$)/i.test(title);
}
