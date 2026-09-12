import { z } from "zod";

/**
 * Shared void/unit codec for IPC and remote procedure results.
 *
 * `POST /api/git/call` writes `{ result: await runRemoteProcedure(...) }`.
 * `JSON.stringify` omits keys whose value is `undefined`, so a void handler
 * produces `{}` — the `result` field is absent, never `null`.
 *
 * Bindings must treat this as unit/omitted. Do not decode `null` as success.
 */
export const omittedResultSchema = z
  .undefined({
    error: "void results are omitted from the wire; null is not a unit value",
  })
  .describe("omitted");

export type OmittedResult = void;

export const OMITTED_RESULT_WIRE_KIND = "omitted" as const;

export function isOmittedResult(value: unknown): value is undefined {
  return value === undefined;
}

/**
 * Success envelope for a void `/api/git/call`. Exactly `{}`.
 * `{ result: null }` and any other extra key are invalid.
 */
export type OmittedCallEnvelope = Readonly<Record<string, never>>;

export const omittedCallEnvelopeSchema: z.ZodType<OmittedCallEnvelope> = z
  .strictObject({})
  .refine((value) => !Object.hasOwn(value, "result"), {
    message: "void procedure results must omit `result`; null is not allowed",
    path: ["result"],
  });

export function jsonCallEnvelopeSchema<Result extends z.ZodType>(resultSchema: Result) {
  return z.object({ result: resultSchema });
}

/**
 * Envelope for a generic `/api/git/call` success body.
 *
 * Non-void procedures: `{ result: T }`.
 * Void procedures: `{}` (`result` omitted). `{ result: null }` is invalid.
 */
export function isOmittedResultSchema(schema: z.ZodType): boolean {
  return schema === omittedResultSchema;
}

export function remoteProcedureCallEnvelopeSchema(resultSchema: z.ZodType) {
  if (isOmittedResultSchema(resultSchema)) {
    return omittedCallEnvelopeSchema;
  }
  return jsonCallEnvelopeSchema(resultSchema);
}

export function parseRemoteProcedureResultValue<Result>(
  resultSchema: z.ZodType<Result>,
  value: unknown,
): Result {
  return resultSchema.parse(value);
}

export function parseRemoteProcedureSuccessEnvelope(
  resultSchema: z.ZodType,
  envelope: unknown,
): unknown {
  if (isOmittedResultSchema(resultSchema)) {
    omittedCallEnvelopeSchema.parse(envelope);
    return undefined;
  }
  return jsonCallEnvelopeSchema(resultSchema).parse(envelope).result;
}
