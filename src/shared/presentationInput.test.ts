import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { encodePresentationInput, PRESENTATION_INPUT_MAX_BYTES } from "./presentationInput";

const fixture = JSON.parse(
  readFileSync("protocol/remote/v3/fixtures/client-presentation-input.json", "utf8"),
) as {
  version: number;
  cases: { name: string; value: unknown; encoded: string; digest: string }[];
};

describe("presentation input consistency encoding", () => {
  it.each(fixture.cases)("pins shared bytes and SHA-256: $name", (row) => {
    expect(fixture.version).toBe(1);
    const encoded = encodePresentationInput(row.value);
    expect(new TextDecoder().decode(encoded)).toBe(row.encoded);
    expect(createHash("sha256").update(encoded).digest("hex")).toBe(row.digest);
  });

  it("normalizes negative zero and absent JSON fields without conflating types", () => {
    expect(encodePresentationInput(-0)).toEqual(encodePresentationInput(0));
    expect(encodePresentationInput({ a: undefined })).toEqual(encodePresentationInput({}));
    expect(encodePresentationInput([undefined])).toEqual(encodePresentationInput([null]));
    expect(encodePresentationInput(false)).not.toEqual(encodePresentationInput(0));
    expect(encodePresentationInput("1")).not.toEqual(encodePresentationInput(1));
  });

  it("bounds source bytes, recursion and nodes before retaining an encoding", () => {
    expect(() => encodePresentationInput("x".repeat(PRESENTATION_INPUT_MAX_BYTES))).toThrow(
      "encoding budget",
    );
    expect(() => encodePresentationInput(Array(16384).fill(null))).toThrow("node budget");
    let value: unknown = null;
    for (let index = 0; index < 65; index++) value = [value];
    expect(() => encodePresentationInput(value)).toThrow("nesting budget");
    for (const invalid of [NaN, Infinity, Symbol("not JSON"), () => 1]) {
      expect(() => encodePresentationInput(invalid)).toThrow(/non-JSON/);
    }
  });
});
