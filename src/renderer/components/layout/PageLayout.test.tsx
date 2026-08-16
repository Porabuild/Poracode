import { useEffect } from "react";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { macosTrafficLightGutterClass } from "./sidebarChrome";
import { PageLayout } from "./PageLayout";

const layout = vi.hoisted(() => ({ compact: true }));
const host = vi.hoisted(() => ({ mac: false }));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/bridge", () => ({
  isMac: () => host.mac,
  isWindows: () => false,
}));

vi.mock("@/renderer/clientRuntime", () => ({
  isBrowserClientRuntime: () => !window.poracodeHost,
}));

describe("PageLayout compact navigation", () => {
  afterEach(() => {
    layout.compact = true;
    host.mac = false;
    delete window.poracodeHost;
  });

  it("preserves shell descendants when switching between home and a thread", async () => {
    let mounts = 0;

    function MountProbe() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <div>sidebar</div>;
    }

    const { rerender } = render(
      <PageLayout
        title="Poracode"
        compactHome
        mobileNavigation
        sidebar={<MountProbe />}
        content={<div>home</div>}
      />,
    );

    await waitFor(() => expect(mounts).toBe(1));

    rerender(
      <PageLayout
        title="Thread"
        compactHome={false}
        mobileNavigation
        sidebar={<MountProbe />}
        content={<div>thread</div>}
      />,
    );

    expect(mounts).toBe(1);
  });
});

describe("PageLayout Mac window chrome", () => {
  afterEach(() => {
    layout.compact = true;
    host.mac = false;
    delete window.poracodeHost;
  });

  it("does not reserve traffic-light space in the desktop web client", () => {
    layout.compact = false;
    host.mac = true;

    const { container } = render(
      <PageLayout title="Poracode" sidebar={<div>sidebar</div>} content={<div>home</div>} />,
    );

    expect(container.getElementsByClassName(macosTrafficLightGutterClass)).toHaveLength(0);
  });

  it("reserves traffic-light space in the Electron macOS window", () => {
    layout.compact = false;
    host.mac = true;
    window.poracodeHost = {} as ElectronHostBridge;

    const { container } = render(
      <PageLayout title="Poracode" sidebar={<div>sidebar</div>} content={<div>home</div>} />,
    );

    expect(container.getElementsByClassName(macosTrafficLightGutterClass).length).toBeGreaterThan(
      0,
    );
  });
});
