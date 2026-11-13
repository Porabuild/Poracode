import assert from "node:assert/strict";
import { it } from "node:test";
import { spec } from "./prepare-git-helper.mjs";

void it("rejects the previous deployed v3 helper before staging the v4 tree client", () => {
  const previous = {
    helper: "poracode-git-helper",
    helperVersion: "0.3.0",
    protocolVersion: 3,
    platform: "win32",
    arch: "x64",
  };
  const expected = spec.expectedVersion();
  assert.equal(expected, 4);
  assert.throws(() => spec.validateHello(previous, "old-helper.exe", expected), /incompatible/u);
  assert.doesNotThrow(() =>
    spec.validateHello(
      { ...previous, helperVersion: "0.4.0", protocolVersion: 4 },
      "current-helper.exe",
      expected,
    ),
  );
});
