// DEV-only QA fixture: replace one local picker result, never a host transport.
import { readClientRuntime } from "./clientRuntime";

type Runtime = ReturnType<typeof readClientRuntime>;
type Picker = Runtime["procedures"]["pickFolder"];
type Lease = {
  runtime: Runtime;
  owner: Runtime["procedures"];
  original: Picker;
  replacement: Picker;
};

let pending: Lease | null = null;

/** Restore only the property still owned by this fixture, including on a retired owner. */
export function clearFolderSelectionFixture(): void {
  const lease = pending;
  pending = null;
  if (lease && lease.owner.pickFolder === lease.replacement) {
    lease.owner.pickFolder = lease.original;
  }
}

/** Arm one public existing-folder action. The caller must verify the disposable path. */
export function mockNextFolderSelection(path: string): void {
  if (!import.meta.env.DEV) throw new Error("Folder selection fixtures require a DEV build");
  if (pending) throw new Error("A folder selection fixture is already armed");
  const runtime = readClientRuntime();
  if (
    runtime.host !== "electron" ||
    runtime.transport !== "electron-backend-host" ||
    !runtime.capabilities.localBackend ||
    !runtime.capabilities.nativeShell ||
    runtime.native.isDev !== true ||
    runtime.native.windowKind !== "main" ||
    typeof runtime.procedures.pickFolder !== "function"
  ) {
    throw new Error("Folder selection fixtures require the managed Electron main window");
  }
  const absolute =
    typeof path === "string" &&
    path.trim().length > 0 &&
    !path.includes("\0") &&
    (runtime.native.platform === "win32"
      ? /^[a-z]:[\\/]/i.test(path) || /^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(path)
      : path.startsWith("/"));
  if (!absolute) throw new Error("Folder selection fixture requires an absolute path");

  const owner = runtime.procedures;
  const original = owner.pickFolder;
  const replacement: Picker = function (this: unknown, ...args: Parameters<Picker>) {
    // A retained wrapper after consumption/clear keeps the original method's behavior.
    if (pending !== lease) {
      return Reflect.apply(original, this, args) as ReturnType<Picker>;
    }
    let current: Runtime;
    try {
      current = readClientRuntime();
    } catch (error) {
      clearFolderSelectionFixture();
      throw error;
    }
    if (current !== runtime || runtime.procedures !== owner || owner.pickFolder !== replacement) {
      clearFolderSelectionFixture();
      return Promise.reject(new Error("Folder selection fixture owner changed"));
    }
    clearFolderSelectionFixture();
    return Promise.resolve(path);
  };
  const lease: Lease = { runtime, owner, original, replacement };
  owner.pickFolder = replacement;
  pending = lease;
}
