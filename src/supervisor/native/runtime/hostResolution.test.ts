import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { resolveNativeNode, resetNativeRuntimeCacheForTests, managedNodePath } from "./index";
import { detectNativeNodeTarget } from "../../runtime/pinnedNode";
import { spawnAndAwaitExit } from "../../runtime/spawn";
import { downloadToFile } from "../../runtime/download";
vi.mock("../../runtime/spawn", async () => ({
  ...(await vi.importActual<typeof import("../../runtime/spawn")>("../../runtime/spawn")),
  spawnAndAwaitExit: vi.fn<typeof spawnAndAwaitExit>(async () => {
    throw new Error("Unexpected probe");
  }),
}));
vi.mock("../../runtime/download", async () => ({
  ...(await vi.importActual<typeof import("../../runtime/download")>("../../runtime/download")),
  downloadToFile: vi.fn<typeof downloadToFile>(async () => {
    throw new Error("Unexpected download");
  }),
}));
const dirs: string[] = [];
function fixture() {
  const d = mkdtempSync(join(tmpdir(), "poracode-host-node-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  resetNativeRuntimeCacheForTests();
  vi.clearAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
it("a fresh bare Node host performs no user probe or archive download", async () => {
  const events: string[] = [];
  const result = await resolveNativeNode({
    baseDir: fixture(),
    onProgress: (e) => events.push(e.kind),
  });
  expect(result).toEqual({
    nodePath: process.execPath,
    nodeVersion: process.versions.node,
    source: "host-runtime",
  });
  expect(events).toEqual(["probe-start", "probe-found-host"]);
  expect(spawnAndAwaitExit).not.toHaveBeenCalled();
  expect(downloadToFile).not.toHaveBeenCalled();
});
it("preserves priority and bytes of a previously installed managed runtime", async () => {
  const target = detectNativeNodeTarget();
  if (!target) return;
  const baseDir = fixture(),
    nodePath = managedNodePath(baseDir, target);
  mkdirSync(dirname(nodePath), { recursive: true });
  writeFileSync(nodePath, "existing managed binary");
  const result = await resolveNativeNode({ baseDir });
  expect(result?.source).toBe("poracode-managed");
  expect(result?.nodePath).toBe(nodePath);
  expect(spawnAndAwaitExit).not.toHaveBeenCalled();
  expect(downloadToFile).not.toHaveBeenCalled();
});
