import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDINGS } from "@/shared/keybindings";
import { readKeybindingsFile, writeKeybindingsFile } from "./keybindingsFile";

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe("readKeybindingsFile", () => {
  it("creates the default Lightcode keybinding file when missing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "lightcode-keybindings-"));
    const path = join(tempDir, "keybindings.json");

    const config = readKeybindingsFile(path);

    expect(config.path).toBe(path);
    expect(config.file).toEqual(DEFAULT_KEYBINDINGS);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(DEFAULT_KEYBINDINGS);
  });

  it("preserves user-provided bindings", () => {
    tempDir = mkdtempSync(join(tmpdir(), "lightcode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    const custom = {
      version: 1,
      keybindings: [{ command: "settings.open", key: "Ctrl+," }],
    };
    writeFileSync(path, `${JSON.stringify(custom)}\n`, "utf8");

    expect(readKeybindingsFile(path).file).toEqual(custom);
  });
});

describe("writeKeybindingsFile", () => {
  it("persists bindings atomically and round-trips through the reader", () => {
    tempDir = mkdtempSync(join(tmpdir(), "lightcode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    const next = {
      version: 1 as const,
      keybindings: [
        { command: "settings.open", key: "Ctrl+," },
        { command: "palette.open", key: "Ctrl+K" },
      ],
    };

    const config = writeKeybindingsFile(path, next);

    expect(config.path).toBe(path);
    expect(config.file).toEqual(next);
    expect(readKeybindingsFile(path).file).toEqual(next);
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
  });
});
