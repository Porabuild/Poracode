import { describe, expect, it } from "vitest";
import { shardDeclarations } from "./emitterCommon";

const HEADER = ["// generated", "import Foundation"];

function declaration(name: string, fields: number): string[] {
  return [
    `public struct ${name}: Codable {`,
    ...Array.from({ length: fields }, (_, index) => `  public var field${index}: String`),
    "}",
  ];
}

function declarations(count: number): string[][] {
  return Array.from({ length: count }, (_, index) =>
    declaration(`Model${index}_${(index * 2654435761).toString(16)}`, 2 + ((index * 7) % 30)),
  );
}

function shard(input: readonly (readonly string[])[]): Map<string, string> {
  const files = shardDeclarations({
    extension: "swift",
    prefix: "Models",
    header: HEADER,
    declarations: input,
  });
  return new Map(files.map((file) => [file.path, file.contents]));
}

function changedFiles(before: Map<string, string>, after: Map<string, string>): number {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).length;
}

describe("shardDeclarations", () => {
  it("keeps every declaration once, in order, within the line limit", () => {
    const input = declarations(600);
    const files = shardDeclarations({
      extension: "swift",
      prefix: "Models",
      header: HEADER,
      declarations: input,
    });
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      expect(file.path).toMatch(/^Models_[0-9a-f]{8}(?:_\d+)?\.swift$/u);
      expect(file.contents.split("\n").length - 1).toBeLessThanOrEqual(450);
      expect(file.contents.startsWith(`${HEADER.join("\n")}\n`)).toBe(true);
    }
    const emitted = files.flatMap((file) =>
      [...file.contents.matchAll(/public struct (\w+):/gu)].map((match) => match[1]),
    );
    expect(emitted).toEqual(input.map((lines) => /struct (\w+):/u.exec(lines[0]!)![1]));
    expect(shard(input)).toEqual(shard(input));
  });

  it("rewrites only nearby files when one declaration is added, removed or changed", () => {
    const input = declarations(600);
    const before = shard(input);
    const counts: number[] = [];
    for (let position = 0; position < input.length; position += 5) {
      const inserted = input.toSpliced(position, 0, declaration("Inserted_feedface", 12));
      const removed = input.toSpliced(position, 1);
      const changed = input.toSpliced(position, 1, [...input[position]!, "// changed"]);
      for (const variant of [inserted, removed, changed]) {
        counts.push(changedFiles(before, shard(variant)));
      }
    }
    counts.sort((left, right) => left - right);
    // Sequential packing rewrote every later shard (tens of files) instead.
    expect(before.size).toBeGreaterThan(40);
    expect(counts[Math.floor(counts.length / 2)]).toBeLessThanOrEqual(1);
    expect(counts[Math.floor(counts.length * 0.95)]).toBeLessThanOrEqual(3);
    expect(counts.at(-1)).toBeLessThanOrEqual(8);
  });

  it("rejects a declaration that cannot fit in one file", () => {
    expect(() =>
      shardDeclarations({
        extension: "swift",
        prefix: "Models",
        header: HEADER,
        declarations: [declaration("Huge", 460)],
      }),
    ).toThrow(/exceeds 450 lines/u);
  });
});
