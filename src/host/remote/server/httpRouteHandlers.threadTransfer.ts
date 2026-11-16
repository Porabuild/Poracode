import { dirname } from "node:path";
import { readBoundedNodeRequestBody } from "@/shared/http";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { decodeQueryValue, queryCodecsForRoute } from "@/shared/remote/contract/queryCodecs";
import {
  THREAD_TRANSFER_CHUNK_MAX_BYTES,
  threadTransferCommandSchema,
  threadTransferIdSchema,
  threadTransferUploadQuerySchema,
} from "@/shared/threadTransfer";
import { getSqlite } from "@/host/db/connection";
import { ThreadTransferService } from "@/host/threads/transfer/threadTransferService";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";
import { prepareHostWorktree } from "./hostWorktreeLifecycle";
import { writeJson } from "./httpResponses";
import { requirePathParam, type HttpRouteHandlerTable } from "./httpRouteHandlers.shared";
import { readJsonBody } from "./requestBody";

type ThreadTransferRouteId = "thread-transfer-command" | "thread-transfer-upload";

const services = new WeakMap<RemoteServerContext, ThreadTransferService>();

/**
 * One transfer service per remote server. Desktop and standalone hosts serve
 * the same routes over the same database, attachment root and supervisor, so
 * the capability is complete on every composition (like thread forks).
 */
function threadTransferService(ctx: RemoteServerContext): ThreadTransferService {
  let service = services.get(ctx);
  if (!service) {
    const { options } = ctx;
    service = new ThreadTransferService({
      paths: resolvePoracodePaths(dirname(getSqlite().name)),
      identity: () => ({
        hostId: options.identity.desktopId,
        hostLabel: options.identity.label,
        appVersion: options.appVersion,
      }),
      callSupervisor: (name, payload) => options.callSupervisor(name, payload),
      resolveWorktreePlacement: options.resolveWorktreePlacement
        ? (location) => options.resolveWorktreePlacement!(location)
        : undefined,
      prepareWorktree: (projectId, worktreePath) =>
        prepareHostWorktree(ctx, { projectId, worktreePath }),
      publishThreadsChanged: (threadIds) => ctx.publishThreadsChanged(threadIds),
    });
    services.set(ctx, service);
  }
  return service;
}

/** Thread transfer route handlers (contract `threadTransferRoutes`). */
export const THREAD_TRANSFER_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, ThreadTransferRouteId> = {
  "thread-transfer-command": async ({ ctx, req, res }) => {
    const command = threadTransferCommandSchema.parse(await readJsonBody(req));
    writeJson(res, 200, await threadTransferService(ctx).run(command));
  },

  "thread-transfer-upload": async ({ ctx, req, res, url, params }) => {
    const transferId = threadTransferIdSchema.parse(requirePathParam(params, "transferId"));
    const decoded: Record<string, unknown> = {};
    try {
      for (const codec of queryCodecsForRoute("thread-transfer-upload")) {
        const raw = url.searchParams.get(codec.name);
        if (raw !== null) decoded[codec.name] = decodeQueryValue(codec.kind, raw);
      }
    } catch {
      throw new RemoteHttpError("invalid_request", "Invalid upload query.", 400);
    }
    const query = threadTransferUploadQuerySchema.parse(decoded);
    const data = await readBoundedNodeRequestBody(
      req,
      THREAD_TRANSFER_CHUNK_MAX_BYTES,
      () =>
        new RemoteHttpError("thread_transfer_chunk_too_large", "Upload chunk is too large.", 413),
    );
    writeJson(res, 200, await threadTransferService(ctx).upload(transferId, query, data));
  },
};
