import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceEvidenceWriter } from "./performanceEvidenceWriter";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixturePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "performance-writer-"));
  roots.push(root);
  return join(root, "evidence.ndjson");
}

describe("bounded performance evidence writer", () => {
  it("writes ordered records and a joined end marker to a private fresh file", async () => {
    const path = await fixturePath();
    const writer = new PerformanceEvidenceWriter(path, 65_536);
    writer.append({ kind: "start" });
    writer.append({ kind: "sample", sequence: 0 });
    const result = await writer.finish("shutdown");
    const records = (await readFile(path, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records).toMatchObject([
      { kind: "start" },
      { sequence: 0 },
      { kind: "end", complete: true },
    ]);
    expect(result).toMatchObject({ writtenRecords: 2, droppedRecords: 0, error: null });
    expect(result.writtenBytes).toBe((await stat(path)).size);
  });

  it.skipIf(process.platform === "win32")("creates private evidence files on POSIX", async () => {
    const path = await fixturePath();
    const writer = new PerformanceEvidenceWriter(path, 65_536);
    writer.append({ kind: "start" });
    await writer.finish("shutdown");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("never overwrites a previous run's file", async () => {
    const path = await fixturePath();
    await writeFile(path, "previous evidence");
    const writer = new PerformanceEvidenceWriter(path, 65_536);
    writer.append({ value: "replacement" });
    expect(await writer.finish("shutdown")).toMatchObject({ error: "open", writtenRecords: 0 });
    expect(await readFile(path, "utf8")).toBe("previous evidence");
  });

  it("bounds pending records while one append is held and preserves FIFO order", async () => {
    const held = Promise.withResolvers<void>();
    const lines: string[] = [];
    let concurrent = 0;
    let peakConcurrent = 0;
    const close = vi.fn<() => Promise<void>>(async () => {});
    const writer = new PerformanceEvidenceWriter("unused", 65_536, async () => ({
      async writeFile(value) {
        concurrent += 1;
        peakConcurrent = Math.max(peakConcurrent, concurrent);
        lines.push(String(value));
        if (lines.length === 1) await held.promise;
        concurrent -= 1;
      },
      close,
    }));
    writer.append({ sequence: 0 });
    await vi.waitFor(() => expect(lines).toHaveLength(1));
    for (let sequence = 1; sequence < 8; sequence += 1) writer.append({ sequence });
    expect(writer.stats()).toMatchObject({
      acceptedRecords: 4,
      droppedRecords: 4,
      writtenRecords: 0,
    });
    const finished = writer.finish("shutdown");
    expect(close).not.toHaveBeenCalled();
    held.resolve();
    expect(await finished).toMatchObject({ writtenRecords: 4, droppedRecords: 4 });
    expect(lines.map((line) => JSON.parse(line))).toMatchObject([
      { sequence: 0 },
      { sequence: 1 },
      { sequence: 2 },
      { sequence: 3 },
      { kind: "end", complete: false },
    ]);
    expect(peakConcurrent).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(await writer.finish("shutdown")).toEqual(writer.stats());
  });

  it("reserves the end marker within the disk cap and reports a truncated run", async () => {
    const path = await fixturePath();
    const writer = new PerformanceEvidenceWriter(path, 24_576);
    expect(writer.append({ value: "a".repeat(12_000) })).toBe(true);
    expect(writer.append({ value: "b".repeat(12_000) })).toBe(false);
    const result = await writer.finish("budget");
    expect(result).toMatchObject({ budgetExceeded: true, droppedRecords: 1 });
    expect((await stat(path)).size).toBeLessThanOrEqual(24_576);
    const final = JSON.parse((await readFile(path, "utf8")).trim().split("\n").at(-1)!);
    expect(final).toMatchObject({ reason: "budget", complete: false });
  });

  it("reports failed output and still closes its owned file", async () => {
    const close = vi.fn<() => Promise<void>>(async () => {});
    const writer = new PerformanceEvidenceWriter("unused", 65_536, async () => ({
      writeFile: async () => {
        throw new Error("synthetic private filesystem path");
      },
      close,
    }));
    writer.append({ kind: "start" });
    expect(await writer.finish("shutdown")).toMatchObject({ error: "write", writtenRecords: 0 });
    expect(close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(writer.stats())).not.toContain("synthetic private");
  });
});
