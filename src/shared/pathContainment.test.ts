import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { relativePathInside } from "./pathContainment";

describe("relativePathInside", () => {
  it("rejects Windows cross-drive and sibling escapes", () => {
    expect(relativePathInside("C:\\profile", "D:\\outside\\Cookies", win32)).toBeUndefined();
    expect(relativePathInside("C:\\profile", "C:\\other\\Cookies", win32)).toBeUndefined();
    expect(relativePathInside("C:\\profile", "C:\\profile\\Network\\Cookies", win32)).toBe(
      "Network\\Cookies",
    );
  });

  it("requires a strict descendant on POSIX", () => {
    expect(relativePathInside("/profile", "/profile", posix)).toBeUndefined();
    expect(relativePathInside("/profile", "/profile-other/Cookies", posix)).toBeUndefined();
    expect(relativePathInside("/profile", "/profile/Network/Cookies", posix)).toBe(
      "Network/Cookies",
    );
  });
});
