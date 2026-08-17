import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildRemoteV3IrDocument } from "../generate";
import { buildRemoteV3AuthorityInput, readProtocolManifest, sourceHashOf } from "../hashes";
import {
  assertNativeSchemaKeywordCoverage,
  assertNativeSemanticValidatorCoverage,
  objectFields,
  rootAdapters,
  supportedNativeSchemaKeywords,
} from "./emitterCommon";
import {
  buildNativeBindingOutput,
  NATIVE_BINDINGS_MANIFEST_MAX_BYTES,
  NATIVE_BINDINGS_MANIFEST_MAX_LINE_LENGTH,
} from "./generate";
import {
  buildNativeSchemaGraph,
  collectNativeSchemaRoots,
  resolveLocalSchemaReferences,
} from "./schemaGraph";
import type { JsonSchema, NativeBindingIr } from "./types";
import { parseNativeBindingIr, supportedPortableSemanticValidatorIds } from "./validate";
import { zodToJsonSchema } from "../jsonSchema";

const here = dirname(fileURLToPath(import.meta.url));
const generatedDirectory = join(here, "../../../../../protocol/remote/v3/generated/native");

function input(): { readonly ir: Record<string, unknown>; readonly manifest: unknown } {
  return { ir: buildRemoteV3IrDocument(), manifest: readProtocolManifest() };
}

function resign(ir: Record<string, unknown>, manifest: unknown): void {
  const unsignedIr = { ...ir };
  delete unsignedIr.sourceHash;
  delete unsignedIr.manifestHash;
  ir.sourceHash = sourceHashOf(buildRemoteV3AuthorityInput({ unsignedIr, manifest }));
}

describe("remote v3 native binding generator", () => {
  it("produces three byte-identical runs with authoritative hashes and counts", () => {
    const { ir, manifest } = input();
    const first = buildNativeBindingOutput(ir, manifest);
    const second = buildNativeBindingOutput(ir, manifest);
    const third = buildNativeBindingOutput(ir, manifest);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(first.manifest).toMatchObject({
      formatVersion: 1,
      protocolVersion: 3,
      bindingFormatVersion: 2,
      generatorVersion: 3,
      sourceHash: "sha256:0b791cbd8af119c9e7f49975c3c625f5f1bb03f1938ca74923567ddffa24947f",
      manifestHash: "sha256:d3ccda151ea70b78c25f8b952eb85d6e90b32ed8137d64f1ef0e82c3565d6f6c",
      counts: {
        routes: 56,
        procedures: 100,
        voidProcedureResults: 36,
        jsonProcedureResults: 64,
        webSocketClientVariants: 8,
        webSocketServerVariants: 9,
        schemaRoots: 293,
        structuralTypes: 698,
        semanticValidators: 16,
        swiftFiles: 40,
        kotlinFiles: 35,
      },
    });
  });

  it("rejects version and hash drift before emitting source", () => {
    const { ir, manifest } = input();
    expect(() => parseNativeBindingIr({ ...ir, protocolVersion: 4 }, manifest)).toThrow(
      /unsupported protocol version/,
    );
    expect(() => parseNativeBindingIr({ ...ir, bindingFormatVersion: 3 }, manifest)).toThrow(
      /unsupported binding format/,
    );
    expect(() => parseNativeBindingIr({ ...ir, generatorVersion: 2 }, manifest)).toThrow(
      /unsupported generator version/,
    );
    expect(() =>
      parseNativeBindingIr({ ...ir, sourceHash: `sha256:${"0".repeat(64)}` }, manifest),
    ).toThrow(/sourceHash mismatch/);
    expect(() =>
      parseNativeBindingIr({ ...ir, manifestHash: `sha256:${"0".repeat(64)}` }, manifest),
    ).toThrow(/manifestHash mismatch/);
  });

  it("fails closed on malformed compatibility metadata and inventory counts", () => {
    const { ir, manifest } = input();
    for (const unknownObjectFields of [undefined, "passthrough", "garbage"]) {
      const invalid = { ...structuredClone(ir), unknownObjectFields };
      resign(invalid, manifest);
      expect(() => parseNativeBindingIr(invalid, manifest)).toThrow(/unknownObjectFields/);
    }
    const omitted = structuredClone(ir);
    const procedure = (omitted.procedures as Array<{ result: Record<string, unknown> }>).find(
      ({ result }) => result.kind === "omitted",
    )!;
    procedure.result.presence = "present";
    resign(omitted, manifest);
    expect(() => parseNativeBindingIr(omitted, manifest)).toThrow(/omitted-result metadata/);

    for (const count of ["voidProcedureResults", "jsonProcedureResults"] as const) {
      const invalid = structuredClone(ir);
      (invalid.inventory as Record<string, number>)[count]! += 1;
      resign(invalid, manifest);
      expect(() => parseNativeBindingIr(invalid, manifest)).toThrow(
        /procedure result count mismatch/i,
      );
    }
  });

  it("rejects every unregistered reachable Zod transform or overwrite", () => {
    expect(() =>
      zodToJsonSchema(z.object({ value: z.string().transform((value) => value) }), "input"),
    ).toThrow(/no registered portable implementation/);
    expect(() =>
      zodToJsonSchema(z.object({ value: z.string().overwrite((value) => value) }), "input"),
    ).toThrow(/no registered portable implementation/);
  });

  it("resolves local refs and structurally deduplicates with collision-stable names", () => {
    const shared = {
      type: "object",
      properties: { value: { type: "integer" } },
      required: ["value"],
    };
    const resolved = resolveLocalSchemaReferences({
      $defs: { shared },
      type: "array",
      items: { $ref: "#/$defs/shared" },
    });
    expect(resolved).toEqual({ type: "array", items: shared });
    expect(() => resolveLocalSchemaReferences({ $ref: "https://example.com/schema" })).toThrow(
      /Only local JSON Schema references/,
    );

    const graph = buildNativeSchemaGraph([
      { id: "a", preferredName: "same", schema: shared, transport: "json" },
      { id: "b", preferredName: "different", schema: shared, transport: "json" },
      { id: "c", preferredName: "same", schema: { ...shared, required: [] }, transport: "json" },
    ]);
    expect(graph.roots.get("a")).toBe(graph.roots.get("b"));
    expect(graph.roots.get("a")?.name).not.toBe(graph.roots.get("c")?.name);

    const collidingFields = objectFields(
      { type: "object", properties: { A: { type: "string" }, a: { type: "integer" } } },
      "swift",
    );
    expect(new Set(collidingFields.map((field) => field.memberName)).size).toBe(2);
    expect(collidingFields.map((field) => field.wireName)).toEqual(["A", "a"]);
  });

  it("emits three-state fields, strict/strip policies, strict unit envelopes, and safe integers", () => {
    const { ir, manifest } = input();
    const output = buildNativeBindingOutput(ir, manifest).files;
    const swift = Object.entries(output)
      .filter(([path]) => path.startsWith("swift/"))
      .map(([, contents]) => contents)
      .join("\n");
    const kotlin = Object.entries(output)
      .filter(([path]) => path.startsWith("kotlin/"))
      .map(([, contents]) => contents)
      .join("\n");
    expect(swift).toContain("enum RemoteField<Value");
    expect(swift).toMatch(/RemoteField<[^>]+> = \.missing/);
    expect(swift).toMatch(/wireName: "contextUsage"[^\n]+required: false, nullable: true/);
    expect(swift).toMatch(/wireName: "generation"[^\n]+required: true, nullable: true/);
    expect(swift).toMatch(/generation: RemoteField<String>\n/);
    expect(swift).toContain('semanticValidatorIds: ["mcp.valid-url"]');
    expect(swift).toContain("maximum: 9007199254740991");
    expect(swift).toContain("Unknown field in strict object");
    expect(swift).toContain("Unit envelope must be exactly {}");
    expect(swift).toContain("Int64(data.utf16.count)");
    expect(swift).toContain("9_007_199_254_740_991");
    expect(swift).toContain("value.sign == .minus");
    expect(kotlin).toContain("sealed interface RemoteField<out T>");
    expect(kotlin).toContain("RemoteField.Missing");
    expect(kotlin).toContain("Unit envelope must be exactly {}");
    expect(kotlin).toContain("data.length.toLong()");
    expect(kotlin).toContain("toRawBits() == (-0.0).toRawBits()");
    expect(kotlin).toMatch(
      /@Serializable\(with = WebSocketServerMessage_[^.]+\.Serializer::class\)/,
    );
    expect(kotlin).toContain("jsonDecoder.decodeJsonElement()");
    expect(kotlin).toContain("jsonEncoder.encodeJsonElement(element)");
    expect(kotlin).toContain("Ambiguous union $name matched options");
    expect(kotlin).toContain('matchesProperty(element, "type", listOf(JsonPrimitive("ready")))');
    expect(kotlin).not.toMatch(/@Serializable\nsealed interface/);
    expect(swift).toContain("var matches: [(Int, WebSocketServerMessage_");
    expect(swift).toContain("Ambiguous union WebSocketServerMessage_");
    expect(swift).toContain(
      'matchesProperty(decoder, property: "type", literals: [.string("ready")])',
    );
    expect(swift).toContain("RemoteUnknownFieldPolicy = .reject");
    expect(swift).toContain("RemoteUnknownFieldPolicy = .strip");
    expect(swift).toContain("defaultValue: RemoteJSONValue?");
    expect(swift).toContain("public let value: Value");
    expect(swift).toContain("encodeSnapshot");
    expect(swift).toContain("validationBoundary: RemoteValidationBoundary = .rootCodecOnly");
    expect(swift).toContain('transformIds: ["agent-settings.strip-sensitive"]');
    expect(kotlin).toContain("val value: T, val validatedSnapshot");
    expect(kotlin).toContain("encodeSnapshot");
    expect(kotlin).toContain("validationBoundary = RemoteValidationBoundary.ROOT_CODEC_ONLY");
    expect(kotlin).toContain('transformIds = listOf("agent-settings.strip-sensitive")');
  });

  it("covers every transport descriptor and permits only portable semantic validators", () => {
    const { ir, manifest } = input();
    const parsed = parseNativeBindingIr(ir, manifest);
    const output = buildNativeBindingOutput(ir, manifest).files;
    const swiftMetadata = Object.entries(output)
      .filter(([path]) => path.startsWith("swift/Metadata"))
      .map(([, contents]) => contents)
      .join("\n");
    for (const route of parsed.routes) {
      expect(swiftMetadata).toContain(`id: ${JSON.stringify(route.id)}`);
      expect(swiftMetadata).toContain(`bodyKind: ${JSON.stringify(route.request.bodyKind)}`);
      expect(swiftMetadata).toContain(`responseKind: ${JSON.stringify(route.response.wireKind)}`);
    }
    for (const procedure of parsed.procedures) {
      expect(swiftMetadata).toContain(`name: ${JSON.stringify(procedure.name)}`);
    }
    expect(parsed.semanticValidatorIds).toEqual(supportedPortableSemanticValidatorIds());
    expect(JSON.stringify(ir)).not.toContain("zod.custom-refine");

    const invalid = structuredClone(ir);
    const routes = invalid.routes as Array<{ request: { jsonSchema?: JsonSchema } }>;
    (
      routes.find((route) => route.request.jsonSchema)!.request.jsonSchema as Record<
        string,
        unknown
      >
    )["x-poracode-semanticValidators"] = ["generic.refinement"];
    invalid.semanticValidatorIds = [
      ...(invalid.semanticValidatorIds as string[]),
      "generic.refinement",
    ].sort();
    resign(invalid, manifest);
    expect(() => parseNativeBindingIr(invalid, manifest)).toThrow(/unsupported semantic validator/);

    expect(() =>
      assertNativeSemanticValidatorCoverage({
        ...parsed,
        semanticValidatorIds: [...parsed.semanticValidatorIds, "future.validator"],
      } as NativeBindingIr),
    ).toThrow(/No executable native semantic validator implementation for future.validator/);
  });

  it("emits a stable executable codec API for every authoritative root", () => {
    const { ir, manifest } = input();
    const parsed = parseNativeBindingIr(ir, manifest);
    const graph = buildNativeSchemaGraph(collectNativeSchemaRoots(parsed));
    const output = buildNativeBindingOutput(ir, manifest).files;
    for (const language of ["swift", "kotlin"] as const) {
      const adapters = rootAdapters(graph, language);
      expect(adapters).toHaveLength(293);
      const source = Object.entries(output)
        .filter(([path]) => path.startsWith(`${language}/RootCodecs`))
        .map(([, contents]) => contents)
        .join("\n");
      for (const adapter of adapters) {
        expect(source).toContain(adapter.memberName);
        expect(source).toContain(JSON.stringify(adapter.id));
      }
    }
  });

  it("fails closed on schema keywords without an executable native implementation", () => {
    expect(supportedNativeSchemaKeywords()).toEqual([
      "additionalProperties",
      "anyOf",
      "const",
      "default",
      "description",
      "enum",
      "exclusiveMaximum",
      "exclusiveMinimum",
      "format",
      "items",
      "maxItems",
      "maxLength",
      "maximum",
      "minItems",
      "minLength",
      "minimum",
      "oneOf",
      "pattern",
      "properties",
      "propertyNames",
      "required",
      "title",
      "type",
      "x-poracode-semanticValidators",
      "x-poracode-transforms",
      "x-poracode-unknownFields",
    ]);
    const graph = buildNativeSchemaGraph([
      {
        id: "unsupported",
        preferredName: "Unsupported",
        schema: { type: "string", multipleOf: 2 },
        transport: "test",
      },
    ]);
    expect(() => assertNativeSchemaKeywordCoverage(graph)).toThrow(
      /No executable native JSON Schema implementation for multipleOf/,
    );
  });

  it("keeps every generated language shard within 450 lines and inventories exact bytes", () => {
    const diskManifest = JSON.parse(
      readFileSync(join(generatedDirectory, "native-bindings.json"), "utf8"),
    ) as {
      languages: Record<string, { files: Array<{ path: string; lines: number; bytes: number }> }>;
    };
    for (const language of Object.values(diskManifest.languages)) {
      for (const file of language.files) {
        const contents = readFileSync(join(generatedDirectory, file.path), "utf8");
        expect(contents.split("\n").length - 1).toBe(file.lines);
        expect(Buffer.byteLength(contents)).toBe(file.bytes);
        expect(file.lines).toBeLessThanOrEqual(450);
      }
    }
    const manifestContents = readFileSync(join(generatedDirectory, "native-bindings.json"), "utf8");
    expect(Buffer.byteLength(manifestContents)).toBeLessThanOrEqual(
      NATIVE_BINDINGS_MANIFEST_MAX_BYTES,
    );
    expect(
      Math.max(...manifestContents.split("\n").map((line) => line.length)),
    ).toBeLessThanOrEqual(NATIVE_BINDINGS_MANIFEST_MAX_LINE_LENGTH);
  });

  it("rejects a synthetic generated source line that exceeds the bounded size policy", () => {
    const { ir, manifest } = input();
    const invalid = structuredClone(ir);
    const route = (invalid.routes as Array<{ request: { jsonSchema?: JsonSchema } }>).find(
      ({ request }) => request.jsonSchema,
    )!;
    route.request.jsonSchema = {
      type: "object",
      properties: { huge: { type: "string", default: "x".repeat(40_000) } },
    };
    resign(invalid, manifest);
    expect(() => buildNativeBindingOutput(invalid, manifest)).toThrow(/character line/);
  });
});
