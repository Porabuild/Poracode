import { describe, expect, test } from "bun:test";
import path from "node:path";
import { resolveTargetDirectory } from "./target-directory";

describe("TUI target directory", () => {
  test("prefers argv[2] and resolves it absolutely", () => {
    expect(resolveTargetDirectory(["bun", "poracode.ts", "tmp/project"], "C:/init", "C:/tui")).toBe(
      path.resolve("tmp/project"),
    );
  });

  test("falls back to INIT_CWD, then process cwd", () => {
    expect(resolveTargetDirectory(["bun", "poracode.ts"], "C:/scratch", "C:/tui")).toBe(
      path.resolve("C:/scratch"),
    );
    expect(resolveTargetDirectory(["bun", "poracode.ts"], undefined, "C:/tui")).toBe(
      path.resolve("C:/tui"),
    );
  });
});
