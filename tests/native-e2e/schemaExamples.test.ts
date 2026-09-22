import { describe, expect, it } from "vitest";
import { generatedRoute } from "./harness/generatedContract.ts";
import { schemaExample } from "./harness/schemaExamples.ts";
import { parseWithSchema, resolveRouteSchemas } from "./harness/schemaValidation.ts";

describe("generated schema examples", () => {
  it("produces a pattern-valid baseCommit for the experiment-command request", () => {
    const route = generatedRoute("experiment-command");
    const body = schemaExample(route.request.jsonSchema) as {
      record?: { baseCommit?: unknown };
    };
    expect(typeof body.record?.baseCommit).toBe("string");
    expect(body.record?.baseCommit).toMatch(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
  });

  it("builds a request body the authoritative experiment-command schema accepts", () => {
    const route = generatedRoute("experiment-command");
    const body = schemaExample(route.request.jsonSchema);
    const schemas = resolveRouteSchemas(route.id);
    expect(schemas.availability).toBe("zod");
    expect(parseWithSchema(schemas.requestSchema, body, "experiment-command request")).toBeTruthy();
  });
});
