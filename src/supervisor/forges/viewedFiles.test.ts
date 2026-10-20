import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ForgeViewedFilesStore } from "./viewedFiles";

const input = {
  projectLocation: { kind: "posix" as const, path: "/repo" },
  forgeAccount: { forge: "gitlab" as const, host: "https://git.example", login: "alice" },
  forgeRepository: "team/app",
  prNumber: 7,
};

describe("host-owned review viewed files", () => {
  let directory: string;
  let path: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "poracode-review-viewed-"));
    path = join(directory, "marks.json");
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("keeps marks across restarts and shares them across checkouts without crossing review authority", async () => {
    const store = new ForgeViewedFilesStore(path);
    await store.set(input, "src/app.ts", "ready:1:0:4:123");
    const restarted = new ForgeViewedFilesStore(path);
    expect(
      await restarted.get({
        ...input,
        projectLocation: { kind: "posix", path: "/other-checkout" },
      }),
    ).toEqual({ "src/app.ts": "ready:1:0:4:123" });
    for (const other of [
      { ...input, prNumber: 8 },
      { ...input, forgeRepository: "other/app" },
      { ...input, forgeAccount: { ...input.forgeAccount, login: "bob" } },
      { ...input, forgeAccount: { ...input.forgeAccount, host: "https://other.example" } },
    ])
      expect(await restarted.get(other)).toEqual({});
    await restarted.set(input, "src/app.ts", null);
    expect(await new ForgeViewedFilesStore(path).get(input)).toEqual({});
  });

  it("serializes concurrent writes and supports filenames that match object prototypes", async () => {
    const store = new ForgeViewedFilesStore(path);
    await Promise.all([
      store.set(input, "one.ts", "one"),
      store.set(input, "two.ts", "two"),
      store.set(input, "__proto__", "three"),
    ]);
    expect(await store.get(input)).toEqual(
      JSON.parse('{"one.ts":"one","two.ts":"two","__proto__":"three"}'),
    );
  });

  it("reads version 1 marks but refuses future or malformed documents without overwriting them", async () => {
    const store = new ForgeViewedFilesStore(path);
    await writeFile(path, JSON.stringify({ version: 1, reviews: {} }));
    expect(await store.get(input)).toEqual({});
    for (const contents of [
      '{"version":2,"reviews":{}}',
      '{"version":1,"reviews":{"old":{"file":false}}}',
      "invalid",
    ]) {
      await writeFile(path, contents);
      const message = contents === "invalid" ? /JSON/ : /Invalid/;
      await expect(store.get(input)).rejects.toThrow(message);
      await expect(store.set(input, "file", "read")).rejects.toThrow(message);
      expect(await readFile(path, "utf8")).toBe(contents);
    }
    await writeFile(path, JSON.stringify({ version: 1, reviews: {} }));
    expect(await store.set(input, "file", "read")).toEqual({ file: "read" });
  });
});
