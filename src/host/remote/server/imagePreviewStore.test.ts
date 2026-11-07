import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import * as fileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  databaseImagePreviewSchema,
  databaseImagePreviewSnapshotSchema,
} from "@/host/db/databaseReadProtocol";
import {
  getCachedImagePreview,
  imagePreviewKey,
  resetImagePreviews,
  scheduleImagePreview,
  setImagePreviewGenerator,
  setImagePreviewStoreDir,
} from "./imagePreview";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readdir: vi.fn<typeof actual.readdir>(actual.readdir),
    stat: vi.fn<typeof actual.stat>(actual.stat),
    readFile: vi.fn<typeof actual.readFile>(actual.readFile),
  };
});

const flush = () => new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));
const source = () => ({ data: Buffer.from([1, 2, 3]), mime: "image/png" });
const PREVIEW = "data:image/jpeg;base64,AAA";

describe("persisted image preview store", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "poracode-image-previews-"));
  });

  afterEach(async () => {
    resetImagePreviews();
    await setImagePreviewStoreDir(null);
    vi.mocked(fileSystem.readdir).mockReset();
    vi.mocked(fileSystem.stat).mockReset();
    vi.mocked(fileSystem.readFile).mockReset();
    rmSync(dir, { recursive: true, force: true });
  });

  it("bounds worker preview events and snapshots before they enter the owning cache", () => {
    expect(databaseImagePreviewSchema.safeParse({ key: "k", preview: PREVIEW }).success).toBe(true);
    expect(
      databaseImagePreviewSchema.safeParse({ key: "é".repeat(2049), preview: PREVIEW }).success,
    ).toBe(false);
    expect(
      databaseImagePreviewSchema.safeParse({ key: "k", preview: `${PREVIEW}${"é".repeat(2049)}` })
        .success,
    ).toBe(false);
    expect(
      databaseImagePreviewSnapshotSchema.safeParse(
        Array.from({ length: 513 }, (_, i) => ({ key: `${i}`, preview: PREVIEW })),
      ).success,
    ).toBe(false);
    expect(
      databaseImagePreviewSnapshotSchema.safeParse(
        Array.from({ length: 512 }, (_, i) => ({
          key: `${i}${"x".repeat(3000)}`,
          preview: PREVIEW,
        })),
      ).success,
    ).toBe(false);
  });

  it("serves a generated preview after an in-memory reset without regenerating", async () => {
    const generator = vi.fn<() => string>(() => PREVIEW);
    setImagePreviewGenerator(generator);
    await setImagePreviewStoreDir(dir);
    const key = imagePreviewKey("thread-1", "item-1", ["images", 0]);
    expect(scheduleImagePreview(key, 3, source)).toBe(true);
    await flush();
    expect(getCachedImagePreview(key)).toBe(PREVIEW);
    // Persistence is fire-and-forget; wait for the stored file to land.
    await vi.waitFor(() => {
      expect(readdirSync(dir).filter((name) => name.endsWith(".json"))).toHaveLength(1);
    });

    // Simulate a host restart: in-memory state and generator identity reset,
    // then the composition reinstalls the generator and the store directory.
    resetImagePreviews();
    expect(getCachedImagePreview(key)).toBeUndefined();
    const nextGenerator = vi.fn<() => string>(() => "data:image/jpeg;base64,BBB");
    setImagePreviewGenerator(nextGenerator);
    await setImagePreviewStoreDir(dir);
    expect(getCachedImagePreview(key)).toBe(PREVIEW);
    // A projection now hits the cache, so nothing is scheduled or generated.
    expect(scheduleImagePreview(key, 3, source)).toBe(false);
    await flush();
    expect(nextGenerator).not.toHaveBeenCalled();
  });

  it("ignores corrupt and non-image stored entries on preload", async () => {
    writeFileSync(join(dir, "broken.json"), "not json", "utf8");
    writeFileSync(
      join(dir, "evil.json"),
      JSON.stringify({ key: "k", preview: "https://example.test/x.png" }),
      "utf8",
    );
    writeFileSync(join(dir, "ignored.txt"), "{}", "utf8");
    setImagePreviewGenerator(() => PREVIEW);
    await setImagePreviewStoreDir(dir);
    expect(getCachedImagePreview("k")).toBeUndefined();
  });

  it("enforces the file cap as new previews are persisted without restarting", async () => {
    const oldest = join(dir, "0.json");
    writeFileSync(oldest, JSON.stringify({ key: "old-0", preview: PREVIEW }));
    const template = statSync(oldest);
    vi.mocked(fileSystem.readdir as (path: string) => Promise<string[]>).mockResolvedValueOnce(
      Array.from({ length: 4096 }, (_, i) => `${i}.json`),
    );
    vi.mocked(fileSystem.stat as (path: string) => Promise<Stats>).mockImplementation(
      async (path) => {
        const metadata = Object.create(template) as Stats;
        metadata.mtimeMs = Number(basename(path, ".json"));
        return metadata;
      },
    );
    vi.mocked(
      fileSystem.readFile as (path: string, encoding: "utf8") => Promise<string>,
    ).mockResolvedValue(JSON.stringify({ key: "old", preview: PREVIEW }));
    setImagePreviewGenerator(() => PREVIEW);
    await setImagePreviewStoreDir(dir);
    expect(scheduleImagePreview("new", 3, source)).toBe(true);
    await flush();
    await vi.waitFor(() => {
      expect(existsSync(oldest)).toBe(false);
      expect(readdirSync(dir).filter((name) => name.endsWith(".json"))).toHaveLength(1);
    });
  });

  it("enforces the stored-byte cap after a write", async () => {
    writeFileSync(join(dir, "large.json"), "x".repeat(32 * 1024 * 1024));
    setImagePreviewGenerator(() => PREVIEW);
    await setImagePreviewStoreDir(dir);
    expect(scheduleImagePreview("new", 3, source)).toBe(true);
    await flush();
    await vi.waitFor(() => expect(existsSync(join(dir, "large.json"))).toBe(false));
  });

  it("does not persist or preload without a store directory", async () => {
    setImagePreviewGenerator(() => PREVIEW);
    const key = imagePreviewKey("thread-1", "item-1", ["images", 0]);
    expect(scheduleImagePreview(key, 3, source)).toBe(true);
    await flush();
    expect(getCachedImagePreview(key)).toBe(PREVIEW);
    expect(readdirSync(dir)).toEqual([]);
  });
});
