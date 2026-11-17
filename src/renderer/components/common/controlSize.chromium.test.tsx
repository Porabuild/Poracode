import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@/renderer/tailwind.css";
import { Button } from "./Button";
import { Input } from "./Input";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-compact-layout");
});

describe("shared input and button sizes", () => {
  it.each([
    { viewport: 390, compact: false, heights: [36, 40, 44] },
    { viewport: 700, compact: false, heights: [36, 40, 44] },
    { viewport: 1280, compact: false, heights: [32, 36, 40] },
    { viewport: 390, compact: true, heights: [44, 44, 44] },
  ])(
    "keeps each size aligned at $viewport px (compact: $compact)",
    async ({ viewport, compact, heights }) => {
      const { page } = (await import("vitest/browser")) as unknown as {
        page: { viewport: (width: number, height: number) => Promise<void> };
      };
      await page.viewport(viewport, 800);
      document.documentElement.toggleAttribute("data-compact-layout", compact);

      render(
        <div>
          <Input aria-label="Small input" size="sm" />
          <Button size="sm">Small action</Button>
          <Input aria-label="Default input" />
          <Button>Default action</Button>
          <Input aria-label="Large input" size="lg" />
          <Button size="lg">Large action</Button>
          <Input aria-label="Column width" size={12} />
        </div>,
      );

      for (const [index, label] of ["Small", "Default", "Large"].entries()) {
        const height = heights[index];
        expect(
          screen.getByRole("textbox", { name: `${label} input` }).getBoundingClientRect().height,
        ).toBe(height);
        expect(
          screen.getByRole("button", { name: `${label} action` }).getBoundingClientRect().height,
        ).toBe(height);
      }
      expect(screen.getByRole("textbox", { name: "Column width" }).getAttribute("size")).toBe("12");
    },
  );
});
