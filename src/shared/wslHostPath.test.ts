import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "./contracts";
import {
  getProjectFsPath,
  getWslLocationHostFsPath,
  toWslUncPath,
  wslDrvFsToWindowsPath,
  wslLinuxToHostFsPath,
} from "./wsl";

type WslLocation = Extract<ProjectLocation, { kind: "wsl" }>;

function wsl(linuxPath: string, distro = "Ubuntu"): WslLocation {
  return { kind: "wsl", distro, linuxPath, uncPath: toWslUncPath(distro, linuxPath) };
}

describe("wslDrvFsToWindowsPath", () => {
  it("maps /mnt/<letter> paths to native drive paths", () => {
    expect(wslDrvFsToWindowsPath("/mnt/c/Users/RUNNER~1/x y/grüße 日本語.txt")).toBe(
      "C:\\Users\\RUNNER~1\\x y\\grüße 日本語.txt",
    );
    expect(wslDrvFsToWindowsPath("/mnt/d/x")).toBe("D:\\x");
    expect(wslDrvFsToWindowsPath("/mnt/c")).toBe("C:\\");
    expect(wslDrvFsToWindowsPath("/mnt/c/")).toBe("C:\\");
  });

  it("rejects non-drive mounts and native paths", () => {
    expect(wslDrvFsToWindowsPath("/home/me/proj")).toBeNull();
    expect(wslDrvFsToWindowsPath("/mnt/wsl/shared")).toBeNull();
    expect(wslDrvFsToWindowsPath("/mnt/cc/x")).toBeNull();
    expect(wslDrvFsToWindowsPath("/mnt")).toBeNull();
    expect(wslDrvFsToWindowsPath("/tmp/mnt/c/x")).toBeNull();
  });

  it("honours a custom automount root", () => {
    expect(wslDrvFsToWindowsPath("/win/c/Users/me", "/win/")).toBe("C:\\Users\\me");
    expect(wslDrvFsToWindowsPath("/mnt/c/Users/me", "/win")).toBeNull();
  });
});

describe("host fs path derivation", () => {
  it("uses the native path for DrvFs projects even when a UNC loop path is persisted", () => {
    const persisted = wsl("/mnt/c/Users/me/proj");
    expect(persisted.uncPath).toBe("\\\\wsl.localhost\\Ubuntu\\mnt\\c\\Users\\me\\proj");
    expect(getWslLocationHostFsPath(persisted)).toBe("C:\\Users\\me\\proj");
    expect(getProjectFsPath(persisted)).toBe("C:\\Users\\me\\proj");
    expect(getProjectFsPath(wsl("/mnt/d/x"))).toBe("D:\\x");
  });

  it("keeps the UNC path for native WSL projects", () => {
    const native = wsl("/home/me/proj");
    expect(getProjectFsPath(native)).toBe(native.uncPath);
    expect(getWslLocationHostFsPath(wsl("/mnt/wsl/x"))).toBe(
      "\\\\wsl.localhost\\Ubuntu\\mnt\\wsl\\x",
    );
  });

  it("leaves windows and posix locations untouched", () => {
    expect(getProjectFsPath({ kind: "windows", path: "C:\\p" })).toBe("C:\\p");
    expect(getProjectFsPath({ kind: "posix", path: "/mnt/c/p" })).toBe("/mnt/c/p");
  });

  it("wslLinuxToHostFsPath picks drive or UNC by path", () => {
    expect(wslLinuxToHostFsPath("Debian", "/mnt/c/a")).toBe("C:\\a");
    expect(wslLinuxToHostFsPath("Debian", "/root/a")).toBe("\\\\wsl.localhost\\Debian\\root\\a");
  });
});
