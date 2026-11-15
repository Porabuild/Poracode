import type { ReactNode } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { UsageDisplaySettings } from "./UsageDisplaySettings";

vi.mock("@/renderer/components/common", () => ({
  Button: (props: { children: ReactNode; onPress: () => void; "aria-label": string }) => (
    <button type="button" aria-label={props["aria-label"]} onClick={props.onPress}>
      {props.children}
    </button>
  ),
  ToggleSwitch: (props: {
    "aria-label": string;
    isSelected: boolean;
    onChange: (value: boolean) => void;
  }) => (
    <input
      type="checkbox"
      aria-label={props["aria-label"]}
      checked={props.isSelected}
      onChange={(event) => props.onChange(event.target.checked)}
    />
  ),
}));
vi.mock("@/renderer/components/providers/useUsageProviderLogin", () => ({
  useUsageProviderLogin: () => {
    throw new Error("display controls must not load credentials");
  },
}));
afterEach(cleanup);
beforeEach(() =>
  useSharedSettings.setState((state) => ({
    agentInstances: {
      owner: {
        id: "owner",
        driver: "claude",
        displayName: "Owner",
        config: { configDir: "/tmp/owner-profile-fixture" },
      },
    },
    usage: {
      ...state.usage,
      showInSidebar: true,
      showEstimatedCost: false,
      sidebarHiddenProviders: [],
      disabledProviders: ["fixture"],
      autoRefresh: false,
      providerRefreshIntervals: { fixture: 10 },
    },
  })),
);

describe("usage display preferences", () => {
  it("restores searchable toggles and provider sidebar visibility without credential/collection controls", () => {
    const policy = useSharedSettings.getState().usage;
    render(<UsageDisplaySettings showHostNote />);
    expect(document.querySelector('[data-settings-anchor="usage.showInSidebar"]')).toBeTruthy();
    expect(document.querySelector('[data-settings-anchor="usage.sidebarVisibility"]')).toBeTruthy();
    expect(document.querySelector('[data-settings-anchor="usage.showEstimatedCost"]')).toBeTruthy();
    expect(screen.queryByRole("button", { name: /circle in sidebar/ })).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Show circles in sidebar" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Show estimated cost" }));

    const visibilityButton = screen.getByRole("button", { name: "Visible in sidebar" });
    expect(visibilityButton.textContent).toBe("18 / 18");
    fireEvent.click(visibilityButton);
    fireEvent.click(screen.getByRole("option", { name: "Claude Owner" }));

    expect(useSharedSettings.getState().usage).toMatchObject({
      showInSidebar: false,
      showEstimatedCost: true,
      sidebarHiddenProviders: ["claude:owner"],
      autoRefresh: policy.autoRefresh,
      providerRefreshIntervals: policy.providerRefreshIntervals,
      disabledProviders: policy.disabledProviders,
    });
    expect(screen.queryByLabelText(/API key|auto-refresh|Track Fixture/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Sign (in|out)/ })).toBeNull();
    expect(screen.getByText(/independently of the selected usage host/)).toBeTruthy();
  });

  it("filters providers and supports Hide all / Show all inside Visible in sidebar", () => {
    render(<UsageDisplaySettings />);
    const visibilityButton = screen.getByRole("button", { name: "Visible in sidebar" });
    fireEvent.click(visibilityButton);

    fireEvent.click(screen.getByRole("button", { name: "Hide all" }));
    expect(useSharedSettings.getState().usage.sidebarHiddenProviders.length).toBe(18);
    expect(visibilityButton.textContent).toBe("0 / 18");

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(useSharedSettings.getState().usage.sidebarHiddenProviders).toEqual([]);
    expect(visibilityButton.textContent).toBe("18 / 18");

    fireEvent.change(screen.getByRole("textbox", { name: "Search providers" }), {
      target: { value: "Owner" },
    });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: "Claude Owner" })).toBeTruthy();
  });
});
