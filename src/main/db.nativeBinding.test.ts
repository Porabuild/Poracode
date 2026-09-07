import { describe, expect, it, vi } from "vitest";
import { resolveBetterSqliteNativeBindingOptions } from "./db";

describe("resolveBetterSqliteNativeBindingOptions", () => {
  it("uses an explicit better-sqlite3 native binding path when it exists", () => {
    expect(
      resolveBetterSqliteNativeBindingOptions(
        { PORACODE_BETTER_SQLITE3_NATIVE_BINDING: "/native/better_sqlite3.node" },
        (path) => path === "/native/better_sqlite3.node",
      ),
    ).toEqual({ nativeBinding: "/native/better_sqlite3.node" });
  });

  it("throws a named error when the explicit binding path does not exist", () => {
    expect(() =>
      resolveBetterSqliteNativeBindingOptions(
        { PORACODE_BETTER_SQLITE3_NATIVE_BINDING: "/typo/better_sqlite3.node" },
        () => false,
      ),
    ).toThrow(/PORACODE_BETTER_SQLITE3_NATIVE_BINDING/);
  });

  it("ignores previous-generation server-native artifacts in headless runs", () => {
    const exists = vi.fn<(path: string) => boolean>(() => true);
    expect(
      resolveBetterSqliteNativeBindingOptions({ PORACODE_HEADLESS_SERVER: "1" }, exists),
    ).toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it("uses the package default for desktop runs", () => {
    expect(resolveBetterSqliteNativeBindingOptions({})).toBeUndefined();
  });
});
