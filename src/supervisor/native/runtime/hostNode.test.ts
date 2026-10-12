import { expect, it } from "vitest";
import { resolveHostNode } from "./hostNode";

it("uses the existing compatible bare Node executable without a shell lookup", () => {
  expect(
    resolveHostNode({ execPath: process.execPath, versions: { node: process.versions.node } }),
  ).toEqual({ nodePath: process.execPath, version: process.versions.node });
});

it("does not treat Electron-as-Node as a native hook runtime", () => {
  expect(
    resolveHostNode({
      execPath: process.execPath,
      versions: { node: "24.20.0", electron: "40.0.0" },
    }),
  ).toBeNull();
});

it("rejects old, malformed, relative or removed host executables", () => {
  for (const version of ["21.9.0", "invalid"])
    expect(resolveHostNode({ execPath: process.execPath, versions: { node: version } })).toBeNull();
  expect(resolveHostNode({ execPath: "node", versions: { node: "24.20.0" } })).toBeNull();
  expect(
    resolveHostNode({
      execPath: "/poracode-private-fixture-missing/node",
      versions: { node: "24.20.0" },
    }),
  ).toBeNull();
});
