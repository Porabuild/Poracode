// @vitest-environment jsdom
import { open, type FileHandle } from "node:fs/promises";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_CLIENT_ASSET_BASE_META_NAME as RENDERER_META_NAME } from "../../renderer/buildAssetBase";
import {
  LOCAL_CLIENT_ASSET_BASE_META_NAME,
  LOCAL_CLIENT_HTML_HEAD_BYTES,
  normalizeLocalClientHtmlHead,
  readLocalClientHtml,
} from "./localClientHtml";

const reads = {
  limit: Number.MAX_SAFE_INTEGER,
  bytes: 0,
  fail: false,
  opened: [] as FileHandle[],
};

interface HeadReaderPrototype {
  read(
    this: FileHandle,
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number; buffer: Buffer }>;
}

const META = '<meta name="poracode-build-asset-base" content="/">';
let root = "";

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "poracode-local-head-"));
  reads.limit = Number.MAX_SAFE_INTEGER;
  reads.bytes = 0;
  reads.fail = false;
  reads.opened.length = 0;
  const probePath = join(root, "probe");
  writeFileSync(probePath, "");
  const probe = await open(probePath, "r");
  const prototype = Object.getPrototypeOf(probe) as HeadReaderPrototype;
  await probe.close();
  const read = prototype.read;
  vi.spyOn(prototype, "read").mockImplementation(
    async function (this: FileHandle, buffer, offset, length, position) {
      if (!reads.opened.includes(this)) reads.opened.push(this);
      if (reads.fail) throw new Error("synthetic head read failure");
      const result = await read.call(this, buffer, offset, Math.min(length, reads.limit), position);
      reads.bytes += result.bytesRead;
      return result;
    },
  );
});

afterEach(async () => {
  const leaked = reads.opened.filter((handle) => handle.fd !== -1);
  await Promise.all(leaked.map((handle) => handle.close()));
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
  if (leaked.length) throw new Error("Head recognition retained an owned descriptor");
});

async function documentBytes(html: string): Promise<Buffer> {
  const bytes = Buffer.from(html);
  const path = join(root, "index.html");
  writeFileSync(path, bytes);
  const result = await readLocalClientHtml(path, bytes.length);
  return result ? Buffer.concat([result.prefix, bytes.subarray(result.sourcePrefixBytes)]) : bytes;
}

describe("local HTTP build asset head", () => {
  it("keeps the private host/renderer metadata identity in sync", () => {
    expect(LOCAL_CLIENT_ASSET_BASE_META_NAME).toBe(RENDERER_META_NAME);
  });

  it("roots only allowlisted build attributes and preserves navigation/raw text", async () => {
    const html =
      "<!doctype html><html><head>" +
      '<!-- <link href="./assets/comment.css"> -->' +
      "<script>const example='<link href=\"./assets/example.css\">';</script>" +
      '<style>.example:after{content:"<link href=./assets/example.css>"}</style>' +
      '<script type="module" src="./assets/entry.js"></script>' +
      '<link data-note=\' href="./assets/note.css"\' href="./assets/main.css?x=1&amp;y=2#theme">' +
      '<link href="./manifest.webmanifest"><link href="./icons/icon.png">' +
      '<link href="./api/snapshot"><link href="./forward/8080">' +
      '<link href="./assets/../api/snapshot"><link href="./assets/../forward/8080">' +
      '<link href="./assets/&#46;&#46;/api/snapshot">' +
      '<link href="./assets/name%20with-space.css"><link href="./assets/file\'s.css">' +
      '<link href="/hosted/assets/main.css"><link href="https://cdn.example/assets/main.css">' +
      '</head><body><a href="notes.md">Notes</a><a href="#section">Section</a>' +
      '<img src="./icons/body.png">😀</body></html>';
    const result = (await documentBytes(html)).toString();
    expect(result).toBe(
      html
        .replace("<head>", "<head>" + META)
        .replace('src="./assets/entry.js"', 'src="/assets/entry.js"')
        .replace(
          'href="./assets/main.css?x=1&amp;y=2#theme"',
          'href="/assets/main.css?x=1&amp;y=2#theme"',
        )
        .replace('href="./manifest.webmanifest"', 'href="/manifest.webmanifest"')
        .replace('href="./icons/icon.png"', 'href="/icons/icon.png"')
        .replace('href="./assets/name%20with-space.css"', 'href="/assets/name%20with-space.css"')
        .replace('href="./assets/file\'s.css"', 'href="/assets/file\'s.css"'),
    );
    const parsed = new DOMParser().parseFromString(result, "text/html");
    expect(parsed.querySelector('link[href^="/assets/main.css"]')?.getAttribute("href")).toBe(
      "/assets/main.css?x=1&y=2#theme",
    );
    expect(parsed.querySelector("base")).toBeNull();
    expect(parsed.querySelector("a")?.getAttribute("href")).toBe("notes.md");
    expect(parsed.querySelectorAll("a")[1]?.getAttribute("href")).toBe("#section");
  });

  it("preserves an existing hosted base and absolute root/subpath/CDN asset URLs", async () => {
    const html =
      '<html><head><base href="/hosted/">' +
      '<script src="/hosted/assets/entry.js"></script><link href="/assets/root.css">' +
      '<link href="https://cdn.example/main.css"></head><body><a href="notes.md"></a></body></html>';
    expect((await documentBytes(html)).toString()).toBe(html.replace("<head>", "<head>" + META));
  });

  it.each([
    ".//example.invalid/assets/app.js",
    ".//local-client.invalid/assets/app.js",
    "./\t/example.invalid/assets/app.js",
    "./\n/local-client.invalid/assets/app.js",
    "./\\example.invalid/assets/app.js",
  ])("keeps relative attributes that would become network authorities %#", async (url) => {
    const html = '<html><head><script src="' + url + '"></script></head><body></body></html>';
    const result = (await documentBytes(html)).toString();
    expect(result).toBe(html.replace("<head>", "<head>" + META));
    const parsed = new DOMParser().parseFromString(result, "text/html");
    const relative = parsed.querySelector("script")?.getAttribute("src");
    expect(relative).toBe(url);
    expect(new URL(relative ?? "", "http://127.0.0.1/thread/id").origin).toBe("http://127.0.0.1");
  });

  it("handles short reads, UTF-8 and split attribute/head tokens without retaining the body", async () => {
    reads.limit = 7;
    const html =
      '<html><head><title>😀 文</title><script src="./assets/entry.js"></script></head>' +
      "<body>😀" +
      "x".repeat(LOCAL_CLIENT_HTML_HEAD_BYTES * 2) +
      "</body></html>";
    expect((await documentBytes(html)).toString()).toBe(
      html
        .replace("<head>", "<head>" + META)
        .replace('src="./assets/entry.js"', 'src="/assets/entry.js"'),
    );
    expect(reads.bytes).toBe(LOCAL_CLIENT_HTML_HEAD_BYTES);
  });

  it("recognizes a complete head ending at the exact byte limit", async () => {
    const start = '<html><head><script src="./assets/entry.js"></script><!--';
    const end = "--></head>";
    const html =
      start +
      "x".repeat(LOCAL_CLIENT_HTML_HEAD_BYTES - Buffer.byteLength(start + end)) +
      end +
      "<body>body</body></html>";
    expect((await documentBytes(html)).toString()).toBe(
      html
        .replace("<head>", "<head>" + META)
        .replace('src="./assets/entry.js"', 'src="/assets/entry.js"'),
    );
    expect(reads.bytes).toBe(LOCAL_CLIENT_HTML_HEAD_BYTES);
  });

  it.each([
    "<!doctype html><title>Legacy implicit head</title>",
    '<html><head><script src="./assets/entry.js"></script>',
    '<html><body><head><script src="./assets/entry.js"></script></head></body></html>',
    '<html><head><script>const fake="</head>";',
    "<html><head><!--" +
      "x".repeat(LOCAL_CLIENT_HTML_HEAD_BYTES) +
      '--><script src="./assets/entry.js"></script></head><body>body</body></html>',
  ])("keeps an unrecognized/incomplete/oversized head byte-exact %#", async (html) => {
    expect((await documentBytes(html)).toString()).toBe(html);
    expect(reads.bytes).toBeLessThanOrEqual(LOCAL_CLIENT_HTML_HEAD_BYTES);
  });

  it("keeps unreadable or missing heads on the legacy path and closes every descriptor", async () => {
    const path = join(root, "index.html");
    const html = '<html><head><script src="./assets/entry.js"></script></head></html>';
    writeFileSync(path, html);
    reads.fail = true;
    expect(await readLocalClientHtml(path, Buffer.byteLength(html))).toBeNull();
    expect(await readLocalClientHtml(join(root, "missing.html"), 10)).toBeNull();
  });

  it("stops between pending short reads when the response aborts and releases its descriptor", async () => {
    const html = '<html><head><script src="./assets/entry.js"></script></head></html>';
    const path = join(root, "index.html");
    writeFileSync(path, html);
    reads.limit = 7;
    expect(
      await readLocalClientHtml(path, Buffer.byteLength(html), () => reads.bytes > 0),
    ).toBeNull();
    expect(reads.bytes).toBe(7);
    expect(reads.opened).toHaveLength(1);
    expect(reads.opened[0]?.fd).toBe(-1);
  });

  it("does not accumulate private markers when an already normalized document is read", () => {
    const html =
      "<html><head>" + META + '<script src="/assets/entry.js"></script></head><body></body>';
    const result = normalizeLocalClientHtmlHead(Buffer.from(html));
    expect(result?.prefix.toString()).toBe(html.slice(0, html.indexOf("</head>") + 7));
  });

  it("refuses invalid UTF-8 in a head instead of shifting the original body offset", async () => {
    const bytes = Buffer.concat([
      Buffer.from("<html><head><title>"),
      Buffer.from([0xff]),
      Buffer.from('</title><script src="./assets/entry.js"></script></head><body>unchanged</body>'),
    ]);
    const path = join(root, "index.html");
    writeFileSync(path, bytes);
    expect(await readLocalClientHtml(path, bytes.length)).toBeNull();
  });
});
