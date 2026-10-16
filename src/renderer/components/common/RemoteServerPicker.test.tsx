import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
const layout = vi.hoisted(() => ({ compact: true }));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (selector: (state: PickerStoreState) => unknown) => selector(pickerState),
}));

vi.mock("./RemoteServerIcon", () => ({
  RemoteServerIcon: () => <span data-testid="remote-server-icon" />,
}));

describe("RemoteServerPicker", () => {
  beforeEach(() => {
    layout.compact = true;
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

  it("shows detail text after the label in the default trigger", () => {
    render(
      <RemoteServerPicker
        value={null}
        includeLocal
        detail="12s ago"
        onChange={vi.fn<(desktopId: string | null) => void>()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Connections" });
    expect(within(trigger).getByText("Local")).toBeInTheDocument();
    expect(within(trigger).getByText("· 12s ago")).toBeInTheDocument();
    expect(trigger).toHaveAccessibleDescription("· 12s ago");
  });

  it("omits detail text and its description when no detail is given", () => {
    render(
      <RemoteServerPicker
        value={null}
        includeLocal
        onChange={vi.fn<(desktopId: string | null) => void>()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Connections" });
    expect(trigger).not.toHaveAttribute("aria-describedby");
    expect(within(trigger).queryByText(/^·/)).toBeNull();
  });

  it("uses the standard desktop menu and switches between remote and local machines", async () => {
    layout.compact = false;
    pickerState.servers = [
      { desktopId: "desktop-1", endpoint: "https://desktop.test", label: "Mac Studio" },
    ];
    const onChange = vi.fn<(desktopId: string | null) => void>();
    const { rerender } = render(
      <RemoteServerPicker value={null} includeLocal opensUpward onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Connections" }));
    const menu = await screen.findByRole("listbox", { name: "Connections" });
    expect(menu).toHaveClass("poracode-menu");
    expect(within(menu).getByRole("option", { name: "Local" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(within(menu).getByRole("option", { name: "Mac Studio" }));
    expect(onChange).toHaveBeenLastCalledWith("desktop-1");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());

    rerender(<RemoteServerPicker value="desktop-1" includeLocal opensUpward onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Connections" }));
    const remoteMenu = await screen.findByRole("listbox");
    expect(within(remoteMenu).getByRole("option", { name: "Mac Studio" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(within(remoteMenu).getByRole("option", { name: "Local" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps the compact sheet and its selected machine state", async () => {
    pickerState.servers = [
      { desktopId: "desktop-1", endpoint: "https://desktop.test", label: "Mac Studio" },
    ];
    const onChange = vi.fn<(desktopId: string | null) => void>();
    render(<RemoteServerPicker value="desktop-1" includeLocal onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Connections" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("button", { name: "Mac Studio" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(sheet).getByRole("button", { name: "Local" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
