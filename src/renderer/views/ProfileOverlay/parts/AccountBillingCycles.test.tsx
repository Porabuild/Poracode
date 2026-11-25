import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { UsageSnapshot } from "@poracode/agents-usage/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { AccountBillingCycles, ProfileAccountBillingCycles } from "./AccountBillingCycles";

const hydrationMock = vi.fn<(enabled: boolean) => void>();
const hostUsageViewMock = vi.fn<
  (
    connectionId: string,
    pollIntervalMs: number,
    staleOk: boolean,
    enabled: boolean,
  ) => {
    canRead: boolean;
    agents: { windows: Array<{ kind: string; label: string; available: boolean }> } | undefined;
    usage: {
      snapshots: UsageSnapshot[];
      loading: boolean;
      refreshing: boolean;
      error: string | null;
    };
  }
>();

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: () => <span data-testid="provider-icon" />,
}));

vi.mock("@/renderer/components/providers/useProviderUsageHydration", () => ({
  useProviderUsageHydration: (enabled: boolean) => hydrationMock(enabled),
}));

vi.mock("@/renderer/components/providers/HostUsageView", () => ({
  useHostUsageView: (
    connectionId: string,
    pollIntervalMs: number,
    staleOk: boolean,
    enabled: boolean,
  ) => hostUsageViewMock(connectionId, pollIntervalMs, staleOk, enabled),
}));

beforeEach(() => {
  hydrationMock.mockReset();
  hostUsageViewMock.mockReset();
  hostUsageViewMock.mockReturnValue({
    canRead: false,
    agents: undefined,
    usage: { snapshots: [], loading: false, refreshing: false, error: null },
  });
  useProviderUsageStore.setState({ snapshots: {} });
  useSharedSettings.setState({ agentInstances: {} });
});

afterEach(cleanup);

describe("AccountBillingCycles", () => {
  it("renders billing accounts, cycle tokens, and interactive breakdown bars without duplicate lists", async () => {
    const now = Date.now();
    const snapshots: UsageSnapshot[] = [
      {
        providerId: "cursor:work",
        status: "ok",
        plan: "Team",
        fetchedAt: now,
        tokens: {
          total: 949_977_059,
          input: 44_405_483,
          output: 4_370_584,
          cacheRead: 901_200_992,
          cacheWrite: 12_300_000,
          period: "cycle",
        },
        windows: [
          {
            id: "cursor-auto",
            label: "Cursor Models",
            usedPercent: 67.41,
            unit: "percent",
            currency: "USD",
            used: 706.77,
            resetsAt: now + 8 * 86_400_000,
            breakdown: [
              { label: "model-fast", used: 354.19, currency: "USD", tokens: 264_161_359 },
              { label: "model-std", used: 352.58, currency: "USD", tokens: 327_300_000 },
            ],
          },
          {
            id: "cursor-api",
            label: "API",
            usedPercent: 100,
            unit: "percent",
            currency: "USD",
            used: 183.62,
            limit: 20,
            resetsAt: now + 8 * 86_400_000,
            breakdown: [{ label: "api-high", used: 183.62, currency: "USD", tokens: 358_515_700 }],
          },
          {
            id: "extra-usage",
            label: "On-demand",
            usedPercent: 97.18,
            unit: "usd",
            currency: "USD",
            used: 1020.42,
            limit: 1050,
            resetsAt: now + 8 * 86_400_000,
            breakdown: [
              { label: "Personal", used: 1020.42, currency: "USD" },
              { label: "Team pooled", used: 1051.85, limit: 1050, currency: "USD" },
            ],
          },
        ],
      },
      {
        // Percent-only rate-limit snapshot without billing or breakdown data is skipped.
        providerId: "codex",
        status: "ok",
        fetchedAt: now,
        windows: [{ id: "session-5h", label: "Session (5h)", usedPercent: 10, unit: "percent" }],
      },
    ];

    render(
      <AccountBillingCycles
        snapshots={snapshots}
        providerLabels={{ "cursor:work": "Work Account" }}
      />,
    );

    expect(screen.getByTestId("profile-account-billing-cycles")).toBeInTheDocument();
    expect(screen.getByText("Work Account")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText(/950\.0M tokens/)).toBeInTheDocument();
    expect(screen.getByText(/Input 44\.4M/)).toBeInTheDocument();
    expect(screen.getByText(/Cache read 901\.2M/)).toBeInTheDocument();
    expect(screen.getByText(/Cache write 12\.3M/)).toBeInTheDocument();
    expect(screen.getByText(/Output 4\.4M/)).toBeInTheDocument();
    // Per-model breakdown lives in bar hover/focus tooltips rather than a duplicate inline list.
    expect(screen.queryByText("model-fast")).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-cycle-codex")).not.toBeInTheDocument();

    const trigger = screen.getByText("Cursor Models").closest("[tabindex='0']");
    expect(trigger).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => {
      (trigger as HTMLElement).focus();
    });
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("model-fast");
    expect(tooltip).toHaveTextContent("50%");
  });

  it("toggles the info tooltip on click, omits 'Resets in now', and renders credits and billed spend", async () => {
    const now = Date.now();
    const snapshots: UsageSnapshot[] = [
      {
        providerId: "devin",
        status: "ok",
        plan: "Pro",
        fetchedAt: now,
        credits: { balance: 42.5, currency: "USD" },
        cost: { amount: 19.25, currency: "USD", period: "30d", estimated: false },
        windows: [
          {
            id: "daily",
            label: "Daily",
            usedPercent: 25,
            unit: "usd",
            used: 5,
            limit: 20,
            currency: "USD",
            resetsAt: now - 1000,
          },
        ],
      },
    ];

    render(<AccountBillingCycles snapshots={snapshots} providerLabels={{ devin: "Devin" }} />);

    expect(screen.queryByText(/Resets in now/)).not.toBeInTheDocument();
    expect(screen.getByText("$42.50")).toBeInTheDocument();
    expect(screen.getByText(/Billed spend/)).toBeInTheDocument();
    expect(screen.getByText("$19.25")).toBeInTheDocument();

    const infoButton = screen.getByRole("button", { name: "About account billing cycles" });
    expect(infoButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(infoButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("active billing cycle");
    expect(infoButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(infoButton);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(infoButton).toHaveAttribute("aria-expanded", "false");
  });

  it("renders nothing when no snapshots have billing or breakdown details", () => {
    const { container } = render(
      <AccountBillingCycles
        snapshots={[
          {
            providerId: "codex",
            status: "ok",
            fetchedAt: Date.now(),
            windows: [{ id: "weekly", label: "Weekly", usedPercent: 20, unit: "percent" }],
          },
        ]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("ProfileAccountBillingCycles", () => {
  const now = Date.now();
  const baseCursorSnap: UsageSnapshot = {
    providerId: "cursor",
    status: "ok",
    fetchedAt: now,
    windows: [
      { id: "cursor-api", label: "API", usedPercent: 50, unit: "usd", used: 10, limit: 20 },
    ],
  };
  const workCursorSnap: UsageSnapshot = {
    providerId: "cursor:work",
    status: "ok",
    fetchedAt: now,
    windows: [
      { id: "cursor-api", label: "API", usedPercent: 90, unit: "usd", used: 18, limit: 20 },
    ],
  };

  it("hydrates local usage and filters strictly per-account without leaking sibling instances", () => {
    useProviderUsageStore.setState({
      snapshots: {
        cursor: baseCursorSnap,
        "cursor:work": workCursorSnap,
      },
    });
    useSharedSettings.setState({
      agentInstances: {
        work: { id: "work", driver: "cursor", displayName: "Cursor Work", enabled: true },
      },
    });

    render(
      <ProfileAccountBillingCycles
        selection={{ scope: "all", window: "30d", provider: "cursor" }}
        currentDeviceId="dev-local"
      />,
    );

    expect(hydrationMock).toHaveBeenCalledWith(true);
    expect(hostUsageViewMock).toHaveBeenCalledWith("", 0, false, false);
    expect(screen.getByTestId("account-cycle-cursor")).toBeInTheDocument();
    expect(screen.queryByTestId("account-cycle-cursor:work")).not.toBeInTheDocument();
  });

  it("uses remote host snapshots and remote agent labels when viewing a remote device, and respects canRead", () => {
    hostUsageViewMock.mockReturnValue({
      canRead: true,
      agents: { windows: [{ kind: "cursor:work", label: "Remote Cursor Work", available: true }] },
      usage: { snapshots: [workCursorSnap], loading: false, refreshing: false, error: null },
    });

    const { rerender } = render(
      <ProfileAccountBillingCycles
        selection={{ scope: "device", deviceId: "remote:conn-1", window: "30d" }}
        currentDeviceId="dev-local"
      />,
    );

    expect(hydrationMock).toHaveBeenCalledWith(false);
    expect(hostUsageViewMock).toHaveBeenCalledWith("conn-1", 0, false, true);
    expect(screen.getByText("Remote Cursor Work")).toBeInTheDocument();

    hostUsageViewMock.mockReturnValue({
      canRead: false,
      agents: { windows: [{ kind: "cursor:work", label: "Remote Cursor Work", available: true }] },
      usage: { snapshots: [workCursorSnap], loading: false, refreshing: false, error: null },
    });

    rerender(
      <ProfileAccountBillingCycles
        selection={{ scope: "device", deviceId: "remote:conn-1", window: "30d" }}
        currentDeviceId="dev-local"
      />,
    );

    expect(screen.queryByTestId("profile-account-billing-cycles")).not.toBeInTheDocument();
  });

  it("renders nothing and skips local hydration for historical non-current local devices", () => {
    useProviderUsageStore.setState({
      snapshots: { cursor: baseCursorSnap },
    });

    const { container } = render(
      <ProfileAccountBillingCycles
        selection={{ scope: "device", deviceId: "dev-old", window: "30d" }}
        currentDeviceId="dev-local"
      />,
    );

    expect(hydrationMock).toHaveBeenCalledWith(false);
    expect(container.firstChild).toBeNull();
  });
});
