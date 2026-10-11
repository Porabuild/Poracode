import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { downloadToFile, verifySha256 } from "../../runtime/download";
import { spawnAndAwaitExit } from "../../runtime/spawn";
import {
  disposeNativeRuntime,
  installNativeRuntime,
  managedNodePath,
  resetNativeRuntimeCacheForTests,
  startNativeRuntimeSession,
} from "./index";

vi.mock("../../runtime/download", () => ({
  downloadToFile: vi.fn<typeof downloadToFile>(async (_url: string, path: string) => {
    writeFileSync(path, "private archive");
  }),
  verifySha256: vi.fn<typeof verifySha256>(async () => {}),
}));
vi.mock("../../runtime/spawn", async () => ({
  ...(await vi.importActual<typeof import("../../runtime/spawn")>("../../runtime/spawn")),
  spawnAndAwaitExit: vi.fn<typeof spawnAndAwaitExit>(async () => {}),
}));
const dirs: string[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "poracode-native-cancellation-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  resetNativeRuntimeCacheForTests();
  vi.clearAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it("stops a held download, removes staging and never verifies/extracts or publishes a runtime", async () => {
  const base = fixture();
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  vi.mocked(downloadToFile).mockImplementationOnce(
    async (_url, _file, options) =>
      new Promise<void>((_resolve, reject) => {
        options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason), {
          once: true,
        });
        ready();
      }),
  );
  const installing = installNativeRuntime(base, "linux-x64");
  const refused = installing.catch((error: unknown) => error);
  await started;
  await disposeNativeRuntime(base);
  expect(await refused).toMatchObject({ name: "AbortError" });
  expect(verifySha256).not.toHaveBeenCalled();
  expect(spawnAndAwaitExit).not.toHaveBeenCalled();
  expect(readdirSync(join(base, "runtime"))).toEqual([]);
  expect(existsSync(managedNodePath(base, "linux-x64"))).toBe(false);
});

it("waits for extraction exit before staging cleanup and refuses a successor until joined", async () => {
  const base = fixture();
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let exit!: () => void;
  vi.mocked(spawnAndAwaitExit).mockImplementationOnce(
    async (_command, _args, options) =>
      new Promise<void>((_resolve, reject) => {
        exit = () => reject(options!.signal!.reason);
        ready();
      }),
  );
  const installing = installNativeRuntime(base, "linux-x64");
  const refused = installing.catch((error: unknown) => error);
  await started;
  let joined = false;
  const stopped = disposeNativeRuntime(base).then(() => {
    joined = true;
  });
  await Promise.resolve();
  expect(joined).toBe(false);
  expect(readdirSync(join(base, "runtime")).some((n) => n.startsWith(".staging-"))).toBe(true);
  expect(() => startNativeRuntimeSession(base)).toThrow("has not retired");
  exit();
  await stopped;
  expect(await refused).toMatchObject({ name: "AbortError" });
  expect(readdirSync(join(base, "runtime"))).toEqual([]);
  expect(existsSync(managedNodePath(base, "linux-x64"))).toBe(false);
  expect(() => startNativeRuntimeSession(base)).not.toThrow();
});

it("keeps staging and refuses restart when extractor exit cannot be confirmed", async () => {
  const base = fixture();
  const failure = new Error("tar could not be confirmed exited after SIGKILL");
  vi.mocked(spawnAndAwaitExit).mockRejectedValueOnce(failure);
  await expect(installNativeRuntime(base, "linux-x64")).rejects.toBe(failure);
  expect(readdirSync(join(base, "runtime")).some((n) => n.startsWith(".staging-"))).toBe(true);
  await expect(disposeNativeRuntime(base)).rejects.toBe(failure);
  expect(() => startNativeRuntimeSession(base)).toThrow("has not retired");
  expect(existsSync(managedNodePath(base, "linux-x64"))).toBe(false);
});

it("keeps an unconfirmed probe timeout latched after its promise has settled", async () => {
  const { resolveNativeNode } = await import("./index");
  const base = fixture();
  const failure = new Error("probe timed out and could not be confirmed exited after SIGKILL");
  vi.mocked(spawnAndAwaitExit).mockRejectedValueOnce(failure);
  await expect(resolveNativeNode({ baseDir: base, skipBackgroundInstall: true })).rejects.toBe(
    failure,
  );
  await expect(disposeNativeRuntime(base)).rejects.toBe(failure);
  expect(downloadToFile).not.toHaveBeenCalled();
  expect(() => startNativeRuntimeSession(base)).toThrow("has not retired");
});

// Exercise the lower resolver layers as in an Electron-owned supervisor.
vi.mock("./hostNode", () => ({ resolveHostNode: () => null }));
