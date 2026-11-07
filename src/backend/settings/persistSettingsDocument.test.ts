import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it, vi } from "vitest";
import { persistSettingsDocument } from "./persistSettingsDocument";

it("skips unsupported directory fsync on Windows after committing the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "poracode-settings-fsync-win32-"));
  const path = join(directory, "settings.json");
  const syncDirectory = vi.fn<(path: string) => Promise<void>>(async () => {});
  const committed = vi.fn<() => void>();
  const reportError = vi.fn<(error: unknown) => void>();
  try {
    await persistSettingsDocument(path, '{"version":1}\n', {
      assertActive() {},
      committed,
      platform: "win32",
      reportError,
      syncDirectory,
    });
    expect(await readFile(path, "utf8")).toBe('{"version":1}\n');
    expect(committed).toHaveBeenCalledOnce();
    expect(syncDirectory).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("attempts directory fsync on other platforms and reports genuine failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "poracode-settings-fsync-posix-"));
  const path = join(directory, "settings.json");
  const failure = new Error("directory fsync failed");
  const syncDirectory = vi.fn<(path: string) => Promise<void>>(async () => {
    throw failure;
  });
  const committed = vi.fn<() => void>();
  const reportError = vi.fn<(error: unknown) => void>();
  try {
    await persistSettingsDocument(path, '{"version":1}\n', {
      assertActive() {},
      committed,
      platform: "linux",
      reportError,
      syncDirectory,
    });
    expect(await readFile(path, "utf8")).toBe('{"version":1}\n');
    expect(committed).toHaveBeenCalledOnce();
    expect(syncDirectory).toHaveBeenCalledExactlyOnceWith(dirname(path));
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
