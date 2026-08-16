import type { z } from "zod";
import type { RemoteAccessScope } from "../protocol";
import type { RemoteProcedureOwner } from "../procedures";
import type { QueryParameterCodec } from "./queryCodecs";

export type RemoteHttpMethod = "GET" | "POST" | "DELETE";

export type RemoteRouteAuth =
  | "public"
  | "pairing-token"
  | "bearer"
  | "bearer-or-query"
  | "forward-enter-token";

export type RemoteRequestBodyKind = "json" | "empty" | "raw-upload";

export type RemoteResponseWireKind =
  | "json"
  | "binary"
  | "empty"
  | "unit"
  | "redirect-html"
  | "procedure-result";

export type RemoteIdempotency = "command-id-header" | "command-id-header-for-start-kind";

/** Protocol-level compatibility for unknown object fields on the wire. */
export type RemoteProtocolUnknownFieldPolicy = "ignore" | "reject";

/**
 * Per-object Zod/JSON-Schema policy. Distinct from the protocol-level
 * `unknownObjectFields: ignore` compatibility knob.
 *
 * - `strip`: Zod default object — extra keys are dropped (forward-compatible).
 * - `reject`: `z.strict()` / `z.strictObject()` — extra keys fail validation.
 * - `passthrough`: `z.passthrough()` / `z.looseObject()` — extra keys kept.
 */
export type RemoteObjectUnknownFieldPolicy = "strip" | "reject" | "passthrough";

export interface RemoteHttpRequestContract {
  readonly bodyKind: RemoteRequestBodyKind;
  readonly jsonSchema?: z.ZodType;
  readonly querySchema?: z.ZodType;
  readonly pathSchema?: z.ZodType;
}

export interface RemoteHttpResponseContract {
  readonly wireKind: RemoteResponseWireKind;
  readonly status: number;
  readonly jsonSchema?: z.ZodType;
  /** Present when `wireKind` is `binary`. */
  readonly contentType?: string;
  /** Alternate status for the documented error page of redirect/html routes. */
  readonly errorStatus?: number;
  readonly errorBodyKind?: "html";
}

export interface RemoteHttpRouteContract {
  readonly id: string;
  readonly method: RemoteHttpMethod;
  readonly path: string;
  readonly auth: RemoteRouteAuth;
  readonly scopes: readonly RemoteAccessScope[];
  readonly scopeResolution?: "procedure-defined";
  readonly queryParameters?: readonly string[];
  readonly queryCodecs?: readonly QueryParameterCodec[];
  readonly pathParameters?: readonly string[];
  readonly legacy?: true;
  readonly idempotency?: RemoteIdempotency;
  readonly request: RemoteHttpRequestContract;
  readonly response: RemoteHttpResponseContract;
}

export type RemoteProcedureResultKind = "json" | "omitted";

export interface RemoteProcedureContract {
  readonly name: string;
  readonly scope: RemoteAccessScope;
  readonly owner: RemoteProcedureOwner;
  readonly timeout?: "long";
  readonly requestSchema: z.ZodType;
  readonly resultKind: RemoteProcedureResultKind;
  readonly resultSchema: z.ZodType;
}

export interface RemoteContractInventory {
  readonly routes: number;
  readonly procedures: number;
  readonly voidProcedureResults: number;
  readonly jsonProcedureResults: number;
  readonly blockedProcedureResults: readonly string[];
  readonly webSocketClientMessages: number;
  readonly webSocketServerMessages: number;
  readonly replayableEventTypes: number;
  readonly runtimeEventTypes: number;
}

export interface RemoteContractRegistry {
  readonly contract: "poracode.remote";
  readonly protocolVersion: number;
  readonly bindingFormatVersion: number;
  readonly generatorVersion: number;
  readonly unknownObjectFields: RemoteProtocolUnknownFieldPolicy;
  readonly routes: readonly RemoteHttpRouteContract[];
  readonly procedures: readonly RemoteProcedureContract[];
  readonly inventory: RemoteContractInventory;
}
