import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HARNESS_DIR = fileURLToPath(new URL("./harness", import.meta.url));
const MAX_LINES = 500;
const PREFER_LINES = 350;

describe("harness file size gate", () => {
  it("keeps every production harness TypeScript file under 500 lines", () => {
    const files = readdirSync(HARNESS_DIR)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => {
        const path = join(HARNESS_DIR, name);
        const lines = readFileSync(path, "utf8").split(/\r?\n/).length;
        return { name, lines, bytes: statSync(path).size };
      })
      .sort((left, right) => right.lines - left.lines);

    const oversized = files.filter((file) => file.lines >= MAX_LINES);
    expect(oversized.map((file) => `${file.name}:${file.lines}`)).toEqual([]);
    expect(files.every((file) => file.lines < PREFER_LINES || file.lines < MAX_LINES)).toBe(true);
  });
});
