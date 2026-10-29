import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toLocalFileUrl } from "@/shared/promptContent";
import { localImageThumbUrl } from "@/shared/localImageThumb";

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (request: Request) => Promise<Response> | Response>(),
  fetch: vi.fn<(url: string) => Promise<Response>>(),
}));

vi.mock("electron", () => ({
  protocol: {
    handle: (scheme: string, handler: (request: Request) => Promise<Response> | Response) =>
      electron.handlers.set(scheme, handler),
  },
  net: { fetch: electron.fetch },
}));

import { installLocalFileProtocolHandler } from "./localFiles";

let dir: string;
let shot: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "poracode-local-protocol-"));
  shot = join(dir, "shot.png");
  writeFileSync(
    shot,
    await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "teal" } })
      .png()
      .toBuffer(),
  );
  electron.fetch.mockResolvedValue(new Response("full"));
  installLocalFileProtocolHandler();
});

afterEach(() => {
  electron.handlers.clear();
  electron.fetch.mockReset();
  rmSync(dir, { recursive: true, force: true });
});

function serve(url: string): Promise<Response> {
  return Promise.resolve(electron.handlers.get("poracode-local")!(new Request(url)));
}

describe("local file protocol", () => {
  it("serves a resized PNG for a thumbnail request", async () => {
    const response = await serve(localImageThumbUrl(toLocalFileUrl(shot), 56)!);
    expect(response.headers.get("content-type")).toBe("image/png");
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(metadata).toMatchObject({ width: 90, height: 56 });
    expect(electron.fetch).not.toHaveBeenCalled();
  });

  it("serves the original file for full-size and failed thumbnail requests", async () => {
    await serve(toLocalFileUrl(shot));
    const broken = join(dir, "broken.png");
    writeFileSync(broken, "not an image");
    await serve(localImageThumbUrl(toLocalFileUrl(broken), 56)!);

    expect(electron.fetch.mock.calls.map(([url]) => url)).toEqual([
      pathToFileURL(shot).href,
      pathToFileURL(broken).href,
    ]);
  });
});
