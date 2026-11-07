import {
  closeSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHostRootPaths } from "./hostRootPaths";
import { readPrivateHostFile } from "./privateHostFile";

const identities = vi.hoisted(() => ({
  paths: new Map<string, bigint>(),
  opened: null as bigint | null,
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    lstatSync: (path: string, options?: { bigint?: boolean }) => {
      const ino = identities.paths.get(path);
      if (options?.bigint) {
        const stat = actual.lstatSync(path, { bigint: true });
        if (ino !== undefined) stat.ino = ino;
        return stat;
      }
      const stat = actual.lstatSync(path);
      if (ino !== undefined) stat.ino = Number(ino);
      return stat;
    },
    fstatSync: (fd: number, options?: { bigint?: boolean }) => {
      if (options?.bigint) {
        const stat = actual.fstatSync(fd, { bigint: true });
        if (identities.opened !== null) stat.ino = identities.opened;
        return stat;
      }
      const stat = actual.fstatSync(fd);
      if (identities.opened !== null) stat.ino = Number(identities.opened);
      return stat;
    },
    openSync: vi.fn<typeof actual.openSync>(actual.openSync),
    closeSync: vi.fn<typeof actual.closeSync>(actual.closeSync),
  };
});
const roots: string[] = [];
afterEach(() => {
  identities.paths.clear();
  identities.opened = null;
  vi.clearAllMocks();
  for (const root of roots.splice(0)) {
    if (dirname(realpathSync.native(root)) !== realpathSync.native(tmpdir()))
      throw new Error("Fixture cleanup is outside the temporary directory.");
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-private-file-")));
  roots.push(root);
  const paths = resolveHostRootPaths(join(root, "profile"));
  mkdirSync(paths.dataRoot);
  writeFileSync(paths.leasePath, "lease fixture");
  const path = join(paths.dataRoot, "metadata.json");
  writeFileSync(path, "private fixture", { mode: 0o600 });
  return { paths, path };
}

describe("private host file identity", () => {
  it("reads distinct NTFS file IDs that round to the same JavaScript number", () => {
    const { paths, path } = fixture();
    const lease = 6917529027709726347n;
    const metadata = 6917529027709726355n;
    expect(Number(lease)).toBe(Number(metadata));
    identities.paths.set(paths.leasePath, lease);
    identities.paths.set(path, metadata);
    identities.opened = metadata;
    expect(readPrivateHostFile(paths, "metadata.json", 128).toString()).toBe("private fixture");
  });

  it("refuses the exact lease inode without opening it", () => {
    const { paths, path } = fixture();
    identities.paths.set(paths.leasePath, 6917529027709726347n);
    identities.paths.set(path, 6917529027709726347n);
    expect(() => readPrivateHostFile(paths, "metadata.json", 128)).toThrow(
      "Invalid private host file",
    );
    expect(openSync).not.toHaveBeenCalled();
  });

  it("refuses a file swapped during open even when its file ID rounds identically", () => {
    const { paths, path } = fixture();
    identities.paths.set(paths.leasePath, 1n);
    identities.paths.set(path, 6917529027709726347n);
    identities.opened = 6917529027709726355n;
    expect(() => readPrivateHostFile(paths, "metadata.json", 128)).toThrow(
      "Invalid private host file",
    );
    expect(closeSync).toHaveBeenCalledExactlyOnceWith(expect.any(Number));
  });

  it("refuses hard-linked and oversized private files", () => {
    const { paths, path } = fixture();
    expect(() => readPrivateHostFile(paths, "metadata.json", 2)).toThrow(
      "Invalid private host file",
    );
    linkSync(path, join(paths.dataRoot, "alias.json"));
    vi.clearAllMocks();
    expect(() => readPrivateHostFile(paths, "metadata.json", 128)).toThrow(
      "Invalid private host file",
    );
    expect(openSync).not.toHaveBeenCalled();
  });
});
