import { canonicalize, sha256Prefixed } from "../canonical";
import { BACKGROUND_TASK_REDUCE_SPEC } from "../backgroundTaskReduceSpec";
import { FOLLOW_UP_QUEUE_MACHINE_SPEC } from "../followUpQueueMachineSpec";
import { PAIRING_MACHINE_SPEC } from "../pairingMachineSpec";
import { TERMINAL_CURSOR_MACHINE_SPEC } from "../terminalCursorMachineSpec";
import { TERMINAL_KEY_ENCODING_SPEC } from "../terminalKeyEncodingSpec";
import { emitKotlinBackgroundTaskReduce } from "./emitBackgroundTaskReduceKotlin";
import { emitSwiftBackgroundTaskReduce } from "./emitBackgroundTaskReduceSwift";
import { emitKotlinFollowUpQueueMachine } from "./emitFollowUpQueueKotlin";
import { emitSwiftFollowUpQueueMachine } from "./emitFollowUpQueueSwift";
import { compareUnicodeCodePoints } from "../unicodeOrder";
import { emitKotlinBindings } from "./emitKotlin";
import { emitKotlinPairingMachine } from "./emitPairingKotlin";
import { emitKotlinTerminalCursorMachine } from "./emitTerminalCursorKotlin";
import { emitKotlinTerminalKeyEncoding } from "./emitTerminalKeyEncodingKotlin";
import { emitSwiftBindings } from "./emitSwift";
import { emitSwiftPairingMachine } from "./emitPairingSwift";
import { emitSwiftTerminalCursorMachine } from "./emitTerminalCursorSwift";
import { emitSwiftTerminalKeyEncoding } from "./emitTerminalKeyEncodingSwift";
import {
  assertNativeSchemaKeywordCoverage,
  assertNativeSemanticValidatorCoverage,
} from "./emitterCommon";
import { buildNativeSchemaGraph, collectNativeSchemaRoots } from "./schemaGraph";
import type { NativeBindingOutput } from "./types";
import { parseNativeBindingIr } from "./validate";

export const NATIVE_BINDINGS_MANIFEST_FORMAT_VERSION = 5 as const;
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
  /** V5 5.2: the native pairing state machine ships in the same bundle and
   * under the same byte-stability, hash, and size bounds as the wire bindings.
   * The pairing, terminal-cursor, and terminal-key-encoding specs are
   * deliberately NOT part of the wire IR — adding a generated machine must
   * never move sourceHash/manifestHash. */
  const swiftWithMachines: Record<string, string> = {
    ...swift,
    "PairingMachine.swift": emitSwiftPairingMachine(),
    "TerminalCursorMachine.swift": emitSwiftTerminalCursorMachine(),
    "TerminalKeyEncoding.swift": emitSwiftTerminalKeyEncoding(),
    "BackgroundTaskReduce.swift": emitSwiftBackgroundTaskReduce(),
    "FollowUpQueueMachine.swift": emitSwiftFollowUpQueueMachine(),
  };
  const kotlinWithMachines: Record<string, string> = {
    ...kotlin,
    "PairingMachine.kt": emitKotlinPairingMachine(),
    "TerminalCursorMachine.kt": emitKotlinTerminalCursorMachine(),
    "TerminalKeyEncoding.kt": emitKotlinTerminalKeyEncoding(),
    "BackgroundTaskReduce.kt": emitKotlinBackgroundTaskReduce(),
    "FollowUpQueueMachine.kt": emitKotlinFollowUpQueueMachine(),
  };
  const swiftInventory = inventory(swiftWithMachines, "swift");
  const kotlinInventory = inventory(kotlinWithMachines, "kotlin");
  const files: Record<string, string> = {};
  for (const name of Object.keys(swiftWithMachines).sort(compareUnicodeCodePoints))
    files[`swift/${name}`] = swiftWithMachines[name]!;
  for (const name of Object.keys(kotlinWithMachines).sort(compareUnicodeCodePoints))
    files[`kotlin/${name}`] = kotlinWithMachines[name]!;

  const outputHash = treeHash(files);
  const stateMachines = [
    {
      id: PAIRING_MACHINE_SPEC.id,
      specVersion: PAIRING_MACHINE_SPEC.specVersion,
      phaseCount: PAIRING_MACHINE_SPEC.phases.length,
      phaseAfterFailureRuleCount: PAIRING_MACHINE_SPEC.phaseAfterFailure.length,
      intentTransitionCount: PAIRING_MACHINE_SPEC.intent.transitions.length,
      standardScopeCount: PAIRING_MACHINE_SPEC.scopes.standardOrder.length,
      sources: { swift: "swift/PairingMachine.swift", kotlin: "kotlin/PairingMachine.kt" },
    },
    {
      id: TERMINAL_CURSOR_MACHINE_SPEC.id,
      specVersion: TERMINAL_CURSOR_MACHINE_SPEC.specVersion,
      ruleCount: TERMINAL_CURSOR_MACHINE_SPEC.rules.length,
      guardCount: TERMINAL_CURSOR_MACHINE_SPEC.guards.length,
      actionCount: TERMINAL_CURSOR_MACHINE_SPEC.actions.length,
      resyncReasonCount: TERMINAL_CURSOR_MACHINE_SPEC.resyncReasons.length,
      maximumTranscriptUtf16Units: TERMINAL_CURSOR_MACHINE_SPEC.bounds.maximumTranscriptUtf16Units,
      sources: {
        swift: "swift/TerminalCursorMachine.swift",
        kotlin: "kotlin/TerminalCursorMachine.kt",
      },
    },
    {
      id: TERMINAL_KEY_ENCODING_SPEC.id,
      specVersion: TERMINAL_KEY_ENCODING_SPEC.specVersion,
      keyCount: TERMINAL_KEY_ENCODING_SPEC.keys.length,
      ruleCount: TERMINAL_KEY_ENCODING_SPEC.rules.length,
      guardCount: TERMINAL_KEY_ENCODING_SPEC.guards.length,
      effectCount: TERMINAL_KEY_ENCODING_SPEC.effects.length,
      sources: {
        swift: "swift/TerminalKeyEncoding.swift",
        kotlin: "kotlin/TerminalKeyEncoding.kt",
      },
    },
    {
      id: BACKGROUND_TASK_REDUCE_SPEC.id,
      specVersion: BACKGROUND_TASK_REDUCE_SPEC.specVersion,
      eventCount: BACKGROUND_TASK_REDUCE_SPEC.events.length,
      actionCount: BACKGROUND_TASK_REDUCE_SPEC.actions.length,
      ruleCount: BACKGROUND_TASK_REDUCE_SPEC.rules.length,
      sources: {
        swift: "swift/BackgroundTaskReduce.swift",
        kotlin: "kotlin/BackgroundTaskReduce.kt",
      },
    },
    {
      id: FOLLOW_UP_QUEUE_MACHINE_SPEC.id,
      specVersion: FOLLOW_UP_QUEUE_MACHINE_SPEC.specVersion,
      eventCount: FOLLOW_UP_QUEUE_MACHINE_SPEC.events.length,
      actionCount: FOLLOW_UP_QUEUE_MACHINE_SPEC.actions.length,
      ruleCount: FOLLOW_UP_QUEUE_MACHINE_SPEC.rules.length,
      sources: {
        swift: "swift/FollowUpQueueMachine.swift",
        kotlin: "kotlin/FollowUpQueueMachine.kt",
      },
    },
  ];
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
      stateMachines: stateMachines.length,
    },
    stateMachines,
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
