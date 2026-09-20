import { randomUUID } from "node:crypto";
import { request, type IncomingMessage } from "node:http";
import {
  HOST_CONTROL_MAX_RESPONSE_BYTES,
  HOST_CONTROL_PROTOCOL_VERSION,
  hostControlPairingResultSchema,
  hostControlReplySchema,
  hostControlRequestSchema,
  hostDescriptionSchema,
  type HostControlRequest,
  type HostControlReply,
  type HostDescription,
} from "@/shared/hostControlProtocol";
import { readBoundedNodeRequestBody } from "@/shared/http";
import { readHostControlDiscovery } from "./hostControlDiscovery";
import type { HostRootPaths } from "./hostRootPaths";
import { createHostControlRequestProof, verifyHostControlResponse } from "./hostControlAuth";

type ControlOperation = HostControlRequest["operation"];
type ControlResult<Name extends ControlOperation> = Name extends "describe"
  ? HostDescription
  : { pairingUrl: string };

export interface HostControlCallOptions {
  requestId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** V6 A.5: viewer/operator grant for issue-pairing. Empty keeps operator. */
  payload?: { readonly preset?: "operator" | "viewer" };
}

export class HostControlRefusedError extends Error {
  constructor(readonly code: Extract<HostControlReply, { ok: false }>["error"]["code"]) {
    super(`Host control request refused: ${code}.`);
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
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 5_000)
    throw new Error("Invalid host control request deadline.");
  const input = hostControlRequestSchema.parse({
    version: HOST_CONTROL_PROTOCOL_VERSION,
    requestId: options.requestId ?? randomUUID(),
    ownerGeneration: discovery.ownerGeneration,
    operation,
    payload: options.payload ?? {},
  });
  const body = Buffer.from(JSON.stringify(input));
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
          HOST_CONTROL_MAX_RESPONSE_BYTES,
          () => new Error("Host control response exceeded its size limit."),
        )
          .then((bytes) => {
            if (
              !verifyHostControlResponse(
                discovery.token,
                authorization,
                incoming.statusCode ?? 0,
                bytes,
                incoming.headers["x-poracode-control-proof"],
              )
            )
              throw new Error("Invalid host control peer proof.");
            const reply = hostControlReplySchema.parse(JSON.parse(bytes.toString("utf8")));
            if (
              reply.requestId !== input.requestId ||
              reply.ownerGeneration !== input.ownerGeneration
            )
              throw new Error("Host control response did not match the requested owner.");
            if (!reply.ok) throw new HostControlRefusedError(reply.error.code);
            if (incoming.statusCode !== 200) throw new Error("Invalid host control status.");
            const value =
              operation === "describe"
                ? hostDescriptionSchema.parse(reply.result)
                : hostControlPairingResultSchema.parse(reply.result);
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
              error instanceof HostControlRefusedError
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
