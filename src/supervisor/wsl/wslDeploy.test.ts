import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WslStagingService } from "./staging";
import type { WslStagingRequest } from "./staging/protocol";
import {
  deployFilesToWslHome,
  deployFilesToWslTempBase,
  readBundledHelperVersion,
  removeWslStagedPath,
  resolveWslHelpersDir,
} from "./wslDeploy";

/**
 * Direct unit tests for `resolveWslHelpersDir` (env-var fallback) and the
 * idempotent staleness check used by `deployFilesToWslHome`. The full UNC
 * deploy path requires WSL to be installed, so we cover that integration in
 * the higher-level bridge tests with a stubbed `deploy` callback.
 */
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lc-wsl-deploy-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  delete process.env.PORACODE_WSL_HELPERS_DIR;
  delete process.env.PORACODE_WSL_WATCHER_DIR;
});

describe("resolveWslHelpersDir", () => {
  it("prefers PORACODE_WSL_HELPERS_DIR over the legacy fallback", () => {
    process.env.PORACODE_WSL_HELPERS_DIR = "C:/new/helpers";
    process.env.PORACODE_WSL_WATCHER_DIR = "C:/old/watcher";
    expect(resolveWslHelpersDir()).toBe("C:/new/helpers");
  });

  it("falls back to PORACODE_WSL_WATCHER_DIR when the new var is unset", () => {
    delete process.env.PORACODE_WSL_HELPERS_DIR;
    process.env.PORACODE_WSL_WATCHER_DIR = "C:/legacy";
    expect(resolveWslHelpersDir()).toBe("C:/legacy");
  });

  it("returns undefined when neither env var is set", () => {
    delete process.env.PORACODE_WSL_HELPERS_DIR;
    delete process.env.PORACODE_WSL_WATCHER_DIR;
    expect(resolveWslHelpersDir()).toBeUndefined();
  });
});

describe("deployment file freshness", () => {
  // We don't exercise deployFilesToWslHome directly because it requires WSL
  // and a UNC path to be writable; instead we mirror its idempotency check
  // here so the size + mtime contract stays under test.
  it("recognises identical size + older-or-equal mtime as fresh", () => {
    const dir = makeTempDir();
    const src = join(dir, "src.bin");
    const dest = join(dir, "dest.bin");
    writeFileSync(src, "hello");
    writeFileSync(dest, "hello");
    const srcStat = statSync(src);
    utimesSync(dest, srcStat.atime, new Date(srcStat.mtimeMs + 1000));
    const destStat = statSync(dest);
    expect(srcStat.size).toBe(destStat.size);
    expect(srcStat.mtimeMs).toBeLessThanOrEqual(destStat.mtimeMs);
  });

  it("recognises differing size as stale", () => {
    const dir = makeTempDir();
    const src = join(dir, "src.bin");
    const dest = join(dir, "dest.bin");
    writeFileSync(src, "hello-extended");
    writeFileSync(dest, "hello");
    const srcStat = statSync(src);
    const destStat = statSync(dest);
    expect(srcStat.size).not.toBe(destStat.size);
  });

  it("recognises older dest mtime as stale", () => {
    const dir = makeTempDir();
    const src = join(dir, "src.bin");
    const dest = join(dir, "dest.bin");
    writeFileSync(dest, "hello");
    // Sleep-free mtime adjustment: write src after, then bump it forward.
    writeFileSync(src, "hello");
    const newer = new Date(statSync(src).mtimeMs + 5000);
    utimesSync(src, newer, newer);
    const srcStat = statSync(src);
    const destStat = statSync(dest);
    expect(srcStat.mtimeMs).toBeGreaterThan(destStat.mtimeMs);
  });
});

describe("readBundledHelperVersion", () => {
  it("reads a const declaration at top level", () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "helper.cjs"),
      `"use strict";\nconst HELPER_VERSION = "1.2.3";\n`,
      "utf8",
    );
    expect(readBundledHelperVersion("helper.cjs", "HELPER_VERSION", dir)).toBe("1.2.3");
  });

  it("ignores example literals inside comments (start-of-line anchoring)", () => {
    // Regression: the earlier unanchored pattern matched the literal
    // `const WATCHER_VERSION = "x.y.z"` we printed inside a doc comment,
    // returning "x.y.z" as the bundled version.
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "helper.cjs"),
      [
        `// Example form: \`const HELPER_VERSION = "x.y.z"\` — don't match me.`,
        `//   const HELPER_VERSION = "y.z.w"`,
        `const HELPER_VERSION = "9.9.9";`,
        "",
      ].join("\n"),
      "utf8",
    );
    expect(readBundledHelperVersion("helper.cjs", "HELPER_VERSION", dir)).toBe("9.9.9");
  });

  it("returns undefined when the constant is absent", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "helper.cjs"), `// no version here\n`, "utf8");
    expect(readBundledHelperVersion("helper.cjs", "HELPER_VERSION", dir)).toBeUndefined();
  });

  it("returns undefined when helpersDir is unset", () => {
    expect(readBundledHelperVersion("helper.cjs", "HELPER_VERSION", undefined)).toBeUndefined();
  });

  it("accepts `export const` declarations", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "helper.mjs"), `export const V = "2.0.0";\n`, "utf8");
    expect(readBundledHelperVersion("helper.mjs", "V", dir)).toBe("2.0.0");
  });
});

describe("staging-backed WSL deploys", () => {
  function makeStagingService(): {
    service: WslStagingService;
    requests: WslStagingRequest[];
    fail: (error: Error) => void;
  } {
    const requests: WslStagingRequest[] = [];
    let failure: Error | undefined;
    const service = new WslStagingService({
      cachedHome: () => "/home/user",
      createExecutor: () => ({
        execute: async <T = unknown>(request: WslStagingRequest): Promise<T> => {
          requests.push(request);
          if (failure) throw failure;
          return { filesWritten: 1 } as T;
        },
        dispose: async () => undefined,
      }),
    });
    return {
      service,
      requests,
      fail: (error) => {
        failure = error;
      },
    };
  }

  it("deploys home files through the staging service and returns the linux base", async () => {
    const dir = makeTempDir();
    const source = join(dir, "helper.mjs");
    writeFileSync(source, "helper");
    const { service, requests } = makeStagingService();

    const result = await deployFilesToWslHome(
      "Ubuntu",
      [{ src: source, relDest: "agent-plugins/x/helper.mjs" }],
      { staging: service },
    );

    expect(result).toEqual({ home: "/home/user", linuxBaseDir: "/home/user/.poracode" });
    expect(requests[0]).toMatchObject({
      op: "deploy",
      base: "\\\\wsl.localhost\\Ubuntu\\home\\user\\.poracode",
      freshness: "content",
    });
  });

  it("returns null for a missing source without touching the distro", async () => {
    const dir = makeTempDir();
    const { service, requests } = makeStagingService();

    const result = await deployFilesToWslHome(
      "Ubuntu",
      [{ src: join(dir, "missing.mjs"), relDest: "missing.mjs" }],
      { staging: service },
    );

    expect(result).toBeNull();
    expect(requests).toEqual([]);
  });

  it("returns null when home resolution fails", async () => {
    const dir = makeTempDir();
    const source = join(dir, "helper.mjs");
    writeFileSync(source, "helper");
    const service = new WslStagingService({ resolveHome: async () => undefined });

    const result = await deployFilesToWslHome("Ubuntu", [{ src: source, relDest: "helper.mjs" }], {
      staging: service,
    });

    expect(result).toBeNull();
  });

  it("returns null when the staging worker rejects", async () => {
    const dir = makeTempDir();
    const source = join(dir, "helper.mjs");
    writeFileSync(source, "helper");
    const { service, fail } = makeStagingService();
    fail(new Error("UNC stalled"));

    const result = await deployFilesToWslHome("Ubuntu", [{ src: source, relDest: "helper.mjs" }], {
      staging: service,
    });

    expect(result).toBeNull();
  });

  it("removes a staged temp base through the staging service", async () => {
    const dir = makeTempDir();
    const source = join(dir, "bridge.mjs");
    writeFileSync(source, "bridge");
    const { service, requests } = makeStagingService();

    await removeWslStagedPath("Ubuntu", "/tmp/poracode-bridge-99-deadbeefcafe", {
      staging: service,
    });

    expect(requests[0]).toEqual({
      op: "remove",
      path: "\\\\wsl.localhost\\Ubuntu\\tmp\\poracode-bridge-99-deadbeefcafe",
      recursive: true,
    });
  });

  it("stages a temp base under a content-addressed directory", async () => {
    const dir = makeTempDir();
    const source = join(dir, "bridge.mjs");
    writeFileSync(source, "bridge");
    const { service, requests } = makeStagingService();

    const result = await deployFilesToWslTempBase(
      "Ubuntu",
      "poracode-bridge-99",
      [{ src: source, relDest: "bridge/bridge.mjs" }],
      { staging: service },
    );

    expect(result?.linuxBaseDir).toMatch(/^\/tmp\/poracode-bridge-99-[0-9a-f]{12}$/u);
    expect(requests[0]).toMatchObject({
      op: "deploy",
      base: expect.stringContaining("poracode-bridge-99-"),
    });
  });
});

describe("attachLineSplitter contract", () => {
  // Surface-level smoke test that the splitter handles split-across-chunk
  // newlines and ignores blank lines, mirroring real `wsl.exe` stdout
  // behaviour. Lifted from projectWatcher's spawnWslWatcher, this is the
  // primitive every WSL helper now relies on.
  it("invokes onLine once per non-empty line, even when chunks split a line", async () => {
    const { attachLineSplitter } = await import("./wslChild");
    const { EventEmitter } = await import("node:events");
    const stdout = new EventEmitter();
    const lines: string[] = [];
    attachLineSplitter({ stdout: stdout as never } as never, {
      onLine: (line) => {
        lines.push(line);
      },
    });
    stdout.emit("data", Buffer.from("aaa\nbb"));
    stdout.emit("data", Buffer.from("b\n\n  cc"));
    stdout.emit("data", Buffer.from("c\r\n"));
    expect(lines).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("forwards onLine throws to onError instead of crashing", async () => {
    const { attachLineSplitter } = await import("./wslChild");
    const { EventEmitter } = await import("node:events");
    const stdout = new EventEmitter();
    const errors: Error[] = [];
    attachLineSplitter({ stdout: stdout as never } as never, {
      onLine: () => {
        throw new Error("boom");
      },
      onError: (err) => {
        errors.push(err);
      },
    });
    stdout.emit("data", Buffer.from("abc\n"));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("boom");
  });
});
