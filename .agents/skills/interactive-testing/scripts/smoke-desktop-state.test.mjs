import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSmokeDesktopUnlocked } from "./smoke-desktop-state.mjs";

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "poracode-desktop-state-test-"));
  try {
    fn(root);
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function executor(value) {
  return (command, args, options) => {
    assert.ok(options.timeout > 0 && options.maxBuffer <= 8192);
    if (command === "/usr/bin/clang") {
      assert.ok(args.includes("CoreGraphics") && args.includes("CoreFoundation"));
      return "";
    }
    return JSON.stringify({ version: 1, ...value });
  };
}
await test("non-macOS skips the native console probe", () => {
  assert.deepEqual(assertSmokeDesktopUnlocked({ platform: "linux", exec: () => assert.fail() }), {
    required: false,
  });
});
await test("locked or switched console refuses and removes private compiler artifacts", () => {
  for (const value of [
    { dictionaryPresent: true, locked: 1, onConsole: 1 },
    { dictionaryPresent: true, locked: 0, onConsole: 0 },
  ]) {
    withRoot((sessionRoot) => {
      assert.throws(
        () =>
          assertSmokeDesktopUnlocked({ platform: "darwin", sessionRoot, exec: executor(value) }),
        /desktop is locked/,
      );
    });
  }
});
await test("unlocked console accepts; missing unlocked flag is normal on macOS", () => {
  for (const locked of [0, -1]) {
    withRoot((sessionRoot) => {
      assert.deepEqual(
        assertSmokeDesktopUnlocked({
          platform: "darwin",
          sessionRoot,
          exec: executor({ dictionaryPresent: true, locked, onConsole: 1 }),
        }),
        { required: true, screenLocked: false },
      );
    });
  }
});
await test("unavailable or malformed console state refuses instead of certifying UI availability", () => {
  for (const value of [
    { dictionaryPresent: false },
    { dictionaryPresent: true, locked: 0, onConsole: -1 },
  ]) {
    withRoot((sessionRoot) => {
      assert.throws(
        () =>
          assertSmokeDesktopUnlocked({ platform: "darwin", sessionRoot, exec: executor(value) }),
        /Cannot verify/,
      );
    });
  }
});
