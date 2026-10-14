// Focused regression for the shared keybindings write (V5 plan 1.4): the
// managed local handler and the standalone-attach device handler previously
// carried this exact write+rollback body verbatim; one module now serves both.

import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readKeybindingsFile } from "./keybindingsFile";
import { applyKeybindingsWrite } from "./keybindingsApply";

const cleanups: Array<() => void> = [];

function fixturePath(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-keybindings-")));
  cleanups.push(() => {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  });
  return join(root, "keybindings.json");
}

afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

describe("applyKeybindingsWrite", () => {
  it("applies the incoming shortcuts before persisting the file", () => {
    const path = fixturePath();
    const onKeybindingsChanged = vi.fn<(file: unknown) => void>();
    const file = readKeybindingsFile(path).file;
    const result = applyKeybindingsWrite({ path, file, onKeybindingsChanged });
    expect(result.file).toEqual(file);
    expect(onKeybindingsChanged).toHaveBeenCalledWith(file);
    expect(readKeybindingsFile(path).file).toEqual(file);
  });

  it("rolls the shortcuts back to the on-disk file when the write fails", () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-keybindings-")));
    cleanups.push(() => {
      chmodSync(root, 0o700);
      rmSync(root, { recursive: true, force: true });
    });
    const path = join(root, "keybindings.json");
    const onDisk = readKeybindingsFile(path).file;
    // A read-only directory makes the atomic write fail (no temp file) while
    // the on-disk read still succeeds.
    chmodSync(root, 0o500);
    const onKeybindingsChanged = vi.fn<(file: unknown) => void>();
    const incoming = { ...onDisk, keybindings: [] };
    expect(() => applyKeybindingsWrite({ path, file: incoming, onKeybindingsChanged })).toThrow(
      Error,
    );
    expect(onKeybindingsChanged).toHaveBeenNthCalledWith(1, incoming);
    // Rollback re-applied the file still on disk.
    expect(onKeybindingsChanged).toHaveBeenNthCalledWith(2, onDisk);
  });
});
