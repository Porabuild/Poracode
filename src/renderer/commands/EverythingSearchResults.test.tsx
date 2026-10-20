import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/renderer/i18n/i18n";
import { createSearchQuery } from "@/shared/searchMatching";
import { EverythingSearchResults } from "./EverythingSearchResults";
import type { EverythingSearchResult, EverythingSearchSection } from "./everythingSearchSections";

vi.mock("@heroui/react", () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock("./EverythingSearchResultRow", () => ({
  EverythingSearchResultRow: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div role="option" aria-selected="false">
      {title} {subtitle}
    </div>
  ),
  EverythingSearchThreadRow: () => null,
}));

function messages(count: number): EverythingSearchSection[] {
  return [
    {
      category: "messages",
      label: "Messages",
      total: count,
      results: Array.from({ length: count }, (_, index) => ({
        kind: "message",
        key: `message-${index}`,
        score: 100,
        hit: {
          threadId: "saved",
          itemId: `message-${index}`,
          projectId: "project",
          title: "Saved conversation",
          projectName: "Project",
          archived: false,
          role: "user",
          excerpt: `needle context ${index}`,
          source: { kind: "managed", activationSeq: 1 },
          sourceLabel: "",
          key: `message-${index}`,
        },
      })),
    },
  ];
}

function mount(overrides: Partial<Parameters<typeof EverythingSearchResults>[0]> = {}) {
  return render(
    <I18nProvider i18n={i18n}>
      <EverythingSearchResults
        sections={messages(0)}
        query={createSearchQuery("needle")}
        activeIndex={0}
        loading={false}
        failed={false}
        messagesFailed={false}
        messagesHaveMore={false}
        emptyMessage={undefined}
        onRetry={vi.fn<() => void>()}
        onActivate={vi.fn<(result: EverythingSearchResult) => void>()}
        onHover={vi.fn<(index: number) => void>()}
        {...overrides}
      />
    </I18nProvider>,
  );
}

describe("saved message result states", () => {
  it("shows a successful empty query but does not suggest different keywords after a refusal", () => {
    const view = mount();
    expect(screen.getByText("No results")).toBeTruthy();
    view.unmount();
    mount({ messagesFailed: true });
    expect(screen.queryByText("No results")).toBeNull();
    expect(screen.queryByText("Try different keywords or choose a category.")).toBeNull();
  });

  it("retains successful host excerpts when another host fails", () => {
    mount({ sections: messages(1), messagesFailed: true });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText(/needle context 0/)).toBeTruthy();
  });

  it("discloses truncation at 200 when a saved-message continuation remains", () => {
    mount({ sections: messages(200), messagesHaveMore: true });
    expect(screen.getAllByRole("option")).toHaveLength(200);
    expect(screen.getByText("200+")).toBeTruthy();
    expect(screen.getByText(/Showing the first 200 results/)).toBeTruthy();
  });

  it.each([55, 200])("does not claim truncation for %s complete results", (count) => {
    mount({ sections: messages(count) });
    expect(screen.getAllByRole("option")).toHaveLength(count);
    expect(screen.queryByText(/Showing the first 200 results/)).toBeNull();
  });
});
