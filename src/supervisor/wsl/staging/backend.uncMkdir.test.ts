import * as fsPromises from "node:fs/promises";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  type MakeDirectoryOptions,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeStagingRequest } from "./backend";

// Node 26 on Windows rejects a recursive mkdir of an existing directory on a
// `\\wsl.localhost\<distro>` share with EISDIR (weekly WSL qualification,
// 2026-11-04). Simulate that for every existing directory.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn<(path: string, options?: MakeDirectoryOptions) => Promise<string | undefined>>(
      async (path, options) => {
        const existing = await actual.stat(path).catch(() => null);
        if (existing?.isDirectory()) {
          throw Object.assign(
            new Error(`EISDIR: illegal operation on a directory, mkdir '${path}'`),
            {
              code: "EISDIR",
            },
          );
        }
        return actual.mkdir(path, options);
      },
    ),
  };
});

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-staging-unc-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.mocked(fsPromises.mkdir).mockClear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("staging verbs on a share that rejects mkdir of existing directories", () => {
  it("write-file into an existing directory succeeds", async () => {
    const root = makeRoot();
    const path = join(root, "settings.json");
    await executeStagingRequest({
      op: "write-file",
      path,
      contentBase64: Buffer.from("{}").toString("base64"),
    });
    expect(readFileSync(path, "utf8")).toBe("{}");
    expect(fsPromises.mkdir).toHaveBeenCalled();
  });

  it("mkdirp, stage-file and deploy succeed when the parent already exists", async () => {
    const root = makeRoot();
    const source = join(root, "source.txt");
    writeFileSync(source, "payload");

    await executeStagingRequest({ op: "mkdirp", path: root });
    await executeStagingRequest({ op: "stage-file", src: source, dest: join(root, "staged.txt") });
    await executeStagingRequest({
      op: "deploy",
      base: root,
      freshness: "content",
      files: [{ src: source, relDest: "deployed.txt" }],
    });

    expect(readFileSync(join(root, "staged.txt"), "utf8")).toBe("payload");
    expect(readFileSync(join(root, "deployed.txt"), "utf8")).toBe("payload");
  });
});
