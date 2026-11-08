import {
  threadTransferCommandSchema,
  threadTransferResultSchema,
  threadTransferUploadQuerySchema,
  threadTransferUploadResultSchema,
} from "../../../threadTransfer";
import { auditEvent } from "../../auditKinds";
import { defineRoute } from "../helpers";
import type { RemoteHttpRouteContract } from "../types";

/**
 * Thread transfer routes (capabilities.threadTransfer v1). A client holding
 * grants for two hosts drives a move: `describe`/`export`/`read`/`release` on
 * the source, `plan`/upload/`commit`/`abort` on the target. Both routes are
 * operate-scoped writers: export runs Git on the checkout and stages files,
 * and commit creates a worktree and a thread. Older hosts answer 404 and do
 * not advertise the capability, so clients never call them there.
 */
export const threadTransferRoutes: readonly RemoteHttpRouteContract[] = [
  defineRoute({
    id: "thread-transfer-command",
    requiresCurrentProtocol: true,
    method: "POST",
    path: "/api/thread-transfers/command",
    auth: "bearer",
    scopes: ["session:operate"],
    audit: auditEvent("mutate"),
    request: { bodyKind: "json", jsonSchema: threadTransferCommandSchema },
    response: { wireKind: "json", status: 200, jsonSchema: threadTransferResultSchema },
  }),
  defineRoute({
    id: "thread-transfer-upload",
    requiresCurrentProtocol: true,
    method: "POST",
    path: "/api/thread-transfers/{transferId}/package",
    auth: "bearer",
    scopes: ["session:operate"],
    audit: auditEvent("file_write"),
    queryParameters: ["offset", "total", "sha256"],
    request: { bodyKind: "raw-upload", querySchema: threadTransferUploadQuerySchema },
    response: { wireKind: "json", status: 200, jsonSchema: threadTransferUploadResultSchema },
  }),
];
