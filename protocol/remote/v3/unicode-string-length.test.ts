import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sessionRefSchema } from "../../../src/shared/contracts/common";
import { remoteTerminalWatchResultReadySchema } from "../../../src/shared/remote/protocol";
import { unicodeStringLengthCases } from "./unicodeStringLengthFixtures";

// Draft 2020-12 §6.3.1/6.3.2 counts code points, not UTF-16 units or graphemes.
// The same recipes run through compiled generated Swift and Kotlin root codecs.
describe("native schema Unicode length conformance", () => {
  it.each(unicodeStringLengthCases)("matches Zod and JSON Schema for $id", (group) => {
    const schema = z.string().min(group.minLength).max(group.maxLength);
    expect(z.toJSONSchema(schema)).toMatchObject({
      minLength: group.minLength,
      maxLength: group.maxLength,
    });
    for (const item of group.cases) {
      expect(schema.safeParse(item.value).success).toBe(item.valid);
    }
  });

  it("retains the existing executionIdentity maxLength in code points", () => {
    const identity = (count: number) => ({
      providerSessionId: "session",
      discoveredAt: "now",
      executionIdentity: "😀".repeat(count),
    });
    expect(sessionRefSchema.safeParse(identity(256)).success).toBe(true);
    expect(sessionRefSchema.safeParse(identity(257)).success).toBe(false);
  });

  it("keeps terminal cursor ranges in UTF-16 units", () => {
    const message = JSON.parse(
      readFileSync(
        new URL("./fixtures/ws-server-terminal-watch-result-live.json", import.meta.url),
        "utf8",
      ),
    );
    const ready = { ...message.cursorSync.result, fromCursor: 0, toCursor: 2, data: "😀" };
    expect(remoteTerminalWatchResultReadySchema.safeParse(ready).success).toBe(true);
    expect(remoteTerminalWatchResultReadySchema.safeParse({ ...ready, toCursor: 1 }).success).toBe(
      false,
    );
  });
});
