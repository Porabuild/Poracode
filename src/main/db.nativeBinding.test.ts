import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { resolveBetterSqliteNativeBindingOptions } from "./db";

describe("resolveBetterSqliteNativeBindingOptions", () => {
  it("uses an explicit better-sqlite3 native binding path when it exists", () => {
    expect(
      resolveBetterSqliteNativeBindingOptions(
        { PORACODE_BETTER_SQLITE3_NATIVE_BINDING: "/native/better_sqlite3.node" },
        "/app",
        (path) => path === "/native/better_sqlite3.node",
      ),
    ).toEqual({ nativeBinding: "/native/better_sqlite3.node" });
  });

  it("throws a named error when the explicit binding path does not exist", () => {
    expect(() =>
      resolveBetterSqliteNativeBindingOptions(
        { PORACODE_BETTER_SQLITE3_NATIVE_BINDING: "/typo/better_sqlite3.node" },
        "/app",
        () => false,
      ),
    ).toThrow(/PORACODE_BETTER_SQLITE3_NATIVE_BINDING/);
  });

  it("uses the cwd-relative prepared binding for headless server runs", () => {
    const cwd = "/app";
    const prepared = join(cwd, "dist", "server-native", "better_sqlite3.node");
    const exists = (path: string) => path === prepared;

    expect(
      resolveBetterSqliteNativeBindingOptions(
        { PORACODE_HEADLESS_SERVER: "1" },
        cwd,
        exists,
        "/anything/dist/main",
      ),
    ).toEqual({ nativeBinding: prepared });
    expect(
      resolveBetterSqliteNativeBindingOptions({}, cwd, exists, "/anything/dist/main"),
    ).toBeUndefined();
  });

  it("probes the module-relative server-native binding when cwd-relative is missing", () => {
    // Launched from an arbitrary dir (systemd/cron): only the bundle-relative
    // path (dist/main/../server-native) resolves.
    const moduleDir = join("/opt", "poracode", "dist", "main");
    const bundleRelative = join(moduleDir, "..", "server-native", "better_sqlite3.node");
    const exists = (path: string) => path === bundleRelative;

    expect(
      resolveBetterSqliteNativeBindingOptions(
        { PORACODE_HEADLESS_SERVER: "1" },
        "/some/other/dir",
        exists,
        moduleDir,
      ),
    ).toEqual({ nativeBinding: bundleRelative });
  });

  it("prefers the cwd-relative binding when both exist", () => {
    const cwd = "/app";
    const cwdRelative = join(cwd, "dist", "server-native", "better_sqlite3.node");
    const moduleDir = join("/opt", "poracode", "dist", "main");

    expect(
      resolveBetterSqliteNativeBindingOptions(
        { PORACODE_HEADLESS_SERVER: "1" },
        cwd,
        () => true,
        moduleDir,
      ),
    ).toEqual({ nativeBinding: cwdRelative });
  });

  it("falls back to the package default when no prepared binding exists", () => {
    expect(
      resolveBetterSqliteNativeBindingOptions(
        { PORACODE_HEADLESS_SERVER: "1" },
        "/app",
        () => false,
        "/anything/dist/main",
      ),
    ).toBeUndefined();
  });

  it("returns undefined for non-headless runs with no explicit binding", () => {
    expect(
      resolveBetterSqliteNativeBindingOptions({}, "/app", () => true, "/anything/dist/main"),
    ).toBeUndefined();
  });
});
