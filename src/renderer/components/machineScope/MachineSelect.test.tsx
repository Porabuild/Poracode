import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { MachineSelect } from "./MachineSelect";

const responsiveMenuState = vi.hoisted(() => ({ mobile: false }));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => responsiveMenuState.mobile,
}));

vi.mock("@/renderer/components/common/ResponsiveMenuSurface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/components/common/ResponsiveMenuSurface")>()),
  useResponsiveMenu: () => ({ mobile: responsiveMenuState.mobile }),
}));

const machines: MachineDescriptor[] = [
  {
    id: "local",
    ref: { host: "local", env: { kind: "native" } },
    kind: "local",
    label: "Local",
    status: "online",
  },
  {
    id: "remote:mac",
    ref: { host: "remote", desktopId: "mac", env: { kind: "native" } },
    kind: "remote",
    label: "MacBook",
    status: "online",
    desktopId: "mac",
  },
];

describe("MachineSelect", () => {
  beforeEach(() => {
    responsiveMenuState.mobile = false;
  });

  it("uses the elevated frosted bubble material for the desktop floating scope pill", () => {
    render(<MachineSelect machines={machines} value="local" onChange={() => {}} />);

    expect(screen.getByLabelText("Select machine: Local")).toHaveClass(
      "poracode-floating-chrome",
      "poracode-floating-chrome--bubble",
      "poracode-floating-chrome--bubble-elevated",
    );
  });

  it("keeps the compact sheet trigger on the standard field treatment", () => {
    responsiveMenuState.mobile = true;
    render(<MachineSelect machines={machines} value="local" onChange={() => {}} />);

    const trigger = screen.getByLabelText("Select machine: Local");
    expect(trigger).not.toHaveClass("poracode-floating-chrome--bubble-elevated");
    expect(trigger).not.toHaveClass("poracode-floating-chrome--bubble");
  });
});
