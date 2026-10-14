import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const windowsProjectLocationInWslDistro = vi.hoisted(() =>
  vi
    .fn<
      (
        location: Extract<ProjectLocation, { kind: "windows" }>,
        distro: string,
        signal?: AbortSignal,
      ) => Promise<Extract<ProjectLocation, { kind: "wsl" }>>
    >()
    .mockResolvedValue({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/mnt/c/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\repo",
    }),
);

vi.mock("../../wsl/projectLocation", () => ({
  windowsProjectLocationInWslDistro,
}));

import { resolveAgentProjectLocation } from "./executionEnvironment";

afterEach(() => vi.restoreAllMocks());
beforeEach(() => vi.clearAllMocks());

describe("persisted WSL execution-environment pin", () => {
  it("honors a persisted distro pin for a Windows project", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const location = { kind: "windows", path: "C:\\repo" } as const;

    await expect(
      resolveAgentProjectLocation(location, { kind: "wsl", distro: "Ubuntu" }),
    ).resolves.toMatchObject({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/mnt/c/repo",
    });
    expect(windowsProjectLocationInWslDistro).toHaveBeenCalledWith(location, "Ubuntu", undefined);
  });

  it("forwards cancellation when resolving a pinned distro", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const location = { kind: "windows", path: "C:\\repo" } as const;
    const signal = new AbortController().signal;

    await resolveAgentProjectLocation(location, { kind: "wsl", distro: "Debian" }, signal);

    expect(windowsProjectLocationInWslDistro).toHaveBeenCalledWith(location, "Debian", signal);
  });

  it("leaves native Windows projects without a pin on the host", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const location = { kind: "windows", path: "C:\\repo" } as const;

    await expect(resolveAgentProjectLocation(location)).resolves.toBe(location);
    expect(windowsProjectLocationInWslDistro).not.toHaveBeenCalled();
  });

  it("leaves non-Windows platforms and locations unchanged", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    const windowsLocation = { kind: "windows", path: "C:\\repo" } as const;
    const wslLocation = {
      kind: "wsl",
      distro: "Debian",
      linuxPath: "/mnt/c/repo",
      uncPath: "\\\\wsl.localhost\\Debian\\mnt\\c\\repo",
    } as const;

    await expect(
      resolveAgentProjectLocation(windowsLocation, { kind: "wsl", distro: "Debian" }),
    ).resolves.toBe(windowsLocation);
    await expect(
      resolveAgentProjectLocation(wslLocation, { kind: "wsl", distro: "Debian" }),
    ).resolves.toBe(wslLocation);
    expect(windowsProjectLocationInWslDistro).not.toHaveBeenCalled();
  });
});
