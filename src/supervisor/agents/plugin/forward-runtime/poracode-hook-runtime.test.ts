import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

// @ts-expect-error The hook runtime is shipped as plain standalone ESM.
import { readJsonFromStream } from "./poracode-hook-runtime.mjs";

describe("readJsonFromStream", () => {
  it("parses JSON payloads below the cap", async () => {
    await expect(readJsonFromStream(Readable.from(['{"session_id":"abc"}']))).resolves.toEqual({
      session_id: "abc",
    });
  });

  it("drains oversized payloads instead of leaving stdin for the shell", async () => {
    let chunksRead = 0;
    async function* chunks() {
      chunksRead += 1;
      yield '{"session_id":"abc",';
      chunksRead += 1;
      yield '"large":"xxxxxxxxxx"}';
    }

    await expect(readJsonFromStream(Readable.from(chunks()), 20)).resolves.toBeUndefined();
    expect(chunksRead).toBe(2);
  });
});
