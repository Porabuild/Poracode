import { describe, expect, it } from "vitest";
import {
  jsonCallEnvelopeSchema,
  omittedCallEnvelopeSchema,
  omittedResultSchema,
  remoteProcedureCallEnvelopeSchema,
} from "./resultCodec";
import { gitStatusResultSchema, prStateSchema } from "../contracts";

describe("omitted result codec", () => {
  it("accepts undefined and rejects null or a value", () => {
    expect(omittedResultSchema.safeParse(undefined).success).toBe(true);
    expect(omittedResultSchema.safeParse(null).success).toBe(false);
    expect(omittedResultSchema.safeParse({}).success).toBe(false);
  });

  it("serializes void /api/git/call envelopes by omitting result, never null", () => {
    const envelope = remoteProcedureCallEnvelopeSchema(omittedResultSchema);
    expect(JSON.parse(JSON.stringify({ result: undefined }))).toEqual({});
    expect(envelope.safeParse({}).success).toBe(true);
    expect(envelope.safeParse({ result: undefined }).success).toBe(false);
    expect(envelope.safeParse({ result: null }).success).toBe(false);
    expect(envelope.safeParse({ future: true }).success).toBe(false);
    expect(JSON.stringify({ result: null })).toBe('{"result":null}');
  });

  it("parses json envelopes and rejects a void result:null envelope", () => {
    const envelope = jsonCallEnvelopeSchema(gitStatusResultSchema);
    const parsed = envelope.parse({
      result: {
        isRepo: true,
        branch: "main",
        tracking: "",
        hasRemote: false,
        remoteInfo: null,
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        totalInsertions: 0,
        totalDeletions: 0,
      },
    });
    expect(parsed.result?.branch).toBe("main");
    expect(omittedCallEnvelopeSchema.safeParse({ result: null }).success).toBe(false);
    expect(omittedCallEnvelopeSchema.safeParse({}).success).toBe(true);
  });

  it("requires result for a json procedure and rejects null when the schema is non-nullable", () => {
    const envelope = remoteProcedureCallEnvelopeSchema(gitStatusResultSchema);
    expect(envelope.safeParse({}).success).toBe(false);
    expect(envelope.safeParse({ result: null }).success).toBe(false);
  });

  it("rejects invalid enums and non-integers", () => {
    expect(prStateSchema.safeParse("open").success).toBe(true);
    expect(prStateSchema.safeParse("OPEN").success).toBe(false);
    expect(
      gitStatusResultSchema.safeParse({
        isRepo: true,
        branch: "main",
        tracking: "",
        hasRemote: false,
        remoteInfo: null,
        ahead: 1.5,
        behind: 0,
        staged: [],
        unstaged: [],
        totalInsertions: 0,
        totalDeletions: 0,
      }).success,
    ).toBe(false);
  });
});
