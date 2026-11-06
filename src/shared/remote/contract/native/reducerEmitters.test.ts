import { describe, expect, it } from "vitest";
import { BACKGROUND_TASK_REDUCE_SPEC } from "../backgroundTaskReduceSpec";
import { FOLLOW_UP_QUEUE_MACHINE_SPEC } from "../followUpQueueMachineSpec";
import { emitKotlinBackgroundTaskReduce } from "./emitBackgroundTaskReduceKotlin";
import { emitSwiftBackgroundTaskReduce } from "./emitBackgroundTaskReduceSwift";
import { emitKotlinFollowUpQueueMachine } from "./emitFollowUpQueueKotlin";
import { emitSwiftFollowUpQueueMachine } from "./emitFollowUpQueueSwift";

describe("native reducer rule emission", () => {
  it("renders background rule predicates, actions and order from the spec", () => {
    const spec = {
      ...BACKGROUND_TASK_REDUCE_SPEC,
      rules: BACKGROUND_TASK_REDUCE_SPEC.rules.map((rule) =>
        rule.incomingEmpty ? { ...rule, action: "noop" as const } : rule,
      ),
    };
    expect(emitSwiftBackgroundTaskReduce(spec)).toContain(
      'if eventType == "background_tasks.changed" && incoming?.isEmpty == true { return .noop }',
    );
    expect(emitKotlinBackgroundTaskReduce(spec)).toContain(
      'if (eventType == "background_tasks.changed" && incoming?.isEmpty() == true) return RemoteBackgroundTaskReduceAction.Noop',
    );
    for (const emit of [emitSwiftBackgroundTaskReduce, emitKotlinBackgroundTaskReduce]) {
      const source = emit();
      expect(source.indexOf("incoming == ")).toBeLessThan(source.indexOf("incoming?.isEmpty"));
      expect(source.indexOf("incoming?.isEmpty")).toBeLessThan(
        source.indexOf("incoming == previous"),
      );
    }
  });

  it("renders the output.v1 result DTO and canonical bounds from the spec", () => {
    const spec = {
      ...BACKGROUND_TASK_REDUCE_SPEC,
      outputResult: {
        ...BACKGROUND_TASK_REDUCE_SPEC.outputResult,
        maxOutputUtf16Length: 123,
        maxTotalBytes: 456,
      },
    } as unknown as typeof BACKGROUND_TASK_REDUCE_SPEC;
    const swift = emitSwiftBackgroundTaskReduce(spec);
    expect(swift).toContain(
      "public struct RemoteBackgroundTaskOutput: Codable, Equatable, Sendable",
    );
    expect(swift).toContain("public static let maxOutputUtf16Length = 123");
    expect(swift).toContain("public static let maxTotalBytes = 456.0");
    expect(swift).toContain("public var isValid: Bool");
    expect(swift).toContain("output.utf16.count <= Self.maxOutputUtf16Length");

    const kotlin = emitKotlinBackgroundTaskReduce(spec);
    expect(kotlin).toContain("@Serializable");
    expect(kotlin).toContain("data class RemoteBackgroundTaskOutput(");
    expect(kotlin).toContain("val output: String");
    expect(kotlin).toContain("val totalBytes: Double");
    expect(kotlin).toContain("val truncated: Boolean");
    expect(kotlin).toContain("const val MAX_OUTPUT_UTF16_LENGTH = 123");
    expect(kotlin).toContain("const val MAX_TOTAL_BYTES = 456.0");
    expect(kotlin).toContain("output.length <= MAX_OUTPUT_UTF16_LENGTH");
  });

  it("renders follow-up rule predicates and actions from the spec", () => {
    const spec = {
      ...FOLLOW_UP_QUEUE_MACHINE_SPEC,
      rules: [
        ...FOLLOW_UP_QUEUE_MACHINE_SPEC.rules,
        { sameThread: false, queueKeyPresent: false, action: "replace" as const },
      ],
    };
    expect(emitSwiftFollowUpQueueMachine(spec)).toContain(
      "if !sameThread && !queueKeyPresent { return .replace }",
    );
    expect(emitKotlinFollowUpQueueMachine(spec)).toContain(
      "if (!sameThread && !queueKeyPresent) return RemoteFollowUpQueueReduceAction.Replace",
    );
  });
});
