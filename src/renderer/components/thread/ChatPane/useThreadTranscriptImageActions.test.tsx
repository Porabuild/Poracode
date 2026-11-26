import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { toLocalFileUrl } from "@/shared/promptContent";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import type { RemoteImageRefValue } from "@/shared/remote";
import type { ThreadImageAuthority } from "../threadImageAuthority";
import { useThreadTranscriptImageActions } from "./useThreadTranscriptImageActions";

const environment = vi.hoisted(() => ({
  remoteSession: false,
  localHost: true,
  managedRoot: false,
  authority: null as ThreadImageAuthority | null,
}));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isRemoteSession: () => environment.remoteSession,
}));

vi.mock("@/renderer/state/hostLocality", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/state/hostLocality")>()),
  hostRunsOnThisMachine: () => environment.localHost,
}));

vi.mock("@/renderer/state/managedRootCatalog/rootCatalogCommands", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/renderer/state/managedRootCatalog/rootCatalogCommands")
  >()),
  managedRootOwner: () => (environment.managedRoot ? { kind: "managed-root" } : undefined),
}));

vi.mock("../threadImageAuthority", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../threadImageAuthority")>()),
  useThreadImageAuthority: () => environment.authority,
}));

const readiness: RemoteImageReadiness = {
  resolveRef: () => "",
  subscribeRef: () => () => undefined,
  requestRef: () => undefined,
  resolvePath: () => "",
  subscribePath: () => () => undefined,
  requestPath: () => undefined,
};

function authority(overrides: Partial<ThreadImageAuthority> = {}): ThreadImageAuthority {
  return {
    kind: "paired",
    available: true,
    refUrl: (ref: RemoteImageRefValue) => `ref:${ref.itemId}`,
    localImageUrl: (path: string) => `local:${path}`,
    readiness,
    custody: null,
    ...overrides,
  };
}

const ref = {
  threadId: "thread-1",
  itemId: "image-1",
  path: ["result", "content", 0, "data"],
  mime: "image/png",
  bytes: 80_000,
} satisfies RemoteImageRefValue;

beforeEach(() => {
  environment.remoteSession = false;
  environment.localHost = true;
  environment.managedRoot = false;
  environment.authority = authority();
});

describe("useThreadTranscriptImageActions", () => {
  it("shares the bridge owner for Markdown and tool images without a parent thread id", () => {
    environment.remoteSession = true;
    const location: ProjectLocation = { kind: "posix", path: "/work" };
    const { result } = renderHook(() =>
      useThreadTranscriptImageActions({ id: "thread-1" }, location),
    );
    const url = toLocalFileUrl("/work/child.png");

    expect(result.current).not.toHaveProperty("threadId");
    expect(result.current).not.toHaveProperty("mediaLocation");
    expect(result.current.markdownImageRoot).toBe("/work");
    expect(result.current.remoteImageRefUrl?.(ref)).toBe("ref:image-1");
    expect(result.current.remoteImageReadiness).toBe(readiness);
    expect(result.current.markdownLocalImageReadiness?.readiness).toBe(readiness);
    expect(result.current.markdownLocalImageReadiness?.pathForUrl(url)).toBe("/work/child.png");
    expect(result.current.remoteLocalImageUrl?.(url)).toBe("local:/work/child.png");
  });

  it("decodes paired Windows Markdown images through the owning connection", () => {
    environment.localHost = false;
    const location: ProjectLocation = { kind: "windows", path: "C:\\work" };
    const { result } = renderHook(() =>
      useThreadTranscriptImageActions({ id: "thread-1", remoteServerId: "host-1" }, location),
    );
    const url = toLocalFileUrl("C:\\work\\shots\\child.png");

    expect(result.current.markdownLocalImageReadiness?.pathForUrl(url)).toBe(
      "C:/work/shots/child.png",
    );
    expect(result.current.remoteLocalImageUrl?.(url)).toBe("local:C:/work/shots/child.png");
  });

  it("keeps an own-host managed Markdown image on the native local protocol", () => {
    environment.managedRoot = true;
    const location: ProjectLocation = { kind: "posix", path: "/work" };
    const { result } = renderHook(() =>
      useThreadTranscriptImageActions({ id: "thread-1" }, location),
    );
    const url = toLocalFileUrl("/work/child.png");

    expect(result.current.remoteLocalImageUrl?.(url)).toBe(url);
    expect(result.current.markdownLocalImageReadiness).toBeUndefined();
  });

  it("fails closed for a missing remote authority", () => {
    environment.remoteSession = true;
    environment.authority = authority({ available: false, readiness: undefined });
    const location: ProjectLocation = { kind: "posix", path: "/work" };
    const { result } = renderHook(() =>
      useThreadTranscriptImageActions({ id: "thread-1" }, location),
    );
    const url = toLocalFileUrl("/work/child.png");

    expect(result.current.remoteImageRefUrl?.(ref)).toBe("ref:image-1");
    expect(result.current.remoteImageReadiness).toBeUndefined();
    expect(result.current.remoteLocalImageUrl?.(url)).toBe("");
    expect(result.current.markdownLocalImageReadiness).toBeUndefined();
  });

  it("fails closed for a missing thread even when a project location is supplied", () => {
    const location: ProjectLocation = { kind: "posix", path: "/work" };
    const { result } = renderHook(() => useThreadTranscriptImageActions(undefined, location));

    expect(result.current).toEqual({});
  });
});
