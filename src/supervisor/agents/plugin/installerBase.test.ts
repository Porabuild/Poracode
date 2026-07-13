import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyPluginAssetFile,
  copyPluginAssetsIfStale,
  createPluginSourceResolver,
  ctxCacheKey,
  buildNativeHookCmdShellCommand,
  buildNativeHookCommandHead,
  buildNativeHookCommandHeads,
  isPluginAssetsFresh,
  isWslPluginContext,
  memoByCtx,
  parseExistingHooksJson,
  PLUGIN_ASSET_FILES,
  quoteHookCommandArg,
  readBundledPluginVersion,
  readPluginManifest,
  renderNativeHookPowerShellWrapper,
  renderNativeHookWrapper,
  warnIfPluginManifestMissing,
} from "./installerBase";

const tempDirs: string[] = [];

function makeTempDir(prefix = "poracode-installer-base-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("isWslPluginContext", () => {
  it("narrows to WSL context only when both envKind and wslDistro are set", () => {
    expect(isWslPluginContext({ envKind: "wsl", wslDistro: "Ubuntu" })).toBe(true);
    expect(isWslPluginContext({ envKind: "wsl" })).toBe(false);
    expect(isWslPluginContext({ envKind: "posix", wslDistro: "Ubuntu" })).toBe(false);
    expect(isWslPluginContext({ envKind: "windows" })).toBe(false);
    expect(isWslPluginContext(undefined)).toBe(false);
  });
});

describe("createPluginSourceResolver", () => {
  const ENV_KEY = "PORACODE_TEST_PLUGIN_SOURCE";

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("resolves and memoizes the override env path", () => {
    const sourceDir = makeTempDir();
    writeFileSync(join(sourceDir, "plugin.json"), '{"version":"1.2.3"}', "utf8");
    process.env[ENV_KEY] = sourceDir;
    const resolve = createPluginSourceResolver({
      kind: "test",
      sourceEnvVar: ENV_KEY,
      callerDir: makeTempDir(),
    });

    expect(resolve()).toBe(sourceDir);

    // Mutating env after first call must NOT affect subsequent resolutions.
    const otherDir = makeTempDir();
    writeFileSync(join(otherDir, "plugin.json"), '{"version":"9.9.9"}', "utf8");
    process.env[ENV_KEY] = otherDir;
    expect(resolve()).toBe(sourceDir);
  });

  it("throws when no candidate contains plugin.json", () => {
    const resolve = createPluginSourceResolver({
      kind: "test",
      sourceEnvVar: ENV_KEY,
      callerDir: makeTempDir(),
    });
    expect(() => resolve()).toThrow(/test plugin source dir not found/);
  });
});

describe("readPluginManifest + readBundledPluginVersion", () => {
  it("reads version from plugin.json", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "plugin.json"), '{"version":"4.5.6"}', "utf8");
    expect(readPluginManifest(dir).version).toBe("4.5.6");
  });

  it("returns 0.0.0 sentinel when manifest is missing or malformed", () => {
    const empty = makeTempDir();
    expect(readBundledPluginVersion(() => empty)).toBe("0.0.0");

    const bad = makeTempDir();
    writeFileSync(join(bad, "plugin.json"), "not-json", "utf8");
    expect(readBundledPluginVersion(() => bad)).toBe("0.0.0");

    const noVersion = makeTempDir();
    writeFileSync(join(noVersion, "plugin.json"), "{}", "utf8");
    expect(readBundledPluginVersion(() => noVersion)).toBe("0.0.0");
  });

  it("propagates resolver errors as 0.0.0", () => {
    expect(
      readBundledPluginVersion(() => {
        throw new Error("boom");
      }),
    ).toBe("0.0.0");
  });
});

describe("parseExistingHooksJson", () => {
  it("parses JSON with leading NUL padding", () => {
    const dir = makeTempDir();
    const hooksPath = join(dir, "hooks.json");
    writeFileSync(
      hooksPath,
      Buffer.concat([Buffer.alloc(64), Buffer.from('{"version":1}', "utf8")]),
    );

    expect(parseExistingHooksJson(hooksPath)).toEqual({ version: 1 });
  });

  it("treats zero-filled files as empty hooks documents", () => {
    const dir = makeTempDir();
    const hooksPath = join(dir, "hooks.json");
    writeFileSync(hooksPath, Buffer.alloc(64));

    expect(parseExistingHooksJson(hooksPath)).toEqual({});
  });

  it("parses UTF-16LE hooks files", () => {
    const dir = makeTempDir();
    const hooksPath = join(dir, "hooks.json");
    writeFileSync(hooksPath, Buffer.from('{"version":1}', "utf16le"));

    expect(parseExistingHooksJson(hooksPath)).toEqual({ version: 1 });
  });

  it("returns null for malformed hooks files", () => {
    const dir = makeTempDir();
    const hooksPath = join(dir, "hooks.json");
    writeFileSync(hooksPath, "not-json", "utf8");

    expect(parseExistingHooksJson(hooksPath)).toBeNull();
  });
});

describe("isPluginAssetsFresh + copyPluginAssetsIfStale", () => {
  function seedSource(): string {
    const sourceDir = makeTempDir("poracode-installer-base-src-");
    for (const file of PLUGIN_ASSET_FILES) {
      writeFileSync(join(sourceDir, file), `${file} v1`, "utf8");
    }
    return sourceDir;
  }

  it("reports stale when target is missing files", () => {
    const sourceDir = seedSource();
    const targetDir = makeTempDir();
    expect(isPluginAssetsFresh(sourceDir, targetDir)).toBe(false);
  });

  it("copies into the target dir when stale", () => {
    const sourceDir = seedSource();
    const targetDir = makeTempDir();
    copyPluginAssetsIfStale(sourceDir, targetDir);
    for (const file of PLUGIN_ASSET_FILES) {
      expect(readFileSync(join(targetDir, file), "utf8")).toBe(`${file} v1`);
    }
    expect(isPluginAssetsFresh(sourceDir, targetDir)).toBe(true);
  });

  it("skips copy when target is fresh by size+mtime", () => {
    const sourceDir = seedSource();
    const targetDir = makeTempDir();
    copyPluginAssetsIfStale(sourceDir, targetDir);

    // Mark targets as up-to-date (mtime >= source). copyFileSync on Windows
    // may not preserve mtime exactly, so explicitly bump targets forward.
    const future = new Date(Date.now() + 60_000);
    for (const file of PLUGIN_ASSET_FILES) {
      utimesSync(join(targetDir, file), future, future);
    }

    // Mutate target content but keep size — heuristic should still treat fresh.
    for (const file of PLUGIN_ASSET_FILES) {
      const original = readFileSync(join(sourceDir, file));
      const targetPath = join(targetDir, file);
      const tampered = Buffer.alloc(original.length, "X");
      writeFileSync(targetPath, tampered);
      utimesSync(targetPath, future, future);
    }

    expect(isPluginAssetsFresh(sourceDir, targetDir)).toBe(true);
    copyPluginAssetsIfStale(sourceDir, targetDir);

    // Tampered content remains because the heuristic considered it fresh.
    expect(readFileSync(join(targetDir, "plugin.json"), "utf8")).not.toBe("plugin.json v1");
  });

  it("re-copies when source mtime is newer than target", () => {
    const sourceDir = seedSource();
    const targetDir = makeTempDir();
    copyPluginAssetsIfStale(sourceDir, targetDir);

    // Backdate the targets so the source looks newer.
    const past = new Date(Date.now() - 60_000);
    for (const file of PLUGIN_ASSET_FILES) {
      utimesSync(join(targetDir, file), past, past);
    }
    // Bump source content to a different size + mtime.
    for (const file of PLUGIN_ASSET_FILES) {
      writeFileSync(join(sourceDir, file), `${file} v2-larger`, "utf8");
    }

    expect(isPluginAssetsFresh(sourceDir, targetDir)).toBe(false);
    copyPluginAssetsIfStale(sourceDir, targetDir);
    expect(readFileSync(join(targetDir, "plugin.json"), "utf8")).toBe("plugin.json v2-larger");
  });

  it("copyPluginAssetFile creates intermediate directories", () => {
    const sourceDir = makeTempDir();
    writeFileSync(join(sourceDir, "plugin.json"), "x", "utf8");
    const targetDir = makeTempDir();
    const nested = join(targetDir, "a", "b", "c", "plugin.json");
    copyPluginAssetFile(join(sourceDir, "plugin.json"), nested);
    expect(existsSync(nested)).toBe(true);
    expect(readFileSync(nested, "utf8")).toBe("x");
    // statSync verifies the file is real, not a broken symlink.
    expect(statSync(nested).isFile()).toBe(true);
  });
});

describe("quoteHookCommandArg", () => {
  it("uses POSIX single-quote escaping for wsl target on any platform", () => {
    expect(quoteHookCommandArg("/home/u/forward.mjs", "wsl")).toBe("'/home/u/forward.mjs'");
    expect(quoteHookCommandArg("a'b", "wsl")).toBe("'a'\\''b'");
  });

  it("matches platform when target is native", () => {
    const expected =
      process.platform === "win32" ? '"C:\\Users\\u\\fw.mjs"' : "'C:\\Users\\u\\fw.mjs'";
    expect(quoteHookCommandArg("C:\\Users\\u\\fw.mjs", "native")).toBe(expected);
  });

  it("escapes embedded special chars per platform on native", () => {
    const expected = process.platform === "win32" ? '"a\\"b"' : "'a\"b'";
    expect(quoteHookCommandArg('a"b', "native")).toBe(expected);
  });
});

describe("renderNativeHookWrapper", () => {
  it("emits ELECTRON_RUN_AS_NODE fallback when nodePath is not provided", () => {
    const body = renderNativeHookWrapper({ electronPath: "/path/to/electron" });
    expect(body).toContain("ELECTRON_RUN_AS_NODE=1");
    const expectedQuoted =
      process.platform === "win32" ? '"/path/to/electron"' : "'/path/to/electron'";
    expect(body).toContain(expectedQuoted);
  });

  it("emits bare-node exec when nodePath is provided (no Electron-as-Node)", () => {
    const body = renderNativeHookWrapper({
      electronPath: "/path/to/electron",
      nodePath: "/usr/local/bin/node",
    });
    expect(body).not.toContain("ELECTRON_RUN_AS_NODE");
    expect(body).not.toContain("electron");
    const expectedQuoted =
      process.platform === "win32" ? '"/usr/local/bin/node"' : "'/usr/local/bin/node'";
    expect(body).toContain(expectedQuoted);
  });

  it("escapes embedded quotes safely on both shapes", () => {
    const tricky = process.platform === "win32" ? 'C:\\a"b\\node.exe' : "/p/a'b/node";
    const body = renderNativeHookWrapper({
      electronPath: "/dummy/electron",
      nodePath: tricky,
    });
    // win32: cmd.exe doubles `"` → `a""b`. POSIX: sh `'` becomes `'\''`.
    const expectedFragment =
      process.platform === "win32" ? '"C:\\a""b\\node.exe"' : "'/p/a'\\''b/node'";
    expect(body).toContain(expectedFragment);
  });

  it("prefers PowerShell 7, then Windows PowerShell, before cmd fallback on Windows", () => {
    const body = renderNativeHookWrapper({ electronPath: "C:\\Poracode\\Poracode.exe" });
    if (process.platform !== "win32") {
      return;
    }
    expect(body.indexOf("where pwsh.exe")).toBeLessThan(body.indexOf("where powershell.exe"));
    expect(body.indexOf("where powershell.exe")).toBeLessThan(
      body.indexOf("set ELECTRON_RUN_AS_NODE=1"),
    );
    expect(body).toContain(
      'pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0poracode-hook.ps1" %*',
    );
    expect(body).toContain(
      'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0poracode-hook.ps1" %*',
    );
  });
});

describe("renderNativeHookPowerShellWrapper", () => {
  it("passes hook args through to forward.mjs", () => {
    const body = renderNativeHookPowerShellWrapper({
      electronPath: "C:\\Poracode\\Poracode.exe",
    });
    expect(body).toContain("$forward = Join-Path $PSScriptRoot 'forward.mjs'");
    expect(body).toContain("$forward @args");
    expect(body).toContain("$env:ELECTRON_RUN_AS_NODE = '1'");
  });

  it("escapes single quotes in the node path", () => {
    const body = renderNativeHookPowerShellWrapper({
      electronPath: "C:\\Poracode\\Poracode.exe",
      nodePath: "C:\\a'b\\node.exe",
    });
    expect(body).toContain("& 'C:\\a''b\\node.exe' $forward @args");
    expect(body).not.toContain("ELECTRON_RUN_AS_NODE");
  });
});

describe("buildNativeHookCommandHead", () => {
  const missingShell = () => undefined;

  it("prefers PowerShell 7 for native Windows hook wrappers", () => {
    const commandHead = buildNativeHookCommandHead("C:\\Users\\u\\poracode-hook.cmd", (name) =>
      name === "pwsh.exe" ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe" : undefined,
    );
    const expected =
      process.platform === "win32"
        ? 'pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\Users\\u\\poracode-hook.ps1"'
        : "'C:\\Users\\u\\poracode-hook.cmd'";
    expect(commandHead).toBe(expected);
  });

  it("falls back to Windows PowerShell when PowerShell 7 is missing", () => {
    const commandHead = buildNativeHookCommandHead("C:\\Users\\u\\poracode-hook.cmd", (name) =>
      name === "powershell.exe"
        ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
        : undefined,
    );
    const expected =
      process.platform === "win32"
        ? 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\Users\\u\\poracode-hook.ps1"'
        : "'C:\\Users\\u\\poracode-hook.cmd'";
    expect(commandHead).toBe(expected);
  });

  it("uses cmd.exe only when PowerShell is unavailable", () => {
    const commandHead = buildNativeHookCommandHead("C:\\Users\\u\\fw.cmd", missingShell);
    const expected =
      process.platform === "win32"
        ? 'cmd.exe /d /s /c call "C:\\Users\\u\\fw.cmd"'
        : "'C:\\Users\\u\\fw.cmd'";
    expect(commandHead).toBe(expected);
  });

  it("escapes embedded quotes for the active native shell", () => {
    const commandHead = buildNativeHookCommandHead('C:\\Users\\a"b\\poracode-hook.cmd', (name) =>
      name === "pwsh.exe" ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe" : undefined,
    );
    const expected =
      process.platform === "win32"
        ? 'pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\Users\\a\\"b\\poracode-hook.ps1"'
        : "'C:\\Users\\a\"b\\poracode-hook.cmd'";
    expect(commandHead).toBe(expected);
  });
});

describe("buildNativeHookCmdShellCommand", () => {
  const isWindows = process.platform === "win32";
  it.skipIf(!isWindows)(
    "returns the cmd.exe-routed wrapper invocation on Windows (pwsh-free)",
    () => {
      const command = buildNativeHookCmdShellCommand("C:\\Users\\u\\poracode-hook.cmd");
      expect(command).toBe('cmd.exe /d /s /c call "C:\\Users\\u\\poracode-hook.cmd"');
      expect(command).not.toMatch(/pwsh|powershell/i);
    },
  );

  it.skipIf(isWindows)("returns a single-quoted wrapper path on POSIX", () => {
    const command = buildNativeHookCmdShellCommand("/home/u/poracode-hook.sh");
    expect(command).toBe("'/home/u/poracode-hook.sh'");
  });
});

describe("buildNativeHookCommandHeads", () => {
  it("centralizes generic, bash, and PowerShell native command shapes", () => {
    const heads = buildNativeHookCommandHeads("C:\\Users\\u\\poracode-hook.cmd", (name) =>
      name === "pwsh.exe" ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe" : undefined,
    );

    const expected =
      process.platform === "win32"
        ? {
            command:
              'pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\Users\\u\\poracode-hook.ps1"',
            bashCommand: "'C:\\Users\\u\\poracode-hook.cmd'",
            powershellCommand: "& 'C:\\Users\\u\\poracode-hook.ps1'",
          }
        : {
            command: "'C:\\Users\\u\\poracode-hook.cmd'",
            bashCommand: "'C:\\Users\\u\\poracode-hook.cmd'",
          };
    expect(heads).toEqual(expected);
  });
});

describe("warnIfPluginManifestMissing", () => {
  let originalWarn: typeof console.warn;
  let calls: unknown[][];

  beforeEach(() => {
    calls = [];
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      calls.push(args);
    };
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  it("emits a warning for the 0.0.0 sentinel and stays silent otherwise", () => {
    warnIfPluginManifestMissing("test", "1.2.3");
    expect(calls).toHaveLength(0);

    warnIfPluginManifestMissing("test", "0.0.0");
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.[0])).toContain("[test]");
  });

  it("appends the dev hint when provided", () => {
    warnIfPluginManifestMissing("test", "0.0.0", "Expected at src/...");
    expect(String(calls[0]?.[0])).toContain("Expected at src/...");
  });
});

describe("memoByCtx", () => {
  it("calls the underlying fn once per unique key", () => {
    let calls = 0;
    const memo = memoByCtx(
      (n: number) => {
        calls += 1;
        return n * 2;
      },
      (n) => String(n),
    );

    expect(memo.call(3)).toBe(6);
    expect(memo.call(3)).toBe(6);
    expect(calls).toBe(1);

    expect(memo.call(4)).toBe(8);
    expect(calls).toBe(2);

    expect(memo.call(3)).toBe(6);
    expect(calls).toBe(2);
  });

  it("returns the same reference across calls (cached object identity)", () => {
    const memo = memoByCtx((n: number) => ({ value: n * 2 }), String);
    const a = memo.call(3);
    const b = memo.call(3);
    expect(a).toBe(b);
  });

  it("invalidate clears the entry so the next call recomputes", () => {
    let calls = 0;
    const memo = memoByCtx((n: number) => {
      calls += 1;
      return n;
    }, String);
    memo.call(1);
    memo.call(1);
    expect(calls).toBe(1);
    memo.invalidate(1);
    memo.call(1);
    expect(calls).toBe(2);
  });

  it("clear empties the cache", () => {
    let calls = 0;
    const memo = memoByCtx((n: number) => {
      calls += 1;
      return n;
    }, String);
    memo.call(1);
    memo.call(2);
    expect(calls).toBe(2);
    memo.clear();
    memo.call(1);
    memo.call(2);
    expect(calls).toBe(4);
  });
});

describe("ctxCacheKey", () => {
  it("produces a stable string per (envKind, wslDistro, baseDir) tuple", () => {
    expect(ctxCacheKey({ envKind: "windows" })).toBe("windows||");
    expect(ctxCacheKey({ envKind: "windows", baseDir: "/tmp/a" })).toBe("windows||/tmp/a");
    expect(ctxCacheKey({ envKind: "wsl", wslDistro: "Ubuntu" })).toBe("wsl|Ubuntu|");
    expect(ctxCacheKey(undefined)).toBe("no-ctx");
  });
});
