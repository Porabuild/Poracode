import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { resolveAcpReadableHostFsPath } from "./sessionPaths";

function wslHome(): ProjectLocation {
  return {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/u",
    uncPath: toWslUncPath("Ubuntu", "/home/u"),
  };
}

describe("resolveAcpReadableHostFsPath outside a WSL project", () => {
  it("maps DrvFs automount paths to the native drive path, not the refused UNC loop", () => {
    expect(resolveAcpReadableHostFsPath(wslHome(), "/mnt/c/Users/me/shot.png")).toBe(
      "C:\\Users\\me\\shot.png",
    );
  });

  it("keeps the UNC path for native distro paths", () => {
    expect(resolveAcpReadableHostFsPath(wslHome(), "/opt/tool/file.txt")).toBe(
      "\\\\wsl.localhost\\Ubuntu\\opt\\tool\\file.txt",
    );
  });
});
