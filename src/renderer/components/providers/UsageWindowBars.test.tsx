import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { UsageWindow } from "@poracode/agents-usage/types";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { UsageWindowBars } from "./UsageWindowBars";

afterEach(cleanup);

function focusViaKeyboard(element: Element) {
  // React Aria tooltips open on focus only when the active interaction modality is keyboard.
  fireEvent.keyDown(document.body, { key: "Tab" });
  act(() => {
    (element as HTMLElement).focus();
  });
}

describe("UsageWindowBars", () => {
  it("renders a breakdown hover/focus tooltip with share percentages for additive models", async () => {
    const windows: UsageWindow[] = [
      {
        id: "cursor-auto",
        label: "Cursor Models",
        usedPercent: 67.41,
        unit: "percent",
        currency: "USD",
        used: 706.77,
        breakdown: [
          { label: "model-fast", used: 400, currency: "USD", tokens: 264_161_359 },
          { label: "model-std", used: 100, currency: "USD", tokens: 148_467_181 },
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
        breakdown: [
          { label: "api-high", used: 105.78, currency: "USD", tokens: 208_471_207 },
          { label: "api-med", used: 58.84, currency: "USD", tokens: 109_124_165 },
        ],
      },
      {
        id: "extra-usage",
        label: "On-demand",
        usedPercent: 97.18,
        unit: "usd",
        currency: "USD",
        used: 1020.42,
        limit: 1050,
        breakdown: [
          { label: "Personal", used: 1020.42, currency: "USD" },
          { label: "Team pooled", used: 1051.85, limit: 1050, currency: "USD" },
        ],
      },
    ];

    render(<UsageWindowBars windows={windows} showReset={false} showPace={false} />);

    const autoTrigger = screen.getByText("Cursor Models").closest("[tabindex='0']");
    expect(autoTrigger).not.toBeNull();

    focusViaKeyboard(autoTrigger!);
    const autoTooltip = await screen.findByRole("tooltip");
    expect(autoTooltip).toHaveTextContent("model-fast");
    expect(autoTooltip).toHaveTextContent("80%");
    expect(autoTooltip).toHaveTextContent("model-std");
    expect(autoTooltip).toHaveTextContent("20%");
    expect(autoTooltip).not.toHaveTextContent("api-high");

    const apiTrigger = screen.getByText("API").closest("[tabindex='0']");
    expect(apiTrigger).not.toBeNull();
    focusViaKeyboard(apiTrigger!);
    const apiTooltip = await screen.findByRole("tooltip");
    expect(apiTooltip).toHaveTextContent("api-high");
    expect(apiTooltip).toHaveTextContent("api-med");

    // Non-additive limit breakdown omits share percentages.
    const extraTrigger = screen.getByText("On-demand").closest("[tabindex='0']");
    expect(extraTrigger).not.toBeNull();
    focusViaKeyboard(extraTrigger!);
    const extraTooltip = await screen.findByRole("tooltip");
    expect(extraTooltip).toHaveTextContent("Personal");
    expect(extraTooltip).toHaveTextContent("Team pooled");
    expect(extraTooltip).not.toHaveTextContent("%");
  });

  it("toggles breakdown tooltip on click/tap without nesting progressbar inside a button", async () => {
    const windows: UsageWindow[] = [
      {
        id: "cursor-auto",
        label: "Cursor Models",
        usedPercent: 50,
        unit: "percent",
        currency: "USD",
        used: 100,
        breakdown: [{ label: "model-fast", used: 100, currency: "USD", tokens: 10_000_000 }],
      },
    ];

    render(<UsageWindowBars windows={windows} showReset={false} showPace={false} />);

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar.closest("[role='button']")).toBeNull();

    const trigger = screen.getByText("Cursor Models").closest("[tabindex='0']")!;
    expect(trigger).toHaveAttribute("role", "group");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("model-fast");

    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("formats non-monetary breakdowns as plain counts and tolerates duplicate labels", async () => {
    const windows: UsageWindow[] = [
      {
        id: "credits-pool",
        label: "Credits",
        usedPercent: 40,
        unit: "credits",
        used: 400,
        limit: 1000,
        breakdown: [
          { label: "Fast tier", used: 250 },
          { label: "Fast tier", used: 150 },
        ],
      },
    ];

    render(<UsageWindowBars windows={windows} showReset={false} showPace={false} />);
    const trigger = screen.getByText("Credits").closest("[tabindex='0']")!;
    fireEvent.click(trigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("250");
    expect(tooltip).toHaveTextContent("150");
    expect(tooltip.textContent).not.toContain("$");
  });

  it("summarizes overflow when a window has more than 8 breakdown items", async () => {
    const breakdown = Array.from({ length: 10 }, (_, idx) => ({
      label: `model-${idx + 1}`,
      used: 10 - idx,
      currency: "USD",
      tokens: 1_000_000,
    }));
    const windows: UsageWindow[] = [
      {
        id: "cursor-auto",
        label: "Cursor Models",
        usedPercent: 50,
        unit: "percent",
        currency: "USD",
        used: 55,
        breakdown,
      },
    ];

    render(<UsageWindowBars windows={windows} showReset={false} showPace={false} />);
    const trigger = screen.getByText("Cursor Models").closest("[tabindex='0']")!;
    focusViaKeyboard(trigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("model-1");
    expect(tooltip).toHaveTextContent("model-8");
    expect(tooltip).toHaveTextContent("+2 more");
    expect(tooltip).not.toHaveTextContent("model-9");
  });

  it("keeps windows without breakdown non-interactive", () => {
    const windows: UsageWindow[] = [
      {
        id: "session-5h",
        label: "Session (5h)",
        usedPercent: 40,
        unit: "percent",
      },
    ];
    render(<UsageWindowBars windows={windows} showReset={false} showPace={false} />);
    expect(screen.getByText("Session (5h)").closest("[tabindex='0']")).toBeNull();
  });
});
