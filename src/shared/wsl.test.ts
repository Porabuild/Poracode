import { describe, expect, it } from "vitest";
import { normalizeWslListOutput, parseWslUncPath, toWslUncPath } from "./wsl";

describe("wsl helpers", () => {
  it("normalizes WSL distro output that contains NUL characters", () => {
    expect(normalizeWslListOutput("U\u0000b\u0000u\u0000n\u0000t\u0000u\u0000\r\n\u0000")).toEqual([
      "Ubuntu",
    ]);
  });

  it("builds a UNC path for a WSL project", () => {
    expect(toWslUncPath("Ubuntu", "/home/demo/project")).toBe(
      "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
    );
  });

  it("parses a WSL UNC path back to distro and linuxPath", () => {
    expect(parseWslUncPath("\\\\wsl.localhost\\Ubuntu\\home\\demo\\project")).toEqual({
      distro: "Ubuntu",
      linuxPath: "/home/demo/project",
    });
  });

  it("parses a legacy wsl$ UNC path", () => {
    expect(parseWslUncPath("\\\\wsl$\\Debian\\home\\user\\code")).toEqual({
      distro: "Debian",
      linuxPath: "/home/user/code",
    });
  });

  it("returns null for a non-WSL path", () => {
    expect(parseWslUncPath("C:\\Users\\demo")).toBeNull();
  });

  it("parses a bare distro-root path to linuxPath '/'", () => {
    expect(parseWslUncPath("\\\\wsl.localhost\\Ubuntu")).toEqual({
      distro: "Ubuntu",
      linuxPath: "/",
    });
  });

  it("parses a distro-root path with a trailing separator to linuxPath '/'", () => {
    expect(parseWslUncPath("\\\\wsl.localhost\\Ubuntu\\")).toEqual({
      distro: "Ubuntu",
      linuxPath: "/",
    });
  });
});
