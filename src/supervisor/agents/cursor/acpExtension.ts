import type { AcpExtensionNotificationHandler } from "../base/types";
import {
  isCursorTaskExtension,
  mapCursorTaskExtension,
  parseCursorTaskExtensionParams,
} from "./acpTaskExtension";

export const handleCursorAcpExtensionNotification: AcpExtensionNotificationHandler = (
  method,
  params,
  ctx,
) => {
  if (!isCursorTaskExtension(method)) return [];
  const parsed = parseCursorTaskExtensionParams(params);
  if (!parsed) return [];
  const parentItemId = ctx.resolveToolCallItemId(parsed.toolCallId);
  if (!parentItemId) return [];
  return mapCursorTaskExtension(ctx.threadId, parentItemId, parsed);
};
