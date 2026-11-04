import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { I18nTestWrapper } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { getProjectGroupIndex } from "@/renderer/state/projectGroups/useProjectGroups";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useProjectEnvironmentMenuItems } from "./useProjectEnvironmentMenuItems";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isRemoteSession: () => false,
}));

const local: Project = {
  id: "pc",
  name: "Pora.code",
  location: { kind: "windows", path: "E:\\work\\pora" },
  createdAt: "2026-07-13T10:00:00.000Z",
};
const mac: Project = {
  id: "remote:mac:project:p",
  name: "Pora.code",
  remoteServerId: "mac",
  remoteId: "p",
  location: { kind: "posix", path: "/Users/me/pora", remoteServerId: "mac" },
  createdAt: "2026-07-13T10:00:00.000Z",
};
const renamed: Project = {
  ...mac,
  id: "remote:mac2:project:q",
  name: "poracode-fork",
  remoteServerId: "mac2",
  remoteId: "q",
  location: { kind: "posix", path: "/Users/me/fork", remoteServerId: "mac2" },
};

function members(projectId: string): string[] {
  return (getProjectGroupIndex().groupByProjectId.get(projectId)?.members ?? []).map((m) => m.id);
}

describe("useProjectEnvironmentMenuItems", () => {
  beforeEach(() => {
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
    useAppStore.setState({ projects: [local, mac, renamed] });
    useRemoteServersStore.setState({
      servers: [
        { desktopId: "mac", label: "Poracode on MacBook" },
        { desktopId: "mac2", label: "Poracode on Mac mini" },
      ],
      runtime: {},
    } as never);
  });

  it("offers no machines submenu when there is nothing to separate or combine", () => {
    useAppStore.setState({ projects: [local] });
    const { result } = renderHook(() => useProjectEnvironmentMenuItems(local), {
      wrapper: I18nTestWrapper,
    });
    expect(result.current.entry).toBeNull();
    expect(result.current.onAction("environment-separate:pc")).toBe(false);
  });

  it("separates an environment and combines another one", () => {
    const { result, rerender } = renderHook(() => useProjectEnvironmentMenuItems(local), {
      wrapper: I18nTestWrapper,
    });
    const entry = result.current.entry;
    expect(entry && "items" in entry ? entry.items.map((item) => item.id) : []).toEqual([
      "environment-separate:pc",
      "environment-separate:remote:mac:project:p",
      "environment-combine:remote:mac2:project:q",
    ]);

    act(() => {
      result.current.onAction("environment-combine:remote:mac2:project:q");
    });
    rerender();
    expect(members("pc")).toEqual(["pc", mac.id, renamed.id]);
    const refreshed = result.current.entry;
    expect(refreshed && "items" in refreshed ? refreshed.items.map((item) => item.id) : []).toEqual(
      [
        "environment-separate:pc",
        "environment-separate:remote:mac:project:p",
        "environment-separate:remote:mac2:project:q",
      ],
    );

    act(() => {
      result.current.onAction(`environment-separate:${mac.id}`);
    });
    expect(members("pc")).toEqual(["pc", renamed.id]);
    expect(members(mac.id)).toEqual([mac.id]);
    expect(result.current.onAction("project-settings")).toBe(false);
  });
});
