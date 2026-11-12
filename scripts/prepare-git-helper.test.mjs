import assert from "node:assert/strict";
import { it } from "node:test";
import { spec } from "./prepare-git-helper.mjs";

void it("rejects the previous deployed v2 helper before staging the v3 watcher client", () => {
  const previous = {
    helper: "poracode-git-helper",
    helperVersion: "0.2.4",
    protocolVersion: 2,
    platform: "win32",
    arch: "x64",
  };
  const expected = spec.expectedVersion();
  assert.equal(expected, 3);
  assert.throws(() => spec.validateHello(previous, "old-helper.exe", expected), /incompatible/u);
  assert.doesNotThrow(() =>
    spec.validateHello(
      { ...previous, helperVersion: "0.3.0", protocolVersion: 3 },
      "current-helper.exe",
      expected,
    ),
  );
});
