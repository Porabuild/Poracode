import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  COMPOSER_CONTROL_COMMAND_IDS,
  DEFAULT_KEYBINDINGS,
  QUICK_COMPOSER_COMMAND_ID,
} from "@/shared/keybindings";
import { readKeybindingsFile, writeKeybindingsFile } from "./keybindingsFile";

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe("readKeybindingsFile", () => {
  it("creates the default Poracode keybinding file when missing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");

    const config = readKeybindingsFile(path);

    expect(config.path).toBe(path);
    expect(config.file).toEqual(DEFAULT_KEYBINDINGS);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(DEFAULT_KEYBINDINGS);
  });

  it("preserves user-provided bindings and backfills new composer-control defaults", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    const custom = {
      version: 1,
      keybindings: [{ command: "settings.open", key: "Ctrl+," }],
    };
    writeFileSync(path, `${JSON.stringify(custom)}\n`, "utf8");

    const result = readKeybindingsFile(path).file;

    // The user's binding survives untouched...
    expect(result.keybindings).toContainEqual({ command: "settings.open", key: "Ctrl+," });
    // ...and the brand-new composer controls are added so they're rebindable.
    for (const id of COMPOSER_CONTROL_COMMAND_IDS) {
      expect(result.keybindings.some((binding) => binding.command === id)).toBe(true);
    }
    // The migration is persisted to disk, not just returned in memory.
    expect(readFileSync(path, "utf8")).toEqual(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("backfills the new-thread shortcuts into pre-existing files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    // A file that predates the thread.new defaults (only an unrelated binding).
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, keybindings: [{ command: "settings.open", key: "Ctrl+," }] })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;

    // Both thread.new chords and the panel variant are added so the shortcut works.
    const threadNew = result.keybindings.filter((b) => b.command === "thread.new");
    expect(threadNew.map((b) => b.key)).toEqual(expect.arrayContaining(["Ctrl+N", "Ctrl+Shift+O"]));
    expect(result.keybindings.some((b) => b.command === "thread.new.panel")).toBe(true);
  });

  it("backfills the global quick-composer shortcut into pre-existing files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, keybindings: [{ command: "settings.open", key: "Ctrl+," }] })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;
    const shortcut = result.keybindings.find(
      (binding) => binding.command === QUICK_COMPOSER_COMMAND_ID,
    );

    expect(shortcut).toMatchObject({
      key: "Ctrl+Shift+Space",
      mac: "Meta+Shift+Space",
      windows: "Ctrl+Alt+Space",
      linux: "Ctrl+Shift+Space",
    });
  });

  it("backfills the toggle-file-tree shortcut into pre-existing files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    // A file that predates the files.toggle default (only an unrelated binding).
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, keybindings: [{ command: "settings.open", key: "Ctrl+," }] })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;

    const fileTree = result.keybindings.find((b) => b.command === "files.toggle");
    expect(fileTree?.key).toBe("Ctrl+Shift+E");
  });

  it("backfills the toggle-side-panel shortcut into pre-existing files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    // A file that predates the sidebar.toggle default (only an unrelated binding).
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, keybindings: [{ command: "settings.open", key: "Ctrl+," }] })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;

    const toggle = result.keybindings.find((b) => b.command === "sidebar.toggle");
    expect(toggle?.key).toBe("Ctrl+B");
    expect(toggle?.mac).toBe("Meta+B");
  });

  it("backfills the toggle-browser-panel shortcut into pre-existing files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    // A file that predates the browser.toggle default (only an unrelated binding).
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, keybindings: [{ command: "settings.open", key: "Ctrl+," }] })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;

    const toggle = result.keybindings.find((b) => b.command === "browser.toggle");
    expect(toggle?.key).toBe("Ctrl+Shift+B");
    expect(toggle?.mac).toBe("Meta+Shift+B");
  });

  it("backfills the rename-chat shortcut into pre-existing files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    // A file that predates the thread.rename default (only an unrelated binding).
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, keybindings: [{ command: "settings.open", key: "Ctrl+," }] })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;

    const rename = result.keybindings.find((b) => b.command === "thread.rename");
    expect(rename?.key).toBe("Ctrl+Alt+R");
    expect(rename?.mac).toBe("Meta+Alt+R");
  });

  it("backfills the add-project shortcut into pre-existing files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    // A file that predates the project.add default (only an unrelated binding).
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, keybindings: [{ command: "settings.open", key: "Ctrl+," }] })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;

    const addProject = result.keybindings.find((b) => b.command === "project.add");
    expect(addProject?.key).toBe("Ctrl+O");
    expect(addProject?.mac).toBe("Meta+O");
  });

  it("backfills the find.open shortcut into pre-existing files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, keybindings: [{ command: "settings.open", key: "Ctrl+," }] })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;

    const find = result.keybindings.find((b) => b.command === "find.open");
    expect(find?.key).toBe("Ctrl+F");
    expect(find?.mac).toBe("Meta+F");
  });

  it("backfills the next/previous chat shortcuts into pre-existing files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    // A file that predates the thread.next/thread.previous defaults.
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, keybindings: [{ command: "settings.open", key: "Ctrl+," }] })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;

    const next = result.keybindings.filter((b) => b.command === "thread.next");
    expect(next.map((b) => b.key)).toEqual(
      expect.arrayContaining(["Ctrl+Shift+]", "Ctrl+PageDown"]),
    );
    const previous = result.keybindings.filter((b) => b.command === "thread.previous");
    expect(previous.map((b) => b.key)).toEqual(
      expect.arrayContaining(["Ctrl+Shift+[", "Ctrl+PageUp"]),
    );
  });

  it("backfills the next/previous tab shortcuts into pre-existing files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    // A file that predates the tab.next/tab.previous defaults.
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, keybindings: [{ command: "settings.open", key: "Ctrl+," }] })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;

    const next = result.keybindings.filter((b) => b.command === "tab.next");
    expect(next.map((b) => b.key)).toEqual(
      expect.arrayContaining(["Ctrl+Tab", "Ctrl+Shift+]", "Ctrl+PageDown"]),
    );
    const previous = result.keybindings.filter((b) => b.command === "tab.previous");
    expect(previous.map((b) => b.key)).toEqual(
      expect.arrayContaining(["Ctrl+Shift+Tab", "Ctrl+Shift+[", "Ctrl+PageUp"]),
    );
  });

  it("rekeys a pre-existing Fast-toggle off the old Ctrl+F default", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    // A file that still has the legacy default (composer.toggle-fast on Ctrl+F),
    // which now collides with find.open.
    writeFileSync(
      path,
      `${JSON.stringify({
        version: 1,
        keybindings: [
          { command: "composer.toggle-fast", key: "Ctrl+F", mac: "Meta+F", when: "composerFocus" },
        ],
      })}\n`,
      "utf8",
    );

    const result = readKeybindingsFile(path).file;

    const toggleFast = result.keybindings.filter((b) => b.command === "composer.toggle-fast");
    expect(toggleFast).toHaveLength(1);
    expect(toggleFast[0]?.key).toBe("Ctrl+Shift+F");
    expect(toggleFast[0]?.mac).toBe("Meta+Shift+F");
    expect(toggleFast[0]?.when).toBe("composerFocus");
  });

  it("leaves a user-customized Fast-toggle binding untouched", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    const custom = { command: "composer.toggle-fast", key: "Ctrl+E", when: "composerFocus" };
    writeFileSync(path, `${JSON.stringify({ version: 1, keybindings: [custom] })}\n`, "utf8");

    const result = readKeybindingsFile(path).file;

    expect(result.keybindings.filter((b) => b.command === "composer.toggle-fast")).toEqual([
      custom,
    ]);
  });

  it("does not override a customized composer binding", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
    const path = join(tempDir, "keybindings.json");
    const customEffort = { command: "composer.cycle-effort", key: "Ctrl+E", when: "composerFocus" };
    writeFileSync(path, `${JSON.stringify({ version: 1, keybindings: [customEffort] })}\n`, "utf8");

    const result = readKeybindingsFile(path).file;

    // The customized command keeps only the user's binding (no default re-added)...
    expect(result.keybindings.filter((b) => b.command === "composer.cycle-effort")).toEqual([
      customEffort,
    ]);
    // ...while the other composer controls are still backfilled.
    expect(result.keybindings.some((b) => b.command === "composer.toggle-fast")).toBe(true);
  });
});

describe("writeKeybindingsFile", () => {
  it("persists bindings atomically and round-trips through the reader", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-keybindings-"));
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
    // The reader backfills composer-control defaults (additive migration), so it
    // round-trips the written bindings rather than equalling `next` exactly.
    const readBack = readKeybindingsFile(path).file;
    for (const binding of next.keybindings) {
      expect(readBack.keybindings).toContainEqual(binding);
    }
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
  });
});
