import { canonicalize, sha256Prefixed } from "../canonical";
import { compareUnicodeCodePoints } from "../unicodeOrder";
import { emitKotlinBindings } from "./emitKotlin";
import { emitSwiftBindings } from "./emitSwift";
import {
  assertNativeSchemaKeywordCoverage,
  assertNativeSemanticValidatorCoverage,
} from "./emitterCommon";
import { buildNativeSchemaGraph, collectNativeSchemaRoots } from "./schemaGraph";
import type { NativeBindingOutput } from "./types";
import { parseNativeBindingIr } from "./validate";

export const NATIVE_BINDINGS_MANIFEST_FORMAT_VERSION = 1 as const;
export const NATIVE_BINDINGS_MAX_FILE_LINES = 450 as const;
export const NATIVE_BINDINGS_MAX_FILE_BYTES = 512_000 as const;
export const NATIVE_BINDINGS_MAX_LINE_LENGTH = 32_768 as const;
/** The JSON manifest is metadata rather than a source shard, so it is exempt
 * from the 450-line source limit but has explicit byte and line-length bounds. */
export const NATIVE_BINDINGS_MANIFEST_MAX_BYTES = 65_536 as const;
export const NATIVE_BINDINGS_MANIFEST_MAX_LINE_LENGTH = 256 as const;

function lineCount(contents: string): number {
  return contents.endsWith("\n")
    ? contents.slice(0, -1).split("\n").length
    : contents.split("\n").length;
}

function assertContentBounds(
  name: string,
  contents: string,
  maxBytes: number,
  maxLineLength: number,
): void {
  const bytes = Buffer.byteLength(contents);
  if (bytes > maxBytes) throw new Error(`${name} has ${bytes} bytes; maximum is ${maxBytes}`);
  const longest = contents.split("\n").reduce((maximum, line) => Math.max(maximum, line.length), 0);
  if (longest > maxLineLength) {
    throw new Error(`${name} has a ${longest}-character line; maximum is ${maxLineLength}`);
  }
}

function inventory(files: Readonly<Record<string, string>>, prefix: string) {
  return Object.keys(files)
    .sort(compareUnicodeCodePoints)
    .map((name) => {
      const contents = files[name]!;
      assertContentBounds(
        `${prefix}/${name}`,
        contents,
        NATIVE_BINDINGS_MAX_FILE_BYTES,
        NATIVE_BINDINGS_MAX_LINE_LENGTH,
      );
      const lines = lineCount(contents);
      if (lines > NATIVE_BINDINGS_MAX_FILE_LINES) {
        throw new Error(
          `${prefix}/${name} has ${lines} lines; maximum is ${NATIVE_BINDINGS_MAX_FILE_LINES}`,
        );
      }
      return {
        path: `${prefix}/${name}`,
        sha256: sha256Prefixed(contents),
        bytes: Buffer.byteLength(contents),
        lines,
      };
    });
}

function treeHash(files: Readonly<Record<string, string>>): string {
  const authority = Object.keys(files)
    .sort(compareUnicodeCodePoints)
    .map((path) => ({ path, sha256: sha256Prefixed(files[path]!) }));
  return sha256Prefixed(canonicalize(authority));
}

export function buildNativeBindingOutput(rawIr: unknown, manifest: unknown): NativeBindingOutput {
  const ir = parseNativeBindingIr(rawIr, manifest);
  const roots = collectNativeSchemaRoots(ir);
  const graph = buildNativeSchemaGraph(roots);
  assertNativeSemanticValidatorCoverage(ir);
  assertNativeSchemaKeywordCoverage(graph);
  const swift = emitSwiftBindings(ir, graph);
  const kotlin = emitKotlinBindings(ir, graph);
  const swiftInventory = inventory(swift, "swift");
  const kotlinInventory = inventory(kotlin, "kotlin");
  const files: Record<string, string> = {};
  for (const name of Object.keys(swift).sort(compareUnicodeCodePoints))
    files[`swift/${name}`] = swift[name]!;
  for (const name of Object.keys(kotlin).sort(compareUnicodeCodePoints))
    files[`kotlin/${name}`] = kotlin[name]!;

  const outputHash = treeHash(files);
  const nativeManifest = {
    formatVersion: NATIVE_BINDINGS_MANIFEST_FORMAT_VERSION,
    doNotEdit: "GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.",
    contract: ir.contract,
    protocolVersion: ir.protocolVersion,
    bindingFormatVersion: ir.bindingFormatVersion,
    generatorVersion: ir.generatorVersion,
    sourceHash: ir.sourceHash,
    manifestHash: ir.manifestHash,
    outputHash,
    counts: {
      routes: ir.routes.length,
      procedures: ir.procedures.length,
      voidProcedureResults: ir.inventory.voidProcedureResults,
      jsonProcedureResults: ir.inventory.jsonProcedureResults,
      webSocketClientVariants: ir.webSocket.clientMessages.length,
      webSocketServerVariants: ir.webSocket.serverMessages.length,
      schemaRoots: roots.length,
      structuralTypes: graph.nodes.length,
      semanticValidators: ir.semanticValidatorIds.length,
      portableTransforms: ir.portableTransformIds.length,
      swiftFiles: swiftInventory.length,
      kotlinFiles: kotlinInventory.length,
    },
    languages: {
      swift: {
        languageVersion: "6",
        treeHash: treeHash(swift),
        lines: swiftInventory.reduce((sum, file) => sum + file.lines, 0),
        files: swiftInventory,
      },
      kotlin: {
        languageVersion: "2.4",
        treeHash: treeHash(kotlin),
        lines: kotlinInventory.reduce((sum, file) => sum + file.lines, 0),
        files: kotlinInventory,
      },
    },
  };
  const manifestContents = canonicalize(nativeManifest);
  assertContentBounds(
    "native-bindings.json",
    manifestContents,
    NATIVE_BINDINGS_MANIFEST_MAX_BYTES,
    NATIVE_BINDINGS_MANIFEST_MAX_LINE_LENGTH,
  );
  files["native-bindings.json"] = manifestContents;
  return { files, manifest: nativeManifest };
}
