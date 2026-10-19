import { I18nProvider } from "@lingui/react";
import { act, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/renderer/i18n/i18n";
import { ChatTurnElapsedFooter } from "./ChatTurnElapsed";

describe("ChatTurnElapsedFooter", () => {
  afterEach(() => vi.useRealTimers());

  it("renders a live label before effects run", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider i18n={i18n}>
        <ChatTurnElapsedFooter turn={{ startedAt: 1_000, endedAt: null }} />
      </I18nProvider>,
    );

    expect(markup).toContain("Working…");
  });

  it("keeps a label while a new turn pauses before its first timer tick", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const view = (isPaused: boolean) => (
      <I18nProvider i18n={i18n}>
        <ChatTurnElapsedFooter turn={{ startedAt: 1_000, endedAt: null }} isPaused={isPaused} />
      </I18nProvider>
    );
    const { rerender } = render(view(false));
    expect(screen.getByText("Working…")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(view(true));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("Working…")).toHaveClass("text-muted");

    rerender(view(false));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("Working for 1s")).toBeInTheDocument();
  });

  it("renders a completed duration in the same commit", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider i18n={i18n}>
        <ChatTurnElapsedFooter turn={{ startedAt: 1_000, endedAt: 215_000 }} />
      </I18nProvider>,
    );

    expect(markup).toContain("Worked for 3m 34s");
  });
});
