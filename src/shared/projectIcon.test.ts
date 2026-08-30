import { describe, expect, it } from "vitest";
import {
  formatFileProjectIcon,
  formatLucideProjectIcon,
  parseProjectIcon,
  projectSupportsFileIcons,
  resolveProjectIconPath,
} from "./projectIcon";

describe("parseProjectIcon", () => {
  it("parses each supported icon form", () => {
    expect(parseProjectIcon(undefined)).toBeUndefined();
    expect(parseProjectIcon("auto")).toEqual({ kind: "auto" });
    expect(parseProjectIcon("lucide:rocket")).toEqual({ kind: "lucide", name: "rocket" });
    expect(parseProjectIcon("lucide:rocket:red")).toEqual({
      kind: "lucide",
      name: "rocket",
      color: "red",
    });
    // A custom colour rides in the same slot as its hex digits.
    expect(parseProjectIcon("lucide:rocket:5f6cd9")).toEqual({
      kind: "lucide",
      name: "rocket",
      color: "5f6cd9",
    });
    expect(parseProjectIcon("file:public/favicon.png")).toEqual({
      kind: "file",
      path: "public/favicon.png",
    });
  });

  it("rejects malformed values", () => {
    expect(parseProjectIcon("")).toBeUndefined();
    expect(parseProjectIcon("lucide:")).toBeUndefined();
    expect(parseProjectIcon("file:")).toBeUndefined();
    expect(parseProjectIcon("emoji:rocket")).toBeUndefined();
    // Glyph names and colour ids are catalog tokens, so anything else is junk.
    expect(parseProjectIcon("lucide:Rocket")).toBeUndefined();
    expect(parseProjectIcon("lucide:rocket:RED")).toBeUndefined();
    expect(parseProjectIcon("lucide:rocket:red:extra")).toBeUndefined();
    expect(parseProjectIcon("lucide:rocket:")).toBeUndefined();
    expect(parseProjectIcon("file:a\0b")).toBeUndefined();
  });

  it("rejects file paths that are not project-relative", () => {
    // Absolute roots of every flavor.
    expect(parseProjectIcon("file:/etc/passwd")).toBeUndefined();
    expect(parseProjectIcon("file:C:/Windows/system32.dll")).toBeUndefined();
    expect(parseProjectIcon("file://server/share/icon.png")).toBeUndefined();
    expect(parseProjectIcon("file:\\\\wsl.localhost\\Ubuntu\\etc\\passwd")).toBeUndefined();
    // Traversal segments can never be legitimate for a project icon.
    expect(parseProjectIcon("file:../secret.png")).toBeUndefined();
    expect(parseProjectIcon("file:sub/../../secret.png")).toBeUndefined();
    expect(parseProjectIcon("file:..\\..\\secret.png")).toBeUndefined();
    // Stored paths are canonical forward-slash; backslashes are crafted values.
    expect(parseProjectIcon("file:public\\favicon.png")).toBeUndefined();
    // Empty segments (double or trailing slashes) are rejected too.
    expect(parseProjectIcon("file:public//favicon.png")).toBeUndefined();
    expect(parseProjectIcon("file:logo.png/")).toBeUndefined();
  });
});

describe("icon value formatters", () => {
  it("produces values parseProjectIcon accepts", () => {
    expect(parseProjectIcon(formatLucideProjectIcon("folder-git"))).toEqual({
      kind: "lucide",
      name: "folder-git",
    });
    expect(parseProjectIcon(formatFileProjectIcon("logo.svg"))).toEqual({
      kind: "file",
      path: "logo.svg",
    });
  });
});

describe("projectSupportsFileIcons", () => {
  it("is false for projects mirrored from another machine", () => {
    const localLocation = { kind: "windows" as const, path: "C:/repo" };
    expect(projectSupportsFileIcons({ location: localLocation })).toBe(true);
    expect(projectSupportsFileIcons({ remoteServerId: "desktop-1", location: localLocation })).toBe(
      false,
    );
    expect(
      projectSupportsFileIcons({
        location: { ...localLocation, remoteServerId: "desktop-1" },
      }),
    ).toBe(false);
  });
});

describe("resolveProjectIconPath", () => {
  it("joins relative paths with forward slashes for the local-file URL", () => {
    expect(resolveProjectIconPath("E:/work/app", "public/favicon.ico")).toBe(
      "E:/work/app/public/favicon.ico",
    );
    expect(resolveProjectIconPath("E:\\work\\app", "logo.svg")).toBe("E:\\work\\app/logo.svg");
    expect(resolveProjectIconPath("\\\\wsl.localhost\\Ubuntu\\home\\me\\app", "icon.png")).toBe(
      "\\\\wsl.localhost\\Ubuntu\\home\\me\\app/icon.png",
    );
    expect(resolveProjectIconPath("/home/me/app", "assets/logo.png")).toBe(
      "/home/me/app/assets/logo.png",
    );
  });

  it("returns null for paths that could escape the project root", () => {
    expect(resolveProjectIconPath("E:/work/app", "../secret.png")).toBeNull();
    expect(resolveProjectIconPath("E:/work/app", "sub/../../secret.png")).toBeNull();
    expect(resolveProjectIconPath("E:/work/app", "")).toBeNull();
    expect(resolveProjectIconPath("E:/work/app", "public//favicon.png")).toBeNull();
  });
});

describe("formatLucideProjectIcon", () => {
  it("round-trips a glyph with and without a colour", () => {
    expect(formatLucideProjectIcon("rocket")).toBe("lucide:rocket");
    expect(formatLucideProjectIcon("rocket", "red")).toBe("lucide:rocket:red");
    expect(parseProjectIcon(formatLucideProjectIcon("folder-git", "blue"))).toEqual({
      kind: "lucide",
      name: "folder-git",
      color: "blue",
    });
  });
});
