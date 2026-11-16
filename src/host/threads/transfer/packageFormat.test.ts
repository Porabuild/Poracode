import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  openThreadTransferPackage,
  sha256File,
  ThreadTransferPackageError,
  writeThreadTransferPackage,
  type ThreadTransferPackageHeader,
} from "./packageFormat";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const header: Omit<ThreadTransferPackageHeader, "parts"> = {
  formatVersion: 1,
  createdAt: "2026-11-01T10:00:00Z",
  source: { hostId: "host-a", hostLabel: "Laptop" },
  thread: {
    id: "thread-1",
    title: "Picker",
    agentKind: "codex",
    config: { model: "gpt-5" },
    presentationMode: "gui",
    createdAt: "2026-11-01T10:00:00Z",
    starred: false,
  },
  transcript: { throughItemId: "a1", turns: [] },
  git: null,
  attachments: [],
};

async function writeFixture(): Promise<{ dir: string; path: string }> {
  const dir = mkdtempSync(join(tmpdir(), "poracode-transfer-package-"));
  dirs.push(dir);
  const file = join(dir, "bundle.bin");
  writeFileSync(file, "bundle bytes");
  const path = join(dir, "package.bin");
  const written = await writeThreadTransferPackage(path, header, [
    { name: "items", data: Buffer.from("items") },
    { name: "bundle", file },
    { name: "empty", data: new Uint8Array() },
  ]);
  expect(written.sha256).toBe(await sha256File(path));
  return { dir, path };
}

describe("thread transfer package format", () => {
  it("round-trips the header and every part, including streamed and empty ones", async () => {
    const { dir, path } = await writeFixture();
    const pkg = await openThreadTransferPackage(path);
    expect(pkg.header.thread.title).toBe("Picker");
    expect((await pkg.readPart("items", 100)).toString()).toBe("items");
    await pkg.copyPartToFile("bundle", join(dir, "copy.bundle"));
    expect(readFileSync(join(dir, "copy.bundle"), "utf8")).toBe("bundle bytes");
    await pkg.copyPartToFile("empty", join(dir, "empty.bin"));
    await expect(pkg.readPart("items", 2)).rejects.toBeInstanceOf(ThreadTransferPackageError);
  });

  it("refuses foreign, truncated, future and corrupted packages", async () => {
    const { dir, path } = await writeFixture();
    const bytes = readFileSync(path);
    const variant = (name: string, data: Buffer) => {
      const target = join(dir, name);
      writeFileSync(target, data);
      return openThreadTransferPackage(target);
    };
    await expect(variant("foreign", Buffer.from("not a package at all"))).rejects.toThrow(
      ThreadTransferPackageError,
    );
    await expect(variant("truncated", bytes.subarray(0, bytes.length - 3))).rejects.toThrow(
      ThreadTransferPackageError,
    );
    const future = Buffer.from(
      bytes.toString("latin1").replace('"formatVersion":1', '"formatVersion":2'),
      "latin1",
    );
    await expect(variant("future", future)).rejects.toThrow(ThreadTransferPackageError);
    const corrupt = Buffer.from(bytes);
    const flipped = corrupt.length - "bundle bytes".length;
    corrupt[flipped] = corrupt[flipped]! ^ 0xff;
    const pkg = await variant("corrupt", corrupt);
    await expect(pkg.copyPartToFile("bundle", join(dir, "bad.bundle"))).rejects.toThrow(
      ThreadTransferPackageError,
    );
  });
});
