import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

/** NIST FIPS 180-4 test vectors. */
const FIXED: ReadonlyArray<[string, string]> = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
];

function nodeHex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("browser-safe sha256", () => {
  it("matches the NIST fixed vectors", () => {
    for (const [input, expected] of FIXED) {
      expect(sha256Hex(input)).toBe(expected);
    }
  });

  it("matches node:crypto across length classes around the padding boundaries", () => {
    const lengths = [
      0, 1, 3, 31, 32, 55, 56, 57, 63, 64, 65, 111, 112, 119, 120, 127, 128, 129, 1000, 4096,
    ];
    for (const length of lengths) {
      const bytes = randomBytes(length);
      expect(sha256Hex(bytes), `length ${length}`).toBe(nodeHex(bytes));
      // The pairing fingerprint digests UTF-8 text, so cover the string path too.
      const text = bytes.toString("latin1");
      expect(sha256Hex(text), `text length ${length}`).toBe(nodeHex(text));
    }
  });

  it("matches node:crypto on randomized inputs", () => {
    for (let i = 0; i < 25; i += 1) {
      const bytes = randomBytes(Math.floor(Math.random() * 2000));
      expect(sha256Hex(bytes)).toBe(nodeHex(bytes));
    }
  });

  it("accepts Uint8Array input without mutating it", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const snapshot = [...bytes];
    expect(sha256Hex(bytes)).toBe(nodeHex(bytes));
    expect([...bytes]).toEqual(snapshot);
  });
});
