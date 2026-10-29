import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalImageThumb } from "./localImageThumb";

const reads = vi.hoisted(() => ({ active: 0, peak: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: (async (...args: Parameters<typeof actual.readFile>) => {
      reads.active += 1;
      reads.peak = Math.max(reads.peak, reads.active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return await actual.readFile(...args);
      } finally {
        reads.active -= 1;
      }
    }) as typeof actual.readFile,
  };
});

// One-pixel-per-frame APNG; libvips reports it as a single page.
const APNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAAIAAAACAAAAAAAAAAAAAEACgAA8k66YgAAAA9JREFUeJxjaMABGIaWBACC82ABnO4PJAAAABpmY1RMAAAAAQAAAAgAAAAIAAAAAAAAAAAAAQAKAABpPVC2AAAAE2ZkQVQAAAACeJxjcMABGIaWBADB1jABVPXl9gAAAABJRU5ErkJggg==",
  "base64",
);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "poracode-local-thumb-"));
  reads.peak = 0;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function writePng(name: string, width: number, height: number): Promise<string> {
  const path = join(dir, name);
  writeFileSync(
    path,
    await sharp({ create: { width, height, channels: 3, background: "teal" } })
      .png()
      .toBuffer(),
  );
  return path;
}

describe("createLocalImageThumb", () => {
  it("shrinks a screenshot so its shorter side covers the tile", async () => {
    const thumb = await createLocalImageThumb(await writePng("shot.png", 1600, 1000), 64);
    expect(await sharp(thumb!).metadata()).toMatchObject({
      format: "png",
      width: 102,
      height: 64,
    });
  });

  it("never enlarges an image smaller than the tile", async () => {
    const thumb = await createLocalImageThumb(await writePng("icon.png", 20, 10), 64);
    expect(await sharp(thumb!).metadata()).toMatchObject({ width: 20, height: 10 });
  });

  it("applies EXIF orientation before resizing", async () => {
    const path = join(dir, "rotated.jpg");
    writeFileSync(
      path,
      await sharp({ create: { width: 600, height: 1000, channels: 3, background: "red" } })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer(),
    );
    const thumb = await createLocalImageThumb(path, 60);
    expect(await sharp(thumb!).metadata()).toMatchObject({ width: 100, height: 60 });
  });

  it("leaves vectors, animations, and unreadable files to the full-size path", async () => {
    const svg = join(dir, "a.svg");
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"/>');
    const gif = join(dir, "a.gif");
    writeFileSync(
      gif,
      await sharp(Buffer.concat([Buffer.alloc(8 * 8 * 3, 128), Buffer.alloc(8 * 8 * 3, 64)]), {
        raw: { width: 8, height: 16, channels: 3, pageHeight: 8 },
      })
        .gif({ delay: [100, 100], loop: 0 })
        .toBuffer(),
    );
    const apng = join(dir, "a.png");
    writeFileSync(apng, APNG);
    const broken = join(dir, "broken.png");
    writeFileSync(broken, "not an image");

    expect(await createLocalImageThumb(svg, 4)).toBeNull();
    expect(await createLocalImageThumb(gif, 4)).toBeNull();
    expect(await createLocalImageThumb(apng, 4)).toBeNull();
    expect(await createLocalImageThumb(broken, 64)).toBeNull();
    expect(await createLocalImageThumb(join(dir, "missing.png"), 64)).toBeNull();
  });

  it("generates at most two thumbnails at a time", async () => {
    const paths = await Promise.all(
      Array.from({ length: 6 }, (_, index) => writePng(`shot-${index}.png`, 400, 300)),
    );
    const thumbs = await Promise.all(paths.map((path) => createLocalImageThumb(path, 32)));
    expect(thumbs.every((thumb) => thumb !== null)).toBe(true);
    expect(reads.peak).toBe(2);
  });
});
