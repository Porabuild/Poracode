import { useState } from "react";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/renderer/tailwind.css";
import { pushEscapeHandler } from "@/renderer/components/layout/overlayEscapeStack";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MultiSelect } from "./MultiSelect";

const layout = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/adaptiveLayout", () => ({
  isCompactLayoutViewport: () => layout.compact,
  useCompactLayout: () => layout.compact,
}));

const summary = "Working, Computer Use, Remote access";
const options = [
  { id: "working", label: "Working" },
  { id: "computer-use", label: "Computer Use" },
  { id: "remote-access", label: "Remote access" },
];

// The app-wide typecheck stubs the browser provider to avoid matcher conflicts.
async function browserInput() {
  return (await import("vitest/browser")) as unknown as {
    page: {
      elementLocator: (element: Element) => {
        hover: () => Promise<void>;
        click: () => Promise<void>;
      };
      getByRole: (role: string, options: { name: string }) => { click: () => Promise<void> };
    };
    userEvent: { keyboard: (keys: string) => Promise<void> };
  };
}

afterEach(() => {
  cleanup();
  layout.compact = false;
});

describe("MultiSelect trigger layout", () => {
  it.each([false, true])("truncates long summaries within the trigger (compact=%s)", (compact) => {
    layout.compact = compact;
    const { getByLabelText } = render(
      <MultiSelect
        aria-label="Prevent system sleep"
        className="w-[220px]"
        options={options}
        value={options.map((option) => option.id)}
        summary={summary}
        onChange={() => {}}
      />,
    );

    const trigger = getByLabelText("Prevent system sleep");
    const value = trigger.querySelector<HTMLElement>(".select__value");
    const indicator = trigger.querySelector<HTMLElement>(".select__indicator");
    if (!value || !indicator) throw new Error("Missing select value or indicator");

    expect(value.textContent).toBe(summary);
    expect(getComputedStyle(value).textOverflow).toBe("ellipsis");
    expect(value.scrollWidth).toBeGreaterThan(value.clientWidth);
    expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(
      indicator.getBoundingClientRect().left,
    );
  });

  it("shows the full summary when hovering the chevron and still opens the menu", async () => {
    const { page, userEvent } = await browserInput();
    function ControlledMultiSelect() {
      const [selected, setSelected] = useState(options.map((option) => option.id));
      const selectedSummary = options
        .filter((option) => selected.includes(option.id))
        .map((option) => option.label)
        .join(", ");
      return (
        <MultiSelect
          aria-label="Prevent system sleep"
          className="w-[220px]"
          options={options}
          value={selected}
          summary={selectedSummary}
          onChange={setSelected}
        />
      );
    }

    const { getByLabelText } = render(<ControlledMultiSelect />);
    const trigger = getByLabelText("Prevent system sleep");
    const indicator = trigger.querySelector(".select__indicator");
    if (!indicator) throw new Error("Missing select indicator");

    await page.elementLocator(document.body).hover();
    await page.elementLocator(indicator).hover();
    await vi.waitFor(() => {
      const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
      if (!tooltip) throw new Error("Missing tooltip");
      expect(tooltip.textContent).toBe(summary);
      expect(tooltip.scrollWidth).toBeLessThanOrEqual(tooltip.clientWidth);
      expect(tooltip.scrollHeight).toBeLessThanOrEqual(tooltip.clientHeight);
    });

    await page.elementLocator(trigger).click();
    await vi.waitFor(() => {
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
    });
    await page.getByRole("option", { name: "Remote access" }).click();
    expect(trigger.textContent).toBe("Working, Computer Use");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    await userEvent.keyboard("{Escape}");
    await page.elementLocator(document.body).hover();
    await page.elementLocator(indicator).hover();
    await vi.waitFor(() => {
      expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Working, Computer Use");
    });
  });

  it("dismisses a focused tooltip before the enclosing overlay", async () => {
    const { userEvent } = await browserInput();
    const closeOverlay = vi.fn<() => void>();
    const removeEscapeHandler = pushEscapeHandler(closeOverlay);
    try {
      const { getByLabelText } = render(
        <MultiSelect
          aria-label="Prevent system sleep"
          options={options}
          value={options.map((option) => option.id)}
          summary={summary}
          onChange={() => {}}
        />,
      );
      const trigger = getByLabelText("Prevent system sleep");
      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(trigger);
      await vi.waitFor(() => {
        expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(summary);
      });

      await userEvent.keyboard("{Escape}");
      await vi.waitFor(() => {
        expect(document.querySelector('[role="tooltip"]')).toBeNull();
      });
      expect(closeOverlay).not.toHaveBeenCalled();

      await userEvent.keyboard("{Escape}");
      expect(closeOverlay).toHaveBeenCalledOnce();
    } finally {
      removeEscapeHandler();
    }
  });

  it("dismisses a hovered tooltip before the overlay when focus is elsewhere", async () => {
    const { page, userEvent } = await browserInput();
    const closeOverlay = vi.fn<() => void>();
    const removeEscapeHandler = pushEscapeHandler(closeOverlay);
    try {
      const { getByLabelText, getByText } = render(
        <>
          <button type="button">Other control</button>
          <MultiSelect
            aria-label="Prevent system sleep"
            options={options}
            value={options.map((option) => option.id)}
            summary={summary}
            onChange={() => {}}
          />
        </>,
      );
      const otherControl = getByText("Other control");
      const indicator = getByLabelText("Prevent system sleep").querySelector(".select__indicator");
      if (!indicator) throw new Error("Missing select indicator");
      await page.elementLocator(otherControl).click();
      await page.elementLocator(indicator).hover();
      expect(document.activeElement).toBe(otherControl);
      await vi.waitFor(() => {
        expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(summary);
      });

      await userEvent.keyboard("{Escape}");
      await vi.waitFor(() => {
        expect(document.querySelector('[role="tooltip"]')).toBeNull();
      });
      expect(closeOverlay).not.toHaveBeenCalled();

      await userEvent.keyboard("{Escape}");
      expect(closeOverlay).toHaveBeenCalledOnce();
    } finally {
      removeEscapeHandler();
    }
  });

  it.each([false, true])("shows short and empty summaries in full (compact=%s)", (compact) => {
    layout.compact = compact;
    const { getByLabelText, rerender } = render(
      <MultiSelect
        aria-label="Prevent system sleep"
        className="w-[220px]"
        options={options}
        value={["working"]}
        summary="Working"
        onChange={() => {}}
      />,
    );
    const value =
      getByLabelText("Prevent system sleep").querySelector<HTMLElement>(".select__value");
    if (!value) throw new Error("Missing select value");
    expect(value.textContent).toBe("Working");
    expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth);

    rerender(
      <MultiSelect
        aria-label="Prevent system sleep"
        className="w-[220px]"
        options={options}
        value={[]}
        summary="Never"
        onChange={() => {}}
      />,
    );
    expect(value.textContent).toBe("Never");
    expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth);
  });
});
