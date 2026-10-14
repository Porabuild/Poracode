import { describe, expect, it } from "vitest";
import { REMOTE_HTTP_ROUTES } from "../../src/shared/remote/contract/routes/index.ts";
import { generatedRoute } from "./harness/generatedContract.ts";
import { schemaExample } from "./harness/schemaExamples.ts";
import { parseWithSchema, resolveRouteSchemas } from "./harness/schemaValidation.ts";

describe("generated schema examples", () => {
  it.each([
    ["file-media-ticket", 2],
    ["file-media", 1],
    ["file-media-release", 2],
    ["environment-media-ticket", 2],
    ["environment-media-release", 2],
  ] as const)(
    "builds authoritative request/query/response examples for %s",
    (id, expectedExamples) => {
      const route = generatedRoute(id);
      const schemas = resolveRouteSchemas(id);
      const authoritative = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === id)!;
      const parsed = [
        { schema: schemas.requestSchema, generated: route.request.jsonSchema },
        { schema: authoritative.request.querySchema, generated: route.request.querySchema },
        { schema: schemas.responseSchema, generated: route.response.jsonSchema },
      ]
        .filter((example) => example.generated !== undefined)
        .map((example) => parseWithSchema(example.schema, schemaExample(example.generated), id));
      expect(parsed).toHaveLength(expectedExamples);
    },
  );
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
