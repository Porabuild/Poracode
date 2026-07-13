import { z } from "zod";

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
): IpcProcedureDef<Args, Payload, Result, Transport> {
  return {
    channel: createChannel(name),
    transport,
    payloadSchema,
    parseArgs,
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
): IpcProcedureDef<[Payload], Payload, Result, Transport> {
  return defineIpcProcedure(name, transport, payloadSchema, (payload) =>
    payloadSchema.parse(payload),
  );
}

export function defineNoArgProcedure<Result, Transport extends IpcTransport>(
  name: string,
  transport: Transport,
): IpcProcedureDef<[], EmptyPayload, Result, Transport> {
  return defineIpcProcedure(name, transport, emptyPayloadSchema, () =>
    emptyPayloadSchema.parse({}),
  );
}
