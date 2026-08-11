import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { i18n } from "@/renderer/i18n/i18n";
import { ChatTurnElapsedFooter } from "./ChatTurnElapsed";

describe("ChatTurnElapsedFooter", () => {
  it("renders a completed duration in the same commit", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider i18n={i18n}>
        <ChatTurnElapsedFooter turn={{ startedAt: 1_000, endedAt: 215_000 }} />
      </I18nProvider>,
    );

    expect(markup).toContain("Worked for 3m 34s");
  });
});
