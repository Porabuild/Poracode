import { describe, expect, it } from "vitest";
import { isMspCommandId, mintMspCommandId } from "./uuidv7";

describe("mintMspCommandId", () => {
  it("mints UUIDv7 ids", () => {
    expect(isMspCommandId(mintMspCommandId())).toBe(true);
    expect(isMspCommandId("966713f1-794f-480e-aa37-713e8387fe8e")).toBe(false);
    expect(isMspCommandId("not-a-uuid")).toBe(false);
  });

  it("embeds the wall clock so later mints sort later", () => {
    const first = mintMspCommandId(1_700_000_000_000);
    const second = mintMspCommandId(1_700_000_000_001);
    expect(isMspCommandId(first)).toBe(true);
    expect(second > first).toBe(true);
  });

  it("mints unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => mintMspCommandId()));
    expect(ids.size).toBe(100);
  });
});
