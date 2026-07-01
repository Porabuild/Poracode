import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { resolveBetterSqliteNativeBindingOptions } from "./db";

describe("resolveBetterSqliteNativeBindingOptions", () => {
  it("uses an explicit better-sqlite3 native binding path", () => {
    expect(
      resolveBetterSqliteNativeBindingOptions({
        LIGHTCODE_BETTER_SQLITE3_NATIVE_BINDING: "/native/better_sqlite3.node",
      }),
    ).toEqual({ nativeBinding: "/native/better_sqlite3.node" });
  });

  it("uses the prepared server-native binding only for headless server runs", () => {
    const cwd = "/app";
    const prepared = join(cwd, "dist", "server-native", "better_sqlite3.node");
    const exists = (path: string) => path === prepared;

    expect(
      resolveBetterSqliteNativeBindingOptions({ LIGHTCODE_HEADLESS_SERVER: "1" }, cwd, exists),
    ).toEqual({ nativeBinding: prepared });
    expect(resolveBetterSqliteNativeBindingOptions({}, cwd, exists)).toBeUndefined();
  });

  it("falls back to the package default when no prepared binding exists", () => {
    expect(
      resolveBetterSqliteNativeBindingOptions(
        { LIGHTCODE_HEADLESS_SERVER: "1" },
        "/app",
        () => false,
      ),
    ).toBeUndefined();
  });
});
