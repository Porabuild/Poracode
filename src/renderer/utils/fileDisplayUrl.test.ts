import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { setRemoteLocalImageResolver } from "@/shared/localImageDisplay";
import { resolveFileDisplayUrl } from "./fileDisplayUrl";

const windowsProject: ProjectLocation = { kind: "windows", path: "C:\\repo" };
const posixProject: ProjectLocation = { kind: "posix", path: "/home/me/repo" };
const wslProject: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/me/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
};

afterEach(() => {
  setRemoteLocalImageResolver(null);
});

describe("resolveFileDisplayUrl", () => {
  it("addresses a local project file through the local-file protocol", () => {
    expect(resolveFileDisplayUrl({ projectLocation: windowsProject, path: "img/a b.png" })).toBe(
      "poracode-local://local/C:/repo/img/a%20b.png",
    );
    expect(resolveFileDisplayUrl({ projectLocation: posixProject, path: "logo.png" })).toBe(
      "poracode-local://local/home/me/repo/logo.png",
    );
  });

  it("addresses WSL project files through the wsl.localhost share", () => {
    expect(resolveFileDisplayUrl({ projectLocation: wslProject, path: "logo.png" })).toBe(
      "poracode-local://local//wsl.localhost/Ubuntu/home/me/repo/logo.png",
    );
  });

  it("adds the version so a changed file reloads", () => {
    expect(
      resolveFileDisplayUrl({ projectLocation: posixProject, path: "logo.png", version: 42 }),
    ).toBe("poracode-local://local/home/me/repo/logo.png?v=42");
  });

  it("uses the installed resolver on mobile", () => {
    setRemoteLocalImageResolver(
      (url) => `https://desk/api/files/image?path=${encodeURIComponent(url)}&access_token=t`,
    );

    expect(
      resolveFileDisplayUrl({ projectLocation: posixProject, path: "logo.png", version: 7 }),
    ).toBe(
      `https://desk/api/files/image?path=${encodeURIComponent(
        "poracode-local://local/home/me/repo/logo.png",
      )}&access_token=t&v=7`,
    );
  });

  it("loads a remote-host project file from that host's image endpoint", () => {
    const remoteLocalImageUrl = vi.fn<(serverId: string, absolutePath: string) => string>(
      (serverId, absolutePath) => `https://${serverId}/img?path=${absolutePath}`,
    );

    const windowsUrl = resolveFileDisplayUrl({
      projectLocation: { ...windowsProject, remoteServerId: "host-1" },
      path: "logo.png",
      remoteLocalImageUrl,
    });
    const wslUrl = resolveFileDisplayUrl({
      projectLocation: { ...wslProject, remoteServerId: "host-1" },
      path: "logo.png",
      remoteLocalImageUrl,
    });

    expect(windowsUrl).toBe("https://host-1/img?path=C:/repo/logo.png");
    expect(wslUrl).toBe("https://host-1/img?path=//wsl.localhost/Ubuntu/home/me/repo/logo.png");
  });

  it("returns an empty URL when the remote host has no token", () => {
    expect(
      resolveFileDisplayUrl({
        projectLocation: { ...posixProject, remoteServerId: "host-1" },
        path: "logo.png",
        version: 1,
        remoteLocalImageUrl: () => "",
      }),
    ).toBe("");
  });
});
