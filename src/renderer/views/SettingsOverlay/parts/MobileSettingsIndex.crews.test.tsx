import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { MobileSettingsIndex } from "./MobileSettingsIndex";

describe("MobileSettingsIndex Crews entry", () => {
  it("routes the compact settings index to Crews", () => {
    const onOpenSection = vi.fn<() => void>();
    renderWithI18n(
      <MobileSettingsIndex
        screen="device"
        hasDesktop={false}
        showArchived={false}
        onOpenDesktop={() => {}}
        onOpenSchedules={() => {}}
        onOpenSection={onOpenSection}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Crews/ }));
    expect(onOpenSection).toHaveBeenCalledWith("crews");
  });
});
