import type { ReactNode } from "react";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { RemoteServerPicker } from "./RemoteServerPicker";

type PickerStoreState = {
  servers: Array<{ desktopId: string; endpoint: string; label: string }>;
  runtime: Record<string, { status: "online" }>;
};

const pickerState = vi.hoisted<PickerStoreState>(() => ({
  servers: [],
  runtime: {},
}));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => true,
}));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (selector: (state: PickerStoreState) => unknown) => selector(pickerState),
}));

vi.mock("@/renderer/components/common/ResponsiveMenuSurface", () => ({
  ResponsiveMenuSurface: (props: { trigger: ReactNode }) => props.trigger,
}));

vi.mock("./RemoteServerIcon", () => ({
  RemoteServerIcon: () => <span data-testid="remote-server-icon" />,
}));

describe("RemoteServerPicker", () => {
  beforeEach(() => {
    pickerState.servers = [];
    pickerState.runtime = {};
  });

  it("selects the paired server instead of showing Local when Local is unavailable", () => {
    pickerState.servers = [
      {
        desktopId: "desktop-1",
        endpoint: "https://desktop.test",
        label: "Mac Studio",
      },
    ];
    pickerState.runtime = { "desktop-1": { status: "online" } };

    const { container } = render(
      <RemoteServerPicker
        value={null}
        includeLocal={false}
        opensUpward
        onChange={vi.fn<(desktopId: string | null) => void>()}
      />,
    );

    expect(screen.getByText("Mac Studio")).toBeInTheDocument();
    expect(screen.queryByText("Local")).not.toBeInTheDocument();
    expect(container.querySelector(".lucide-chevron-up")).toBeInTheDocument();
  });

  it("uses a neutral connection label while remote servers are hydrating", () => {
    render(
      <RemoteServerPicker
        value={null}
        includeLocal={false}
        onChange={vi.fn<(desktopId: string | null) => void>()}
      />,
    );

    expect(screen.getByText("Connections")).toBeInTheDocument();
    expect(screen.queryByText("Local")).not.toBeInTheDocument();
  });
});
