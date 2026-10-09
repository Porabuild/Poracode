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
    render(<UsageDisplaySettings providers={[{ id: "fixture", label: "Fixture" }]} />);
    expect(document.querySelector('[data-settings-anchor="usage.showInSidebar"]')).toBeTruthy();
    expect(document.querySelector('[data-settings-anchor="usage.showEstimatedCost"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show circles in sidebar" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Show estimated cost" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide Fixture circle in sidebar" }));
    expect(useSharedSettings.getState().usage).toMatchObject({
      showInSidebar: false,
      showEstimatedCost: true,
      sidebarHiddenProviders: ["fixture"],
      autoRefresh: policy.autoRefresh,
      providerRefreshIntervals: policy.providerRefreshIntervals,
      disabledProviders: policy.disabledProviders,
    });
    expect(screen.queryByLabelText(/API key|auto-refresh|Track Fixture/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Sign (in|out)/ })).toBeNull();
    expect(screen.getByText(/independently of the selected usage host/)).toBeTruthy();
  });
});
