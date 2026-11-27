import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { FindBar } from "./FindBar";

const base = {
  query: "needle",
  onQueryChange: vi.fn<(query: string) => void>(),
  caseSensitive: false,
  onToggleCaseSensitive: vi.fn<() => void>(),
  currentIndex: 0,
  onNext: vi.fn<() => void>(),
  onPrev: vi.fn<() => void>(),
  onClose: vi.fn<() => void>(),
};

describe("FindBar bounded result counter", () => {
  it("appends + only while a bounded result is capped", () => {
    const capped = render(<FindBar {...base} matchCount={250} matchCountCapped />);
    expect(screen.getByRole("search").textContent).toContain("250+");
    capped.unmount();

    render(<FindBar {...base} matchCount={250} />);
    expect(screen.getByRole("search").textContent).toContain("250");
    expect(screen.getByRole("search").textContent).not.toContain("250+");
  });
});
