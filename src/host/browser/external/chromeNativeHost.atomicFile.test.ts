import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writePrivateFile } from "./chromeNativeHost";

const faults = vi.hoisted(() => ({ codes: [] as string[], publishedModes: [] as number[] }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync: vi.fn<typeof actual.renameSync>((from, to) => {
      const code = faults.codes.shift();
      if (code) throw Object.assign(new Error(code), { code });
      // Permission tightening must happen before a reader can see the replacement.
      if (process.platform !== "win32")
        faults.publishedModes.push(actual.statSync(from).mode & 0o777);
      actual.renameSync(from, to);
    }),
  };
});
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: vi.fn<typeof actual.randomUUID>(actual.randomUUID) };
});

describe("native private atomic writes", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "native-private-write-"));
    faults.codes = [];
    faults.publishedModes = [];
    vi.mocked(randomUUID).mockReset();
    vi.mocked(randomUUID).mockImplementation(() => "f6489b1a-1952-4a42-8e74-448e00c24a15");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("retries transient rename locks and publishes the complete private replacement", () => {
    const path = join(dir, "bridge.json");
    writeFileSync(path, "old");
    faults.codes = ["EPERM", "EBUSY"];
    writePrivateFile(path, "complete replacement");
    expect(renameSync).toHaveBeenCalledTimes(3);
    expect(readFileSync(path, "utf8")).toBe("complete replacement");
    expect(process.platform === "win32" ? 0o600 : statSync(path).mode & 0o777).toBe(0o600);
    expect(faults.publishedModes).toEqual(process.platform === "win32" ? [] : [0o600]);
    expect(readdirSync(dir)).toEqual(["bridge.json"]);
  });

  it("preserves the previous file and cleans its temporary after exhausting retries", () => {
    const path = join(dir, "bridge.json");
    writeFileSync(path, "old");
    faults.codes = Array.from({ length: 6 }, () => "EPERM");
    expect(() => writePrivateFile(path, "replacement")).toThrow(/EPERM/);
    expect(renameSync).toHaveBeenCalledTimes(6);
    expect(readFileSync(path, "utf8")).toBe("old");
    expect(readdirSync(dir)).toEqual(["bridge.json"]);
  });

  it("never truncates or removes another writer's colliding temporary", () => {
    const path = join(dir, "bridge.json");
    const temporary = `${path}.f6489b1a-1952-4a42-8e74-448e00c24a15.tmp`;
    writeFileSync(path, "old");
    writeFileSync(temporary, "other writer");
    expect(() => writePrivateFile(path, "replacement")).toThrow(/EEXIST/);
    expect(readFileSync(path, "utf8")).toBe("old");
    expect(readFileSync(temporary, "utf8")).toBe("other writer");
    expect(renameSync).not.toHaveBeenCalled();
  });
});
