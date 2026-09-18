import { z } from "zod";
import type { NormalizeExactOptionalProperties } from "../contracts/exactType";

export { omittedResultSchema } from "./resultCodec";

export type IpcTransport = "main-local" | "supervisor";

export interface IpcProcedureDef<
  Args extends unknown[],
  Payload,
  Result,
  Transport extends IpcTransport,
> {
  channel: string;
  transport: Transport;
  payloadSchema: z.ZodType<Payload>;
  /**
   * Runtime validation for the procedure result. Void results use
   * {@link omittedResultSchema} (wire: field omitted, never null). The output
   * remains tied to the producer result type; the normalizer accounts only for
   * Zod's explicit `| undefined` representation of optional properties.
   * Absent only on procedures that have not yet been given an authoritative
   * result codec — remote allowlisted procedures must always set this.
   */
  resultSchema?: z.ZodType<NormalizeExactOptionalProperties<Result>>;
  parseArgs: (...args: Args) => Payload;
  __types: {
    args: Args;
    payload: Payload;
    result: Result;
  };
}

export const emptyPayloadSchema = z.object({});
export type EmptyPayload = z.infer<typeof emptyPayloadSchema>;

function toKebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function createChannel(name: string): string {
  return `poracode:${toKebabCase(name)}`;
}

export function defineIpcProcedure<
  Args extends unknown[],
  Payload,
  Result,
  Transport extends IpcTransport,
>(
  name: string,
  transport: Transport,
  payloadSchema: z.ZodType<Payload>,
  parseArgs: (...args: Args) => Payload,
  resultSchema?: z.ZodType<NormalizeExactOptionalProperties<Result>>,
): IpcProcedureDef<Args, Payload, Result, Transport> {
  return {
    channel: createChannel(name),
    transport,
    payloadSchema,
    parseArgs,
    ...(resultSchema ? { resultSchema } : {}),
    __types: undefined as unknown as {
      args: Args;
      payload: Payload;
      result: Result;
    },
  };
}

export function definePayloadProcedure<Payload, Result, Transport extends IpcTransport>(
  name: string,
  transport: Transport,
  payloadSchema: z.ZodType<Payload>,
  resultSchema?: z.ZodType<NormalizeExactOptionalProperties<Result>>,
): IpcProcedureDef<[Payload], Payload, Result, Transport> {
  return defineIpcProcedure(
    name,
    transport,
    payloadSchema,
    (payload) => payloadSchema.parse(payload),
    resultSchema,
  );
}

export function defineNoArgProcedure<Result, Transport extends IpcTransport>(
  name: string,
  transport: Transport,
  resultSchema?: z.ZodType<NormalizeExactOptionalProperties<Result>>,
): IpcProcedureDef<[], EmptyPayload, Result, Transport> {
  return defineIpcProcedure(
    name,
    transport,
    emptyPayloadSchema,
    () => emptyPayloadSchema.parse({}),
    resultSchema,
  );
}
