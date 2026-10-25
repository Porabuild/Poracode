import { randomUUID } from "node:crypto";
import {
  HOST_ADMIN_MAX_REQUEST_BYTES,
  HOST_ADMIN_MAX_RESPONSE_BYTES,
  HOST_ADMIN_TIMEOUT_MS,
  hostAdminResultSchema,
  type HostAdminRequest,
  type HostAdminResult,
} from "@/shared/hostAdminProtocol";
import { request, type IncomingMessage } from "node:http";
import {
  HOST_CONTROL_MAX_RESPONSE_BYTES,
  HOST_CONTROL_PROTOCOL_VERSION,
  hostControlPairingResultSchema,
  hostControlReplySchema,
  hostControlShutdownResultSchema,
  hostControlRequestSchema,
  hostControlStatusResultSchema,
  hostDescriptionSchema,
  type HostControlRequest,
  type HostControlReply,
  type HostControlShutdownResult,
  type HostControlStatusResult,
  type HostDescription,
} from "@/shared/hostControlProtocol";
import { readBoundedNodeRequestBody } from "@/shared/http";
import { readHostControlDiscovery } from "./hostControlDiscovery";
import type { HostRootPaths } from "./hostRootPaths";
import { createHostControlRequestProof, verifyHostControlResponse } from "./hostControlAuth";

type ControlOperation = HostControlRequest["operation"];
type ControlResult<Name extends ControlOperation> = Name extends "admin"
  ? HostAdminResult
  : Name extends "describe"
    ? HostDescription
    : Name extends "issue-pairing"
      ? { pairingUrl: string }
      : Name extends "shutdown"
        ? HostControlShutdownResult
        : HostControlStatusResult;
/** Operation payloads are validated per operation by the request schema. */
export type HostControlCallPayload =
  | HostAdminRequest
  | { readonly preset?: "operator" | "viewer" }
  | { readonly expectedVersion: string; readonly expectedEntrypointSha256: string }
  | Record<string, never>;

export interface HostControlCallOptions {
  expectedGeneration?: string;
  requestId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** V6 A.5: viewer/operator grant for issue-pairing. Empty keeps operator. */
  payload?: HostControlCallPayload;
}

export class HostControlRefusedError extends Error {
  constructor(readonly code: Extract<HostControlReply, { ok: false }>["error"]["code"]) {
    super(`Host control request refused: ${code}.`);
  }
}

/**
 * An authenticated version-2 owner that predates an additive operation parses
 * the request and answers HTTP 400 without a response proof. Callers may treat
 * this as "operation unsupported" only after the same owner has answered a
 * verified `describe`; it must never be used as a fallback for a failed
 * authentication or an unverifiable reply on a core operation.
 */
export class HostControlUnsupportedOperationError extends Error {
  constructor(readonly statusCode: number) {
    super(`Host control operation is not supported by this owner (HTTP ${statusCode}).`);
    this.name = "HostControlUnsupportedOperationError";
  }
}

/** A local management call never redirects or retries against another owner. */
export async function callHostControl<Name extends ControlOperation>(
  paths: HostRootPaths,
  operation: Name,
  options: HostControlCallOptions = {},
): Promise<{ requestId: string; ownerGeneration: string; result: ControlResult<Name> }> {
  options.signal?.throwIfAborted();
  const discovery = readHostControlDiscovery(paths);
  if (options.expectedGeneration && discovery.ownerGeneration !== options.expectedGeneration)
    throw new Error("Host owner changed; retry the command explicitly.");
  const maxTimeout = operation === "admin" ? HOST_ADMIN_TIMEOUT_MS : 5_000;
  const timeoutMs = options.timeoutMs ?? maxTimeout;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > maxTimeout)
    throw new Error("Invalid host control request deadline.");
  const input = hostControlRequestSchema.parse({
    version: HOST_CONTROL_PROTOCOL_VERSION,
    requestId: options.requestId ?? randomUUID(),
    ownerGeneration: discovery.ownerGeneration,
    operation,
    payload: options.payload ?? {},
  });
  const body = Buffer.from(JSON.stringify(input));
  if (body.length > HOST_ADMIN_MAX_REQUEST_BYTES)
    throw new Error("Host control request too large.");
  const authority = `127.0.0.1:${discovery.transport.port}`;
  const authorization = createHostControlRequestProof(discovery.token, {
    method: "POST",
    path: "/control",
    authority,
    body,
  });
  return new Promise((resolve, reject) => {
    let response: IncomingMessage | undefined;
    let settled = false;
    const finish = (error?: Error, value?: ControlResult<Name>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      outgoing.destroy();
      response?.destroy();
      if (error) reject(error);
      else if (value !== undefined)
        resolve({
          requestId: input.requestId,
          ownerGeneration: input.ownerGeneration,
          result: value,
        });
    };
    const abort = () => finish(new Error("Host control request was cancelled."));
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        family: 4,
        port: discovery.transport.port,
        method: "POST",
        path: "/control",
        agent: false,
        maxHeaderSize: 4_096,
        headers: {
          host: authority,
          authorization,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          connection: "close",
        },
      },
      (incoming) => {
        response = incoming;
        void readBoundedNodeRequestBody(
          incoming,
          operation === "admin" ? HOST_ADMIN_MAX_RESPONSE_BYTES : HOST_CONTROL_MAX_RESPONSE_BYTES,
          () => new Error("Host control response exceeded its size limit."),
        )
          .then((bytes) => {
            const status = incoming.statusCode ?? 0;
            if (
              !verifyHostControlResponse(
                discovery.token,
                authorization,
                status,
                bytes,
                incoming.headers["x-poracode-control-proof"],
              )
            ) {
              // A pre-D4 owner authenticates the request (same MAC domain) and
              // then rejects the unknown operation with an empty 400 before it
              // can sign a reply. This classification is deliberately narrow:
              // any other unverified response is an invalid peer.
              if ((status === 400 || status === 404 || status === 405) && bytes.length === 0)
                throw new HostControlUnsupportedOperationError(status);
              throw new Error("Invalid host control peer proof.");
            }
            const reply = hostControlReplySchema.parse(JSON.parse(bytes.toString("utf8")));
            if (
              reply.requestId !== input.requestId ||
              reply.ownerGeneration !== input.ownerGeneration
            )
              throw new Error("Host control response did not match the requested owner.");
            if (!reply.ok) throw new HostControlRefusedError(reply.error.code);
            if (status !== 200) throw new Error("Invalid host control status.");
            const value =
              operation === "admin"
                ? hostAdminResultSchema.parse(reply.result)
                : operation === "describe"
                  ? hostDescriptionSchema.parse(reply.result)
                  : operation === "issue-pairing"
                    ? hostControlPairingResultSchema.parse(reply.result)
                    : operation === "shutdown"
                      ? hostControlShutdownResultSchema.parse(reply.result)
                      : hostControlStatusResultSchema.parse(reply.result);
            if (
              input.operation === "admin" &&
              (!("adminVersion" in value) || value.adminVersion !== input.payload.adminVersion)
            )
              throw new Error("Host administration response version did not match the request.");
            if (
              "dataRoot" in value &&
              (value.dataRoot !== paths.dataRoot ||
                value.profileNamespace !== paths.profileNamespace)
            )
              throw new Error("Host description did not match the requested profile.");
            finish(undefined, value as ControlResult<Name>);
          })
          .catch((error: unknown) =>
            finish(
              error instanceof HostControlRefusedError ||
                error instanceof HostControlUnsupportedOperationError
                ? error
                : new Error("Invalid or unavailable host control response."),
            ),
          );
      },
    );
    const timer = setTimeout(
      () => finish(new Error("Timed out waiting for the current host control response.")),
      timeoutMs,
    );
    outgoing.once("error", () => finish(new Error("Current host control could not be reached.")));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    else outgoing.end(body);
  });
}
