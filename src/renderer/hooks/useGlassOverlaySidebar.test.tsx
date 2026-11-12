import { render, waitFor } from "@testing-library/react";
import { Suspense, use, useLayoutEffect, useRef, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { OverlayShell } from "@/renderer/components/layout/OverlayShell";
import { useGlassOverlaySidebar } from "./useGlassOverlaySidebar";

const ROOT_FLAG = "data-glass-overlay-visible";

function Sidebar() {
  const ref = useRef<HTMLElement>(null);
  useGlassOverlaySidebar(ref);
  return <aside ref={ref} className="poracode-sidebar-aside" />;
}

function Surface(props: { visible: boolean; children?: ReactNode }) {
  return (
    <div data-overlay-surface="" {...(props.visible ? { "data-overlay-visible": "" } : {})}>
      {props.children}
    </div>
  );
}

function rootFlag(): boolean {
  return document.documentElement.hasAttribute(ROOT_FLAG);
}

afterEach(() => {
  document.documentElement.removeAttribute(ROOT_FLAG);
});

describe("useGlassOverlaySidebar", () => {
  it("leaves the root flag off for a sidebar outside any overlay surface", () => {
    render(<Sidebar />);
    expect(rootFlag()).toBe(false);
  });

  it("follows the overlay surface's visible attribute", async () => {
    const { rerender, unmount } = render(
      <Surface visible={false}>
        <Sidebar />
      </Surface>,
    );
    expect(rootFlag()).toBe(false);

    rerender(
      <Surface visible>
        <Sidebar />
      </Surface>,
    );
    await waitFor(() => expect(rootFlag()).toBe(true));

    rerender(
      <Surface visible={false}>
        <Sidebar />
      </Surface>,
    );
    await waitFor(() => expect(rootFlag()).toBe(false));

    rerender(
      <Surface visible>
        <Sidebar />
      </Surface>,
    );
    await waitFor(() => expect(rootFlag()).toBe(true));
    unmount();
    expect(rootFlag()).toBe(false);
  });

  it("sets the flag before paint when a sidebar mounts into a visible overlay", () => {
    const seenByParentLayoutEffect: boolean[] = [];
    function Probe(props: { children?: ReactNode }) {
      // A parent's layout effect runs after its children's layout effects and
      // before any passive effect, so this reads what the first paint will see.
      useLayoutEffect(() => {
        if (props.children) seenByParentLayoutEffect.push(rootFlag());
      });
      return <Surface visible>{props.children}</Surface>;
    }
    const { rerender } = render(<Probe />);
    expect(rootFlag()).toBe(false);

    // Overlay content is lazy-loaded, so the sidebar can land after the
    // surface is already visible.
    rerender(
      <Probe>
        <Sidebar />
      </Probe>,
    );
    expect(seenByParentLayoutEffect).toEqual([true]);
  });

  it("keeps the flag while Suspense hides a sidebar that stays in the document", async () => {
    function Gate(props: { pending: Promise<void> | null }) {
      if (props.pending) use(props.pending);
      return null;
    }
    const tree = (pending: Promise<void> | null) => (
      <Surface visible>
        <Suspense fallback={<div>Loading</div>}>
          <Sidebar />
          <Gate pending={pending} />
        </Suspense>
      </Surface>
    );
    const { rerender, unmount } = render(tree(null));
    expect(rootFlag()).toBe(true);

    rerender(tree(new Promise<void>(() => {})));
    await Promise.resolve();
    expect(document.querySelector(".poracode-sidebar-aside")).not.toBeNull();
    expect(rootFlag()).toBe(true);

    rerender(tree(null));
    expect(rootFlag()).toBe(true);
    unmount();
    expect(rootFlag()).toBe(false);
  });

  it("counts a visible surface further up the tree", () => {
    render(
      <Surface visible>
        <Surface visible={false}>
          <Sidebar />
        </Surface>
      </Surface>,
    );
    expect(rootFlag()).toBe(true);
  });

  it("keeps the flag until the last visible overlay sidebar is gone", () => {
    const first = render(
      <Surface visible>
        <Sidebar />
      </Surface>,
    );
    const second = render(
      <Surface visible>
        <Sidebar />
      </Surface>,
    );
    expect(rootFlag()).toBe(true);

    first.unmount();
    expect(rootFlag()).toBe(true);
    second.unmount();
    expect(rootFlag()).toBe(false);
  });

  it("tracks a real OverlayShell from open to the start of its fade-out", async () => {
    const { rerender } = render(
      <OverlayShell open instantEnter>
        <Sidebar />
      </OverlayShell>,
    );
    expect(rootFlag()).toBe(true);

    rerender(
      <OverlayShell open={false} instantEnter>
        {null}
      </OverlayShell>,
    );
    // The sidebar is still mounted for the fade-out, but the base app must be
    // back so the overlay fades over it instead of over bare desktop.
    expect(document.querySelector(".poracode-sidebar-aside")).not.toBeNull();
    await waitFor(() => expect(rootFlag()).toBe(false));
  });
});
