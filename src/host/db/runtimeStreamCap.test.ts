import { describe, expect, it } from "vitest";
import { joinWithElision } from "./runtimeStreamCap";

describe("joinWithElision", () => {
  const NL_CHAR = String.fromCharCode(10);

  it("returns head and tail untouched when nothing was elided", () => {
    expect(joinWithElision("a", "b", 0)).toBe("ab");
  });

  it("gives the notice its own line between whole lines", () => {
    const head = `first${NL_CHAR}second${NL_CHAR}partial-he`;
    const tail = `ad-cut${NL_CHAR}ninth${NL_CHAR}tenth`;

    const lines = joinWithElision(head, tail, 1234).split(NL_CHAR);

    expect(lines[0]).toBe("first");
    expect(lines[1]).toBe("second");
    // The partial lines on both sides of the gap are dropped, not shown broken.
    expect(lines[2]).toBe("[... poracode elided 1234 characters of earlier output ...]");
    expect(lines[3]).toBe("ninth");
    expect(lines[4]).toBe("tenth");
  });

  it("keeps content that has no line breaks at all", () => {
    const joined = joinWithElision("AAA", "ZZZ", 10);

    expect(joined.startsWith("AAA")).toBe(true);
    expect(joined.endsWith("ZZZ")).toBe(true);
  });
});
