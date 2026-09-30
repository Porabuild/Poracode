import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeStagingRequest } from "./backend";
import type { WslStagingDeployResult } from "./protocol";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-staging-backend-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeSource(root: string, name: string, content: string): string {
  const path = join(root, "src", name);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(path, content);
  return path;
}

describe("executeStagingRequest deploy", () => {
  it("creates nested destinations with spaces and non-ASCII names", async () => {
    const root = makeRoot();
    const source = writeSource(root, "helper.mjs", "export default 1;\n");
    const base = join(root, "target dir");

    const result = (await executeStagingRequest({
      op: "deploy",
      base,
      freshness: "content",
      files: [{ src: source, relDest: "nested dir/héllo wörld.mjs" }],
    })) as WslStagingDeployResult;

    expect(result.filesWritten).toBe(1);
    expect(readFileSync(join(base, "nested dir", "héllo wörld.mjs"), "utf8")).toBe(
      "export default 1;\n",
    );
  });

  it("skips identical content and rewrites changed content without temp leftovers", async () => {
    const root = makeRoot();
    const source = writeSource(root, "helper.mjs", "one");
    const base = join(root, "target");
    const file = { src: source, relDest: "helper.mjs" };

    const first = (await executeStagingRequest({
      op: "deploy",
      base,
      files: [file],
      freshness: "content",
    })) as WslStagingDeployResult;
    const second = (await executeStagingRequest({
      op: "deploy",
      base,
      files: [file],
      freshness: "content",
    })) as WslStagingDeployResult;
    writeFileSync(source, "two");
    const third = (await executeStagingRequest({
      op: "deploy",
      base,
      files: [file],
      freshness: "content",
    })) as WslStagingDeployResult;

    expect(first.filesWritten).toBe(1);
    expect(second.filesWritten).toBe(0);
    expect(third.filesWritten).toBe(1);
    expect(readFileSync(join(base, "helper.mjs"), "utf8")).toBe("two");
    expect(readdirSync(base).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });

  it("honors size+mtime freshness", async () => {
    const root = makeRoot();
    const source = writeSource(root, "helper.bin", "abc");
    const base = join(root, "target");
    const file = { src: source, relDest: "helper.bin" };

    await executeStagingRequest({ op: "deploy", base, files: [file], freshness: "size-mtime" });
    const ahead = new Date(Date.now() + 5_000);
    utimesSync(join(base, "helper.bin"), ahead, ahead);
    const second = (await executeStagingRequest({
      op: "deploy",
      base,
      files: [file],
      freshness: "size-mtime",
    })) as WslStagingDeployResult;

    expect(second.filesWritten).toBe(0);
  });

  it("fails a missing source and leaves no partial destination", async () => {
    const root = makeRoot();
    const base = join(root, "target");

    await expect(
      executeStagingRequest({
        op: "deploy",
        base,
        freshness: "content",
        files: [{ src: join(root, "missing.mjs"), relDest: "missing.mjs" }],
      }),
    ).rejects.toThrow(/ENOENT|no such file/u);
    expect(readdirSync(base)).toEqual([]);
  });
});

describe("executeStagingRequest file verbs", () => {
  it("stage-file replaces an existing destination", async () => {
    const root = makeRoot();
    const source = writeSource(root, "node.tar.xz", "archive");
    const dest = join(root, "runtime", "staged", "node.tar.xz");
    mkdirSync(join(root, "runtime", "staged"), { recursive: true });
    writeFileSync(dest, "stale");

    await executeStagingRequest({ op: "stage-file", src: source, dest });

    expect(readFileSync(dest, "utf8")).toBe("archive");
    expect(readdirSync(join(root, "runtime", "staged"))).toEqual(["node.tar.xz"]);
  });

  it("write-file creates nested destinations and read-file round-trips bytes", async () => {
    const root = makeRoot();
    const path = join(root, "nested dir", "settings.json");
    const content = '{\n  "héllo": "wörld"\n}\n';

    await executeStagingRequest({
      op: "write-file",
      path,
      contentBase64: Buffer.from(content, "utf8").toString("base64"),
    });

    expect(readFileSync(path, "utf8")).toBe(content);
    expect(readdirSync(join(root, "nested dir")).filter((e) => e.endsWith(".tmp"))).toEqual([]);
    await expect(executeStagingRequest({ op: "read-file", path })).resolves.toEqual({
      exists: true,
      contentBase64: Buffer.from(content, "utf8").toString("base64"),
    });
  });

  it("read-file reports a missing path without throwing", async () => {
    const root = makeRoot();
    await expect(
      executeStagingRequest({ op: "read-file", path: join(root, "absent.json") }),
    ).resolves.toEqual({ exists: false });
  });

  it("exists reflects the filesystem", async () => {
    const root = makeRoot();
    expect(await executeStagingRequest({ op: "exists", path: join(root, "nope") })).toBe(false);
    writeFileSync(join(root, "here"), "");
    expect(await executeStagingRequest({ op: "exists", path: join(root, "here") })).toBe(true);
  });

  it("prune-dirs keeps the requested directory and removes other node-v dirs", async () => {
    const root = makeRoot();
    const runtime = join(root, "runtime");
    mkdirSync(join(runtime, "node-v22.14.0-linux-x64"), { recursive: true });
    mkdirSync(join(runtime, "node-v20.0.0-linux-x64"), { recursive: true });
    mkdirSync(join(runtime, "keep-me"), { recursive: true });

    await executeStagingRequest({
      op: "prune-dirs",
      dir: runtime,
      keepPrefix: "node-v",
      keepName: "node-v22.14.0-linux-x64",
    });

    expect(readdirSync(runtime).sort()).toEqual(["keep-me", "node-v22.14.0-linux-x64"]);
  });

  it("read-dir lists folders and files and reports a missing directory", async () => {
    const root = makeRoot();
    mkdirSync(join(root, "1.2.3"), { recursive: true });
    writeFileSync(join(root, "notes.txt"), "n");

    await expect(executeStagingRequest({ op: "read-dir", path: root })).resolves.toEqual({
      exists: true,
      entries: [
        { name: "1.2.3", directory: true },
        { name: "notes.txt", directory: false },
      ],
    });
    await expect(
      executeStagingRequest({ op: "read-dir", path: join(root, "absent") }),
    ).resolves.toEqual({ exists: false, entries: [] });
  });
});
