import { useState } from "react";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Button } from "@/renderer/components/common/Button";
import { Input } from "@/renderer/components/common/Input";
import { LightballTabs } from "@/renderer/components/common/LightballTabs";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { ProfileData, ProfileSelection } from "@/renderer/views/ProfileOverlay/useProfileData";
import { ProfileSettings } from "@/renderer/views/SettingsOverlay/parts/ProfileSettings";
import type { ProfileCostStats, ProfileCostTotals } from "@/shared/contracts/costHistory";
import { CostHistory } from "./CostHistory";

const profileTestState = {
  remote: false,
  compact: false,
};

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => profileTestState.remote,
  readBridge: () => ({
    copyShareImage: vi.fn<() => Promise<void>>(async () => undefined),
  }),
}));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => profileTestState.compact,
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: () => <span />,
}));

vi.mock("@/renderer/views/ProfileOverlay/useProfileData", () => ({
  useProfileData: (): ProfileData => {
    const [selection, setSelection] = useState<ProfileSelection>({
      scope: "device",
      window: "all",
    });
    const totals: ProfileCostTotals = {
      tokens: 100,
      unpricedTokens: 0,
      categorizedTokens: 100,
      observedTokens: 100,
      estimatedTokens: 100,
      observedSamples: 1,
      estimatedSamples: 1,
      observed: [{ amount: 2, currency: "USD" }],
      estimatedUsd: 1.5,
      categories: { input: 80, output: 20, cacheRead: 0, cacheWrite: 0 },
    };
    return {
      devices: [
        {
          id: "dev-1",
          label: "This Mac",
          platform: "darwin",
          isCurrent: true,
          lastActiveAt: Date.now(),
        },
      ],
      identity: {
        name: "Ada Lovelace",
        handle: "ada",
        avatarColor: "oklch(0.62 0.11 245)",
        plan: "Local",
      },
      currentDeviceId: "dev-1",
      selection,
      setSelection,
      coreLoading: false,
      tokensLoading: false,
      error: null,
      saveIdentity: vi.fn<() => Promise<void>>(async () => undefined),
      core: {
        scope: selection.scope,
        device: {
          id: "dev-1",
          label: "This Mac",
          platform: "darwin",
          isCurrent: true,
          lastActiveAt: Date.now(),
        },
        generatedAt: Date.now(),
        timezoneOffsetMinutes: 0,
        identity: {
          name: "Ada Lovelace",
          handle: "ada",
          avatarColor: "oklch(0.62 0.11 245)",
          plan: "Local",
        },
        totals: {
          messagesSent: 10,
          totalPrompts: 5,
          totalThreads: 2,
          goalsSet: 1,
          longestTaskMs: 60_000,
          currentStreakDays: 3,
          longestStreakDays: 5,
          activeDays: 3,
        },
        promptHeatmap: { metric: "prompts", windowDays: 30, max: 2, cells: [] },
        insights: {
          topProvider: { key: "claude", label: "Claude", count: 5, percent: 100 },
          fastModePercent: 0,
          skillsExplored: 0,
          totalSkillsUsed: 0,
          workflowRuns: 0,
          subagentRuns: 0,
          mcpToolCalls: 0,
        },
        providers: [{ key: "claude", label: "Claude", count: 5, percent: 100 }],
        accounts: [
          { key: "claude:work", label: "Claude - work", count: 3, percent: 60 },
          { key: "claude:home", label: "Claude - home", count: 2, percent: 40 },
        ],
        availableAccounts: [
          { key: "claude:work", label: "Claude - work" },
          { key: "claude:home", label: "Claude - home" },
        ],
        models: [],
        modes: [],
        skills: [],
        mcps: [],
        aiActions: [],
      },
      tokens: {
        available: true,
        scope: selection.scope,
        device: {
          id: "dev-1",
          label: "This Mac",
          platform: "darwin",
          isCurrent: true,
          lastActiveAt: Date.now(),
        },
        generatedAt: Date.now(),
        timezoneOffsetMinutes: 0,
        windowDays: 30,
        lifetimeTokens: 100,
        peakDayTokens: 100,
        peakDay: "2026-10-17",
        providers: [{ provider: "claude", label: "Claude", tokens: 100, percent: 100 }],
        accounts: [
          { provider: "claude:work", label: "Claude - work", tokens: 60, percent: 60 },
          { provider: "claude:home", label: "Claude - home", tokens: 40, percent: 40 },
        ],
        models: [],
        tokenHeatmap: { metric: "tokens", windowDays: 30, max: 100, cells: [] },
        unavailableProviders: [],
        costs: {
          totals,
          days: [{ day: "2026-10-17", totals }],
          providers: [{ key: "claude", label: "Claude", totals }],
          models: [],
          accounts: [],
          pricing: [],
        },
      },
    };
  },
}));

vi.mock("@/renderer/components/common", () => ({
  Button,
  Input,
  LightballTabs,
  PixelLoader: () => <span>loading</span>,
  Select: ({
    options,
    value,
    onChange,
    label,
    "aria-label": ariaLabel,
  }: {
    options: Array<{ id: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
    label?: string;
    "aria-label"?: string;
  }) => (
    <select
      aria-label={label ?? ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
afterEach(() => {
  profileTestState.remote = false;
  profileTestState.compact = false;
  cleanup();
});

function choose(label: string, value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value } });
}
function chooseReportedCurrency(currency: string) {
  choose("Cost source", "reported");
  const picker = screen.queryByRole("combobox", { name: "Currency" });
  if (picker) fireEvent.change(picker, { target: { value: currency } });
}

function reportedStats(amount: number, currency: string): ProfileCostStats {
  const totals: ProfileCostTotals = {
    tokens: 0,
    unpricedTokens: 0,
    categorizedTokens: 0,
    observedTokens: 0,
    estimatedTokens: 0,
    observedSamples: 1,
    estimatedSamples: 0,
    observed: [{ amount, currency }],
    estimatedUsd: 0,
    categories: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  return {
    totals,
    days: [{ day: "2026-10-17", totals }],
    providers: [],
    models: [],
    accounts: [],
    pricing: [],
  };
}

it.each([
  [1.2345, "BHD", "BHD\u00a01.235"],
  [1.2345, "CLF", "CLF\u00a01.2345"],
  [1.2345, "JPY", "¥1"],
  [1.2345, "USD", "$1.23"],
  [0.00125, "USD", "$0.00125"],
  [0.000000175, "USD", "$0.000000175"],
  [0, "BHD", "BHD\u00a00.000"],
] as const)(
  "formats %s %s with native minor units and sub-cent precision",
  (amount, currency, expected) => {
    render(<CostHistory stats={reportedStats(amount, currency)} loading={false} locale="en" />);
    expect(screen.getByText("Provider-reported cost").nextElementSibling?.textContent).toBe(
      expected,
    );
  },
);

it("shows a known zero-token observation as zero while an unobserved day stays unknown", () => {
  const stats = reportedStats(0, "USD");
  stats.days.unshift({
    day: "2026-10-16",
    totals: { ...stats.totals, observedSamples: 0, observed: [] },
  });
  render(<CostHistory stats={stats} loading={false} locale="en" />);
  expect(screen.getByText("Provider-reported cost").nextElementSibling?.textContent).toBe("$0.00");
  expect(screen.getByText("API-equivalent estimate").nextElementSibling?.textContent).toBe(
    "Unknown",
  );
  expect(screen.getByText("Subscription bill").nextElementSibling?.textContent).toBe("Unknown");
  expect(
    within(screen.getByRole("region", { name: "Cost trend" })).getAllByText("$0.00"),
  ).toHaveLength(1);
  chooseReportedCurrency("USD");
  choose("Cost breakdown", "days");
  const rows = within(screen.getByRole("table")).getAllByRole("rowheader");
  expect(rows.map((row) => row.textContent)).toEqual(["2026-10-17", "2026-10-16"]);
  expect(within(rows[0]!.parentElement!).getAllByRole("cell")[0]!.textContent).toContain("$0.00");
  expect(within(rows[1]!.parentElement!).getAllByRole("cell")[0]!.textContent).toContain("Unknown");
});

it("keeps unknown history and invoices distinct from zero reported cost and API estimates", () => {
  const tokens = { input: 1_000_000, output: 100_000, cacheRead: 500_000, cacheWrite: 0 };
  const price = {
    id: "price",
    model: "claude-sonnet-4-6",
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    reviewedAt: "2026-10-16",
    effectiveFrom: "2026-10-16",
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
  };
  const totals: ProfileCostTotals = {
    tokens: 1_600_500,
    categorizedTokens: 1_600_000,
    unpricedTokens: 500,
    observedTokens: 1_600_000,
    estimatedTokens: 1_600_000,
    observedSamples: 1,
    estimatedSamples: 1,
    observed: [{ amount: 0, currency: "EUR" }],
    estimatedUsd: 4.65,
    categories: tokens,
  };
  const entry = { key: "fixture:work", label: "fixture:work", totals };
  const stats: ProfileCostStats = {
    totals,
    providers: [entry],
    models: [entry],
    accounts: [entry],
    pricing: [price],
    days: [
      {
        day: "2026-10-15",
        totals: {
          ...totals,
          tokens: 500,
          categorizedTokens: 0,
          observedTokens: 0,
          estimatedTokens: 0,
          estimatedSamples: 0,
          observedSamples: 0,
          observed: [],
          estimatedUsd: 0,
          categories: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
      },
      { day: "2026-10-16", totals: { ...totals, tokens: 1_600_000, unpricedTokens: 0 } },
    ],
  };
  render(<CostHistory stats={stats} loading={false} locale="en" />);
  expect(screen.getAllByText("$4.65 · Partial").length).toBeGreaterThan(0);
  expect(screen.getAllByText("€0.00 · Partial").length).toBeGreaterThan(0);
  expect(screen.getByText("Subscription bill").nextElementSibling?.textContent).toBe("Unknown");
  expect(screen.getAllByText("500").length).toBeGreaterThan(0);
  const categories = within(screen.getByRole("region", { name: "Recorded token categories" }));
  expect(categories.getByText("Input").nextElementSibling?.textContent).toBe("1,000,000");
  expect(categories.getByText("Cache read").nextElementSibling?.textContent).toBe("500,000");
  expect(categories.getByText("Cache write").nextElementSibling?.textContent).toBe("0");
  fireEvent.click(screen.getByRole("button", { name: "Pricing provenance" }));
  expect(screen.getByRole("link", { name: /claude-sonnet-4-6/ }).getAttribute("href")).toBe(
    price.source,
  );
  expect(screen.getByText(/^2026-10-15: Unknown/, { selector: "title" })).toBeTruthy();
  choose("Cost breakdown", "accounts");
  expect(screen.getByRole("rowheader", { name: "fixture:work" })).toBeTruthy();
  chooseReportedCurrency("EUR");
  expect(screen.getByText(/^2026-10-16: €0.00/, { selector: "title" })).toBeTruthy();
  choose("Cost breakdown", "days");
  const unknownDay = screen.getByRole("rowheader", { name: "2026-10-15" }).parentElement!;
  const pricedDay = screen.getByRole("rowheader", { name: "2026-10-16" }).parentElement!;
  expect(within(unknownDay).getAllByRole("cell")[0]!.textContent).toContain("Unknown");
  expect(within(pricedDay).getAllByRole("cell")[0]!.textContent).toContain("€0.00");
});

it("uses the same selected currency in the total, trend and model breakdown without combining currencies", () => {
  const stats = reportedStats(2, "USD");
  stats.totals.observed.push({ amount: 3, currency: "EUR" }, { amount: 1.2345, currency: "BHD" });
  stats.totals.observedSamples = 3;
  stats.models.push({ key: "model", label: "Recorded model", totals: stats.totals });
  render(<CostHistory stats={stats} loading={false} locale="en" />);
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("BHD\u00a01.235");
  chooseReportedCurrency("USD");
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("$2.00");
  expect(screen.getByRole("columnheader", { name: "Provider reported · USD" })).toBeTruthy();
  expect(screen.getByText(/^2026-10-17: \$2.00/, { selector: "title" })).toBeTruthy();
  expect(
    within(screen.getByRole("rowheader", { name: "Recorded model" }).parentElement!).getAllByRole(
      "cell",
    )[0]!.textContent,
  ).toContain("$2.00 · Partial");
  expect(screen.getByText("Coverage across reported currencies: 0 / 0 Tokens")).toBeTruthy();
  expect(screen.queryByText(/BHD\u00a01\.235/)).toBeNull();
  chooseReportedCurrency("EUR");
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("€3.00");
  expect(screen.getByRole("columnheader", { name: "Provider reported · EUR" })).toBeTruthy();
  choose("Cost source", "estimate");
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("Unknown");
  expect(screen.getByText("Provider-reported cost · EUR").nextElementSibling?.textContent).toBe(
    "€3.00 · Partial",
  );
  expect(screen.queryByRole("combobox", { name: "Currency" })).toBeNull();
  choose("Cost source", "reported");
  expect((screen.getByRole("combobox", { name: "Currency" }) as HTMLSelectElement).value).toBe(
    "EUR",
  );
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("€3.00");
});

it("leaves gaps between recorded days and draws known zero instead of joining through unknown history", () => {
  const stats = reportedStats(0, "USD");
  stats.days.unshift(
    { day: "2026-10-15", totals: { ...stats.totals, observed: [{ amount: 2, currency: "USD" }] } },
    { day: "2026-10-16", totals: { ...stats.totals, observedSamples: 0, observed: [] } },
  );
  stats.totals.observed = [{ amount: 2, currency: "USD" }];
  stats.totals.observedSamples = 2;
  stats.days[2] = {
    day: "2026-10-17",
    totals: { ...stats.totals, observed: [{ amount: 0, currency: "USD" }], observedSamples: 1 },
  };
  const { rerender } = render(<CostHistory stats={stats} loading={false} locale="en" />);
  const trendRegion = screen.getByRole("region", { name: "Cost trend" });
  expect(within(trendRegion).getByText("$2.00")).toBeTruthy();
  expect(within(trendRegion).getByText("$1.00")).toBeTruthy();
  expect(within(trendRegion).getAllByText("$0.00")).toHaveLength(1);
  const graph = screen.getByRole("img");
  expect(graph.querySelectorAll("path")).toHaveLength(2);
  expect([...graph.querySelectorAll("path")].map((path) => path.getAttribute("d"))).toEqual([
    expect.stringMatching(/^M[^L]+$/),
    expect.stringMatching(/^M[^L]+$/),
  ]);
  expect(graph.querySelectorAll("circle")).toHaveLength(2);
  expect(screen.getByText(/^2026-10-16: Unknown/, { selector: "title" })).toBeTruthy();
  expect(screen.getByText(/^2026-10-17: \$0.00/, { selector: "title" })).toBeTruthy();

  const zeroOnlyStats: ProfileCostStats = {
    ...stats,
    totals: { ...stats.totals, observed: [{ amount: 0, currency: "USD" }] },
    days: [
      {
        day: "2026-10-15",
        totals: { ...stats.totals, observed: [{ amount: 0, currency: "USD" }], observedSamples: 1 },
      },
      { day: "2026-10-16", totals: { ...stats.totals, observedSamples: 0, observed: [] } },
      {
        day: "2026-10-17",
        totals: { ...stats.totals, observed: [{ amount: 0, currency: "USD" }], observedSamples: 1 },
      },
    ],
  };
  rerender(<CostHistory stats={zeroOnlyStats} loading={false} locale="en" />);
  expect(
    within(screen.getByRole("region", { name: "Cost trend" })).getAllByText("$0.00"),
  ).toHaveLength(1);
  expect(screen.getByRole("img").querySelectorAll("path")).toHaveLength(2);
  expect(screen.getByRole("img").querySelectorAll("circle")).toHaveLength(2);
});

it("does not turn missing category or monetary coverage into zero totals or imply a phantom reported USD currency", () => {
  const stats = reportedStats(0, "USD");
  Object.assign(stats.totals, {
    tokens: 500,
    unpricedTokens: 500,
    observedSamples: 0,
    observed: [],
  });
  stats.days = [{ day: "2026-10-17", totals: stats.totals }];
  const { rerender } = render(<CostHistory stats={stats} loading={false} locale="en" />);
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("Unknown");
  expect(screen.queryByText("$0.00")).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "Cost trend" })).getByText(
      "No priced usage in this range.",
    ),
  ).toBeTruthy();
  const categories = within(screen.getByRole("region", { name: "Recorded token categories" }));
  expect(categories.getByText("Input").nextElementSibling?.textContent).toBe("Unknown");
  expect(categories.getByText("Cache read").nextElementSibling?.textContent).toBe("Unknown");
  expect(categories.getByText("Tokens").nextElementSibling?.textContent).toBe("500");
  choose("Cost source", "reported");
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("Unknown");
  expect(
    within(screen.getByRole("region", { name: "Costs" })).getByText(/Coverage: 0 \/ 500 Tokens/)
      .textContent,
  ).toBe("Coverage: 0 / 500 Tokens");
  expect(
    within(screen.getByRole("region", { name: "Cost trend" })).getByText("Provider-reported cost")
      .textContent,
  ).toBe("Provider-reported cost");
  expect(screen.getByRole("columnheader", { name: "Provider reported" })).toBeTruthy();
  expect(screen.queryByRole("columnheader", { name: /USD/ })).toBeNull();
  expect(screen.queryByText(/Provider-reported cost.*USD/)).toBeNull();
  expect(screen.queryByText(/Provider reported.*USD/)).toBeNull();
  expect(screen.queryByText("USD")).toBeNull();

  const estimatedOnlyTotals: ProfileCostTotals = {
    ...stats.totals,
    unpricedTokens: 0,
    estimatedTokens: 500,
    estimatedSamples: 1,
    estimatedUsd: 4.65,
  };
  rerender(
    <CostHistory
      stats={{
        ...stats,
        totals: estimatedOnlyTotals,
        days: [{ day: "2026-10-17", totals: estimatedOnlyTotals }],
      }}
      loading={false}
      locale="en"
    />,
  );
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("Unknown");
  expect(screen.getByText("API-equivalent estimate").nextElementSibling?.textContent).toBe("$4.65");
  expect(
    within(screen.getByRole("region", { name: "Costs" })).getByText(/Coverage: 0 \/ 500 Tokens/)
      .textContent,
  ).toBe("Coverage: 0 / 500 Tokens");
  expect(
    within(screen.getByRole("region", { name: "Cost trend" })).getByText("Provider-reported cost")
      .textContent,
  ).toBe("Provider-reported cost");
  expect(screen.getByRole("columnheader", { name: "Provider reported" })).toBeTruthy();
  expect(screen.queryByRole("columnheader", { name: /USD/ })).toBeNull();
});

it("drops an unavailable selected currency when account data changes and hides prior totals while loading", () => {
  const { rerender } = render(
    <CostHistory stats={reportedStats(2, "USD")} loading={false} locale="en" />,
  );
  chooseReportedCurrency("USD");
  rerender(<CostHistory stats={undefined} loading={true} locale="en" />);
  expect(screen.queryByTestId("profile-cost-total")).toBeNull();
  rerender(<CostHistory stats={reportedStats(3, "EUR")} loading={false} locale="de" />);
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("3,00\u00a0€");
  expect(screen.queryByRole("option", { name: "Provider reported · USD" })).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Provider reported · EUR" })).toBeTruthy();
});

it("reports an old host without optional cost history as unavailable", () => {
  render(<CostHistory stats={undefined} loading={false} locale="en" />);
  expect(screen.getByText("Cost history is unavailable from this host.")).toBeTruthy();
  expect(screen.queryByText("$0.00")).toBeNull();
});

it("keeps labelled source and breakdown selectors independent without overflowing tab strips", () => {
  render(<CostHistory stats={reportedStats(2, "USD")} loading={false} locale="en" />);
  const modelsRegion = screen.getByRole("region", { name: "Models" });
  modelsRegion.focus();
  expect(document.activeElement).toBe(modelsRegion);
  expect(modelsRegion.tabIndex).toBe(0);
  chooseReportedCurrency("USD");
  choose("Cost breakdown", "providers");
  expect((screen.getByRole("combobox", { name: "Cost source" }) as HTMLSelectElement).value).toBe(
    "reported",
  );
  expect(
    (screen.getByRole("combobox", { name: "Cost breakdown" }) as HTMLSelectElement).value,
  ).toBe("providers");
  const providersRegion = within(screen.getByRole("region", { name: "Cost breakdown" })).getByRole(
    "region",
    { name: "Providers" },
  );
  providersRegion.focus();
  expect(document.activeElement).toBe(providersRegion);
  expect(providersRegion.tabIndex).toBe(0);
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("$2.00");
});

it("explains missing estimates without hiding a recorded zero reported cost", () => {
  const stats = reportedStats(0, "USD");
  const entry = { key: "reported", label: "Reported-only entry", totals: stats.totals };
  stats.providers = [entry];
  stats.models = [entry];
  stats.accounts = [entry];
  render(<CostHistory stats={stats} loading={false} locale="en" />);
  choose("Cost source", "estimate");
  expect(screen.getAllByText("No priced usage in this range.")).toHaveLength(3);
  expect(screen.queryByText("No data yet.")).toBeNull();
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("Unknown");
  chooseReportedCurrency("USD");
  expect(screen.getByTestId("profile-cost-total").textContent).toBe("$0.00");
  expect(screen.getByRole("rowheader", { name: "Reported-only entry" })).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.queryByText("No priced usage in this range.")).toBeNull();
});

it.each(["models", "accounts", "providers"] as const)(
  "limits %s estimates to covered entries while retaining reported costs and token coverage",
  (breakdown) => {
    const stats = reportedStats(2, "USD");
    const unknownTotals: ProfileCostTotals = {
      ...stats.totals,
      tokens: 100,
      unpricedTokens: 100,
      observedSamples: 0,
      observed: [],
    };
    const entries = [
      { key: "unknown", label: "Unknown entry", totals: unknownTotals },
      {
        key: "reported",
        label: "Reported-only entry",
        totals: { ...stats.totals, tokens: 100, observedTokens: 100 },
      },
      {
        key: "zero",
        label: "Zero estimate",
        totals: { ...unknownTotals, tokens: 0, unpricedTokens: 0, estimatedSamples: 1 },
      },
      {
        key: "estimated",
        label: "Estimated entry",
        totals: {
          ...unknownTotals,
          unpricedTokens: 0,
          estimatedTokens: 100,
          estimatedSamples: 1,
          estimatedUsd: 5,
        },
      },
    ];
    stats.totals = {
      ...stats.totals,
      tokens: 300,
      unpricedTokens: 100,
      categorizedTokens: 200,
      estimatedTokens: 100,
      estimatedSamples: 2,
      estimatedUsd: 5,
      observedTokens: 100,
      categories: { input: 200, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    stats.providers = entries;
    stats.models = entries;
    stats.accounts = entries;
    stats.days = [
      { day: "2026-10-16", totals: unknownTotals },
      { day: "2026-10-17", totals: stats.totals },
    ];
    const before = structuredClone(stats);
    render(<CostHistory stats={stats} loading={false} locale="en" />);
    choose("Cost breakdown", breakdown);
    expect(screen.getAllByRole("rowheader").map((row) => row.textContent)).toEqual([
      "Estimated entry",
      "Zero estimate",
    ]);
    const cards = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(cards).toHaveLength(2);
    expect(cards.some((text) => text?.includes("Zero estimate") && text.includes("$0.00"))).toBe(
      true,
    );
    expect(cards.some((text) => text?.includes("Reported-only entry"))).toBe(false);
    expect(screen.getByTestId("profile-cost-total").textContent).toBe("$5.00");
    expect(
      within(screen.getByRole("region", { name: "Costs" })).getByText(
        /Coverage: 100 \/ 300 Tokens/,
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Recorded token categories" }))
        .getAllByRole("definition")
        .map((entry) => entry.textContent),
    ).toEqual(["300", "200", "0", "0", "0", "100"]);
    choose("Cost breakdown", "days");
    expect(screen.getAllByRole("rowheader").map((row) => row.textContent)).toEqual([
      "2026-10-17",
      "2026-10-16",
    ]);
    expect(
      within(screen.getAllByRole("rowheader")[1]!.parentElement!).getAllByRole("cell")[0]!
        .textContent,
    ).toContain("Unknown");
    choose("Cost breakdown", breakdown);
    chooseReportedCurrency("USD");
    expect(
      screen
        .getAllByRole("rowheader")
        .map((row) => row.textContent)
        .sort(),
    ).toEqual(entries.map((entry) => entry.label).sort());
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByTestId("profile-cost-total").textContent).toBe("$2.00");
    expect(stats).toEqual(before);
  },
);

it("orders breakdowns by the selected monetary basis, with recorded zero before unknown", () => {
  const stats = reportedStats(2, "USD");
  Object.assign(stats.totals, { estimatedSamples: 2, estimatedUsd: 9 });
  const entries = [
    {
      key: "unknown",
      label: "Unknown model",
      totals: { ...stats.totals, observed: [], estimatedSamples: 0 },
    },
    { key: "reported", label: "Reported model", totals: { ...stats.totals, estimatedUsd: 1 } },
    {
      key: "estimated",
      label: "Estimated model",
      totals: { ...stats.totals, estimatedUsd: 8, observed: [{ amount: 0, currency: "USD" }] },
    },
  ];
  stats.models = entries;
  stats.providers = entries;
  render(<CostHistory stats={stats} loading={false} locale="en" />);
  expect(screen.getAllByRole("rowheader").map((row) => row.textContent)).toEqual([
    "Estimated model",
    "Reported model",
  ]);
  chooseReportedCurrency("USD");
  expect(screen.getAllByRole("rowheader").map((row) => row.textContent)).toEqual([
    "Reported model",
    "Estimated model",
    "Unknown model",
  ]);
  expect(entries.map((entry) => entry.key)).toEqual(["unknown", "reported", "estimated"]);
});

it("pairs compact profile and range tabs across views while grouping Edit in ProfileHeader and preserving Share guards", () => {
  const { rerender } = render(<ProfileSettings />);
  const profileTabs = screen.getByRole("tablist", { name: "Profile tabs" });
  const rangeTabs = screen.getByRole("tablist", { name: "Profile stats range" });
  expect(profileTabs.parentElement).toBe(rangeTabs.parentElement);
  expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: "Costs" }));
  expect(screen.getByRole("tablist", { name: "Profile tabs" }).parentElement).toBe(
    screen.getByRole("tablist", { name: "Profile stats range" }).parentElement,
  );
  expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  const editButton = screen.getByRole("button", { name: "Edit" });
  const [deviceTrigger] = screen.getAllByRole("button", { name: /This Mac/ });
  expect(editButton.parentElement).toBe(deviceTrigger?.parentElement);
  expect(
    screen
      .getByRole("tablist", { name: "Profile stats range" })
      .parentElement?.contains(editButton),
  ).toBe(false);

  fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
  profileTestState.remote = true;
  rerender(<ProfileSettings />);
  expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
});

it("keeps the top bar and container width stable across Activity and Costs with directional transitions", () => {
  const { container } = render(<ProfileSettings />);
  const outer = container.firstElementChild as HTMLElement;
  const profileTabs = screen.getByRole("tablist", { name: "Profile tabs" });
  const topBar = profileTabs.parentElement?.parentElement as HTMLElement;
  const editButton = screen.getByRole("button", { name: "Edit" });
  const shareButton = screen.getByRole("button", { name: "Share" });
  const activityPanel = screen.getByRole("tabpanel", { name: "Activity" });

  expect(outer.className).toContain("max-w-[1080px]");
  expect(topBar.contains(editButton)).toBe(true);
  expect(topBar.contains(shareButton)).toBe(false);
  expect(activityPanel.contains(shareButton)).toBe(true);
  expect(activityPanel.className).not.toContain("poracode-tab-panel-");

  // Activity hero defaults to Tokens as primary and Total prompts as secondary, swapping on toggle.
  expect(screen.getByRole("region", { name: "Lifetime tokens" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Prompts" }));
  expect(screen.getByRole("region", { name: "Total prompts" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Tokens" }));
  expect(screen.getByRole("region", { name: "Lifetime tokens" })).toBeTruthy();

  // Switch Activity -> Costs: same container width, same top bar node, enters from right.
  fireEvent.click(screen.getByRole("tab", { name: "Costs" }));
  const costsPanel = screen.getByRole("tabpanel", { name: "Costs" });
  expect(container.firstElementChild).toBe(outer);
  expect(outer.className).toContain("max-w-[1080px]");
  expect(screen.getByRole("tablist", { name: "Profile tabs" }).parentElement?.parentElement).toBe(
    topBar,
  );
  expect(costsPanel.className).toContain("poracode-tab-panel-from-right");

  // Switch Costs -> Activity: enters from left without remounting the top bar.
  fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
  const returnedActivityPanel = screen.getByRole("tabpanel", { name: "Activity" });
  expect(screen.getByRole("tablist", { name: "Profile tabs" }).parentElement?.parentElement).toBe(
    topBar,
  );
  expect(returnedActivityPanel.className).toContain("poracode-tab-panel-from-left");
});

it("renders multi-provider trend, cache savings, type share bars, and model drill-down dialog", () => {
  const claudeTotals: ProfileCostTotals = {
    tokens: 1_500_000,
    categorizedTokens: 1_500_000,
    unpricedTokens: 0,
    observedTokens: 0,
    estimatedTokens: 1_500_000,
    observedSamples: 0,
    estimatedSamples: 2,
    observed: [],
    estimatedUsd: 4.65,
    cacheSavingsUsd: 1.35,
    categoryCostUsd: { input: 3, output: 1.5, cacheRead: 0.15, cacheWrite: 0 },
    categories: { input: 1_000_000, output: 100_000, cacheRead: 400_000, cacheWrite: 0 },
  };
  const geminiTotals: ProfileCostTotals = {
    tokens: 500_000,
    categorizedTokens: 500_000,
    unpricedTokens: 0,
    observedTokens: 0,
    estimatedTokens: 500_000,
    observedSamples: 0,
    estimatedSamples: 1,
    observed: [],
    estimatedUsd: 1.25,
    cacheSavingsUsd: 0.25,
    categoryCostUsd: { input: 0.5, output: 0.7, cacheRead: 0.05, cacheWrite: 0 },
    categories: { input: 300_000, output: 100_000, cacheRead: 100_000, cacheWrite: 0 },
  };
  const combinedTotals: ProfileCostTotals = {
    tokens: 2_000_000,
    categorizedTokens: 2_000_000,
    unpricedTokens: 0,
    observedTokens: 0,
    estimatedTokens: 2_000_000,
    observedSamples: 0,
    estimatedSamples: 3,
    observed: [],
    estimatedUsd: 5.9,
    cacheSavingsUsd: 1.6,
    categoryCostUsd: { input: 3.5, output: 2.2, cacheRead: 0.2, cacheWrite: 0 },
    categories: { input: 1_300_000, output: 200_000, cacheRead: 500_000, cacheWrite: 0 },
  };
  const stats: ProfileCostStats = {
    totals: combinedTotals,
    days: [
      { day: "2026-11-20", totals: claudeTotals },
      { day: "2026-11-21", totals: geminiTotals },
    ],
    providers: [
      { key: "claude", label: "Claude", totals: claudeTotals },
      { key: "gemini", label: "Gemini", totals: geminiTotals },
    ],
    models: [
      {
        key: "claude:work\x1fclaude-sonnet-4-6",
        label: "claude-sonnet-4-6 (Claude - work)",
        totals: claudeTotals,
      },
      {
        key: "gemini:default\x1fgemini-2.5-pro",
        label: "gemini-2.5-pro (Gemini - default)",
        totals: geminiTotals,
      },
    ],
    accounts: [],
    pricing: [],
    dayProviders: [
      { day: "2026-11-20", provider: "claude", totals: claudeTotals },
      { day: "2026-11-21", provider: "gemini", totals: geminiTotals },
    ],
    dayModels: [
      {
        day: "2026-11-20",
        model: "claude:work\x1fclaude-sonnet-4-6",
        totals: claudeTotals,
      },
      {
        day: "2026-11-21",
        model: "gemini:default\x1fgemini-2.5-pro",
        totals: geminiTotals,
      },
    ],
  };

  render(<CostHistory stats={stats} loading={false} locale="en" />);

  // Cache savings aside + Cost by type & Tokens by type share bars render in estimate mode.
  expect(screen.getByTestId("profile-cost-cache-savings").textContent).toContain("$1.60");
  expect(screen.getByRole("group", { name: "Cost by type" })).toBeTruthy();
  expect(screen.getByRole("group", { name: "Tokens by type" })).toBeTruthy();

  // Multi-provider chart draws curves/markers even on alternating active days.
  expect(screen.getByRole("img").querySelectorAll("path").length).toBeGreaterThanOrEqual(2);

  // Trend metric toggles between Cost and Tokens.
  fireEvent.click(screen.getByRole("tab", { name: "Tokens" }));
  expect(screen.getByRole("img", { name: "Daily recorded tokens." })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Cost" }));
  expect(
    screen.getByRole("img", { name: "Daily recorded cost; gaps may contain unpriced usage." }),
  ).toBeTruthy();

  // Clicking anywhere on a model row opens the model drill-down dialog with Per 1M tokens and Cache hit.
  const modelRow = screen
    .getByRole("button", { name: "claude-sonnet-4-6 (Claude - work)" })
    .closest("tr")!;
  fireEvent.click(modelRow);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Per 1M tokens")).toBeTruthy();
  expect(within(dialog).getByText("$3.10")).toBeTruthy();
  expect(within(dialog).getByText("Cache hit")).toBeTruthy();
  expect(within(dialog).getByText("29%")).toBeTruthy();
  // Inactive day on a fully-attributed date renders as $0.00 rather than Unknown.
  expect(within(dialog).getByText(/^2026-11-21: \$0\.00$/, { selector: "title" })).toBeTruthy();
});

it("handles pre-upgrade host payloads without optional dayProviders, dayModels, categoryCostUsd, or cacheSavingsUsd", () => {
  const stats = reportedStats(3.2, "EUR");
  stats.models.push({
    key: "claude:work\x1fclaude-sonnet-4-6",
    label: "claude-sonnet-4-6 (Claude - work)",
    totals: stats.totals,
  });
  render(<CostHistory stats={stats} loading={false} locale="en" />);
  expect(screen.queryByTestId("profile-cost-cache-savings")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "claude-sonnet-4-6 (Claude - work)" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getAllByText("€3.20").length).toBeGreaterThanOrEqual(1);
});

it("keeps noisy explanatory disclaimers tucked inside info icon tooltips until opened", () => {
  const stats = reportedStats(2, "USD");
  stats.totals.tokens = 1_000;
  stats.totals.categorizedTokens = 600;
  render(<CostHistory stats={stats} loading={false} locale="en" />);

  expect(screen.queryByText(/Categories cover/)).toBeNull();
  expect(screen.queryByText(/do not overlap/)).toBeNull();
  expect(screen.queryByText(/Unpriced tokens have neither/)).toBeNull();
  expect(screen.queryByText(/separate views of usage/)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "About recorded token categories" }));
  expect(screen.getByText(/Categories cover 600 of 1,000 retained tokens/)).toBeTruthy();
  expect(screen.getByText(/Reasoning is included in output/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "About cost breakdown" }));
  expect(
    screen.getByText("Unpriced tokens have neither a provider-reported cost nor an API estimate."),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "About subscription bill" }));
  expect(screen.getByText(/Estimates and provider-reported costs are separate views/)).toBeTruthy();
});
