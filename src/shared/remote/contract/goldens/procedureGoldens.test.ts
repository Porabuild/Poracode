import { describe, expect, it } from "vitest";
import { ipcProcedureMap } from "../../../ipc/procedureMap";
import {
  omittedCallEnvelopeSchema,
  parseRemoteProcedureSuccessEnvelope,
  remoteProcedureCallEnvelopeSchema,
} from "../../../ipc/resultCodec";
import { REMOTE_PROCEDURE_SPECS, type RemoteProcedureName } from "../../procedures";
import { REMOTE_PROCEDURE_CONTRACTS } from "../procedures";
import { REMOTE_PROCEDURE_RESULT_FIXTURES } from "./procedureFixtures";

const PROCEDURE_NAMES = Object.keys(REMOTE_PROCEDURE_SPECS) as RemoteProcedureName[];
const OMITTED_NAMES = REMOTE_PROCEDURE_CONTRACTS.filter(
  (procedure) => procedure.resultKind === "omitted",
).map((procedure) => procedure.name as RemoteProcedureName);
const JSON_NAMES = REMOTE_PROCEDURE_CONTRACTS.filter(
  (procedure) => procedure.resultKind === "json",
).map((procedure) => procedure.name as RemoteProcedureName);

function negativeFor(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return { not: "nullable" };
  if (typeof value === "boolean") return "true";
  if (typeof value === "number") return "1";
  if (typeof value === "string") return 1;
  if (Array.isArray(value)) return {};
  if (value && typeof value === "object") return null;
  return { invalid: true };
}

describe("remote procedure result goldens", () => {
  it("covers every allowlisted procedure exactly once", () => {
    expect(PROCEDURE_NAMES).toHaveLength(100);
    expect(Object.keys(REMOTE_PROCEDURE_RESULT_FIXTURES).sort()).toEqual(
      [...PROCEDURE_NAMES].sort(),
    );
    expect(REMOTE_PROCEDURE_CONTRACTS).toHaveLength(100);
    expect(OMITTED_NAMES).toHaveLength(36);
    expect(JSON_NAMES).toHaveLength(64);
  });

  it.each(PROCEDURE_NAMES)("parses the producer fixture for %s", (name) => {
    const contract = REMOTE_PROCEDURE_CONTRACTS.find((procedure) => procedure.name === name);
    expect(contract).toBeDefined();
    const schema = ipcProcedureMap[name].resultSchema;
    expect(schema).toBe(contract?.resultSchema);
    const fixture = REMOTE_PROCEDURE_RESULT_FIXTURES[name];
    expect(schema?.parse(fixture)).toEqual(fixture);
  });

  it.each(OMITTED_NAMES)("rejects null and result:null for void %s", (name) => {
    const schema = ipcProcedureMap[name].resultSchema;
    expect(schema).toBeDefined();
    expect(schema!.safeParse(null).success).toBe(false);
    expect(omittedCallEnvelopeSchema.safeParse({}).success).toBe(true);
    expect(omittedCallEnvelopeSchema.safeParse({ result: null }).success).toBe(false);
    expect(parseRemoteProcedureSuccessEnvelope(schema!, {})).toBeUndefined();
    expect(() => parseRemoteProcedureSuccessEnvelope(schema!, { result: null })).toThrowError(
      /result/,
    );
  });

  it.each(JSON_NAMES)("requires a result envelope and rejects a mutation for %s", (name) => {
    const schema = ipcProcedureMap[name].resultSchema;
    expect(schema).toBeDefined();
    const fixture = REMOTE_PROCEDURE_RESULT_FIXTURES[name];
    const envelope = remoteProcedureCallEnvelopeSchema(schema!);
    expect(envelope.parse({ result: fixture })).toMatchObject({ result: fixture });
    expect(envelope.safeParse({}).success).toBe(false);
    expect(schema!.safeParse(negativeFor(fixture)).success).toBe(false);
  });
});
