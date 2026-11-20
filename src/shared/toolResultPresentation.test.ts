import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  presentToolArguments,
  presentToolResult,
  TOOL_ARGUMENTS_TEXT_SOURCE,
  TOOL_RESULT_TEXT_SOURCE,
  type ToolTextPart,
} from "./toolResultPresentation";
import {
  readToolValuePath,
  resolveToolTextSource,
  type ToolTextSource,
} from "./toolPresentationSource";

interface ProjectionCase {
  id: string;
  selection: "args" | "result" | "source";
  payload?: unknown;
  streams?: Record<string, string>;
  source?: ToolTextSource;
  expected: ToolTextPart;
}

const fixture = JSON.parse(
  readFileSync(resolve("protocol/remote/v3/fixtures/client-tool-text-projection.json"), "utf8"),
) as {
  version: number;
  cases: ProjectionCase[];
};

describe("canonical tool text projection", () => {
  it("uses the shared fixture's declared vocabulary version", () => {
    expect(fixture.version).toBe(1);
  });

  it.each(fixture.cases)("$id", (entry) => {
    const originalPayload = JSON.stringify(entry.payload);
    const actual =
      entry.selection === "args"
        ? presentToolArguments(entry.payload)
        : entry.selection === "result"
          ? presentToolResult(entry.payload)
          : resolveToolTextSource(entry.source!, {
              ...(entry.payload !== undefined ? { payload: entry.payload } : {}),
              ...(entry.streams ? { streams: entry.streams } : {}),
            });
    expect(actual).toEqual(entry.expected);
    expect(JSON.stringify(entry.payload)).toBe(originalPayload);
  });

  it("resolves replacements through the same reference without copying or clipping content", () => {
    const old = { result: { content: "preview", detailedContent: "first" } };
    const complete = "東京🧭\n".repeat(100_000);
    const next = { result: { content: "preview", detailedContent: complete } };
    const descriptor = JSON.stringify(TOOL_RESULT_TEXT_SOURCE);
    expect(resolveToolTextSource(TOOL_RESULT_TEXT_SOURCE, { payload: old }).text).toBe("first");
    expect(resolveToolTextSource(TOOL_RESULT_TEXT_SOURCE, { payload: next }).text).toBe(complete);
    expect(JSON.stringify(TOOL_RESULT_TEXT_SOURCE)).toBe(descriptor);
    expect(descriptor.length).toBeLessThan(1024);
    expect(JSON.stringify(TOOL_ARGUMENTS_TEXT_SOURCE).length).toBeLessThan(256);
    expect(next.result.content).toBe("preview");
  });

  it("does not traverse inherited fields", () => {
    const inherited = Object.create({ result: "not an own value" }) as object;
    expect(readToolValuePath(inherited, ["result"])).toBeUndefined();
    expect(presentToolResult(inherited)).toEqual({ text: "", language: "plain" });
  });

  it("reads current values from reactive data properties", () => {
    let result = { text: "initial" };
    const reactive = Object.defineProperty({}, "result", { enumerable: true, get: () => result });
    expect(presentToolResult(reactive)).toEqual({ text: "initial", language: "plain" });
    result = { text: "updated" };
    expect(presentToolResult(reactive)).toEqual({ text: "updated", language: "plain" });
  });
});
