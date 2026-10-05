import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { toLocalFileUrl } from "@/shared/promptContent";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import { createMarkdownLocalImageAuthority } from "./markdownLocalImageAuthority";

const readiness: RemoteImageReadiness = {
  resolveRef: () => "",
  subscribeRef: () => () => undefined,
  requestRef: () => undefined,
  resolvePath: () => "",
  subscribePath: () => () => undefined,
  requestPath: () => undefined,
};

describe("Markdown local-image authority", () => {
  it.each<[ProjectLocation | undefined, string, string]>([
    [{ kind: "posix", path: "/work" }, "/tmp/screen shot%25.png", "/tmp/screen shot%25.png"],
    [{ kind: "windows", path: "C:\\work" }, "C:\\shots\\image%25.png", "C:/shots/image%25.png"],
    [
      { kind: "windows", path: "C:\\work" },
      "\\\\server\\share\\image.png",
      "//server/share/image.png",
    ],
    [
      { kind: "wsl", distro: "Fixture", linuxPath: "/work", uncPath: "\\\\wsl$\\Fixture\\work" },
      "/home/user/image.png",
      "/home/user/image.png",
    ],
    [undefined, "/home/image.png", "/home/image.png"],
  ])(
    "shares one existing filesystem decoder for resolver and readiness: %j",
    (projectLocation, path, expected) => {
      const resolvePath = vi.fn<(path: string) => string>(() => "blob:owned");
      const actions = createMarkdownLocalImageAuthority({
        projectLocation,
        isManagedThread: false,
        remote: { available: true, resolvePath, readiness },
      });
      const url = toLocalFileUrl(path);
      expect(actions.markdownLocalImageReadiness?.readiness).toBe(readiness);
      expect(actions.markdownLocalImageReadiness?.pathForUrl(url)).toBe(expected);
      expect(actions.remoteLocalImageUrl?.(url)).toBe("blob:owned");
      expect(resolvePath).toHaveBeenCalledExactlyOnceWith(expected);
    },
  );

  it("rejects an unavailable remote owner before considering the managed host", () => {
    const resolvePath = vi.fn<(path: string) => string>(() => "blob:wrong-owner");
    const actions = createMarkdownLocalImageAuthority({
      isManagedThread: true,
      remote: { available: false, resolvePath, readiness },
    });
    expect(actions.remoteLocalImageUrl?.(toLocalFileUrl("/tmp/image.png"))).toBe("");
    expect(actions.markdownLocalImageReadiness).toBeUndefined();
    expect(resolvePath).not.toHaveBeenCalled();
  });

  it("keeps managed filesystem images native and standalone callers unbound", () => {
    const url = toLocalFileUrl("/tmp/image.png");
    const managed = createMarkdownLocalImageAuthority({ isManagedThread: true });
    expect(managed.remoteLocalImageUrl?.(url)).toBe(url);
    expect(managed.markdownLocalImageReadiness).toBeUndefined();
    expect(createMarkdownLocalImageAuthority({ isManagedThread: false })).toEqual({});
  });

  it("keeps invalid encoded paths empty under an explicit remote owner", () => {
    const resolvePath = vi.fn<(path: string) => string>(() => "blob:owned");
    const actions = createMarkdownLocalImageAuthority({
      isManagedThread: false,
      remote: { available: true, resolvePath, readiness },
    });
    const invalid = "poracode-local://local/tmp/%ZZ.png";
    expect(actions.markdownLocalImageReadiness?.pathForUrl(invalid)).toBeUndefined();
    expect(actions.remoteLocalImageUrl?.(invalid)).toBe("");
    expect(resolvePath).not.toHaveBeenCalled();
  });
});
