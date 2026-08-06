import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AsideSlot } from "./AsideSlot";

function renderSlot(overrides: {
  overlay?: boolean;
  isOpen?: boolean;
  onResizeStart?: () => void;
}) {
  const onResizeStart = overrides.onResizeStart ?? vi.fn<() => void>();
  render(
    <AsideSlot
      orientation="vertical"
      isOpen={overrides.isOpen ?? true}
      targetWidth={480}
      onResizeStart={onResizeStart}
      onResizeKeyDown={vi.fn<() => void>()}
      panelRef={createRef<HTMLDivElement>()}
      panelInnerRef={createRef<HTMLDivElement>()}
      ariaLabel="Resize terminal panel"
      overlay={overrides.overlay ?? false}
      overlayReady={overrides.overlay ?? false}
    >
      <div>panel body</div>
    </AsideSlot>,
  );
  return { onResizeStart };
}

describe("AsideSlot", () => {
  it("keeps the resize handle beside the panel when docked", () => {
    renderSlot({ overlay: false });
    const handle = screen.getByRole("separator", { name: "Resize terminal panel" });
    expect(handle.className).toContain("poracode-resize-handle");
    expect(handle.nextElementSibling?.tagName).toBe("ASIDE");
  });

  it("renders the resize handle inside the panel when floating as an overlay", () => {
    const { onResizeStart } = renderSlot({ overlay: true });
    const handle = screen.getByRole("separator", { name: "Resize terminal panel" });
    expect(handle.className).toContain("poracode-resize-handle-overlay");
    expect(handle.closest("aside")).not.toBeNull();

    fireEvent.mouseDown(handle);
    expect(onResizeStart).toHaveBeenCalledTimes(1);
  });

  it("hides the overlay resize handle while the panel is closed", () => {
    renderSlot({ overlay: true, isOpen: false });
    expect(screen.queryByRole("separator")).toBeNull();
  });
});
