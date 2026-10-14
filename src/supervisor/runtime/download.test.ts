import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { downloadToFile, verifySha256 } from "./download";

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "poracode-runtime-download-"));
  dirs.push(dir);
  return join(dir, "archive");
}

it("cancels a held response stream after fetch has already returned", async () => {
  const controller = new AbortController();
  const cancelled = vi.fn<(reason?: unknown) => void>();
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      stream.enqueue(new Uint8Array(262144));
    },
    cancel: cancelled,
  });
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(body));
  vi.stubGlobal("fetch", fetch);
  const pending = downloadToFile("https://example.invalid/private-fixture", fixture(), {
    signal: controller.signal,
    onProgress: ready,
  });
  const refused = pending.catch((error: unknown) => error);
  await started;
  controller.abort();
  expect(await refused).toMatchObject({ name: "AbortError" });
  expect(fetch).toHaveBeenCalledWith("https://example.invalid/private-fixture", {
    signal: controller.signal,
  });
  expect(cancelled).toHaveBeenCalledOnce();
});

it("cancels checksum streaming rather than reading an archive after shutdown", async () => {
  const file = fixture();
  writeFileSync(file, Buffer.alloc(1024));
  const controller = new AbortController();
  controller.abort();
  await expect(verifySha256(file, "wrong-digest", controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
});
