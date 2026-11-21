import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { messages } from "@/renderer/locales/en/messages.po";
import "@/renderer/tailwind.css";
import { readCompositedCssRgba, readCssRgba } from "@/renderer/testUtils/cssColor";
import { applyAppTheme } from "@/renderer/theme/applyAppTheme";
import { contrastRatio, toHex } from "@/renderer/theme/colorMath";
import { APP_THEME_PRESETS } from "@/renderer/theme/themePresets";
import type { UserInputOption } from "@/shared/contracts";
import type { OpenRuntimeRequest } from "@/renderer/state/slices/runtimeEventSlice";
import { ThreadRuntimeRequestPanel } from "./ThreadRuntimeRequestPanel";

// The app-wide typecheck stubs the browser provider to avoid matcher conflicts.
async function browserInput() {
  return (await import("vitest/browser")) as unknown as {
    page: {
      elementLocator: (element: Element) => {
        hover: () => Promise<void>;
      };
    };
  };
}

function hexOf(css: string) {
  const [red, green, blue, alpha] = readCssRgba(css);
  expect(alpha).toBe(255);
  return toHex([red, green, blue]);
}

function compositedHex(fgCss: string, bgCss: string, elementOpacity = 1) {
  const [fgR, fgG, fgB, fgA] = readCssRgba(fgCss);
  const effectiveAlpha = (fgA / 255) * elementOpacity;
  const [red, green, blue, alpha] = readCompositedCssRgba(
    `rgba(${fgR}, ${fgG}, ${fgB}, ${effectiveAlpha})`,
    bgCss,
  );
  expect(alpha).toBe(255);
  return toHex([red, green, blue]);
}

const i18n = setupI18n({ locale: "en", messages: { en: messages } });

afterEach(cleanup);

function renderRequest(width: number, options: UserInputOption[]) {
  const command = Array.from({ length: 60 }, (_, index) => `echo line ${index + 1}`).join("\n");
  const request: OpenRuntimeRequest = {
    requestId: "long-command",
    threadId: "thread",
    requestType: "command_execution_approval",
    payload: {
      summary: command,
      options,
    },
    receivedAt: new Date().toISOString(),
  };
  return render(
    <I18nProvider i18n={i18n}>
      <div data-testid="pane" style={{ width }}>
        <ThreadRuntimeRequestPanel
          threadId={request.threadId}
          request={request}
          onResolve={async () => undefined}
        />
      </div>
    </I18nProvider>,
  );
}

it("keeps permission actions over the scroller and clears the last line at both toolbar heights", async () => {
  const view = renderRequest(900, [
    { optionId: "allow", label: "Allow once" },
    { optionId: "always", label: "Allow for this project" },
    { optionId: "reject", label: "Reject" },
  ]);
  const pane = view.getByTestId("pane");
  const details = view.getByRole("region", { name: "Request details" });
  const text = within(details).getByText(/echo line 60/);
  const [first, second, last] = within(details).getAllByRole("button");

  await waitFor(() => {
    const bottom = details.getBoundingClientRect().bottom;
    expect(text.getBoundingClientRect().bottom).toBeGreaterThan(bottom);
    expect(first!.getBoundingClientRect().bottom).toBeLessThan(bottom);
    expect(first!.getBoundingClientRect().top).toBe(last!.getBoundingClientRect().top);
  });

  for (const width of [900, 260]) {
    pane.style.width = `${width}px`;
    details.scrollTop = 0;
    const viewport = details.getBoundingClientRect();
    const firstAction = first!.getBoundingClientRect();
    expect(viewport.width).toBeGreaterThan(width - 50);
    expect(firstAction.top).toBeGreaterThan(viewport.top);
    expect(last!.getBoundingClientRect().bottom).toBeLessThan(viewport.bottom);
    expect(last!.getBoundingClientRect().top > firstAction.top).toBe(width === 260);

    details.scrollTop = details.scrollHeight;
    expect(text.getBoundingClientRect().bottom).toBeLessThan(firstAction.top);
    expect(first!.getBoundingClientRect().top).toBe(firstAction.top);
    expect(second!.getBoundingClientRect().right).toBeLessThanOrEqual(viewport.right);
  }
});

it("keeps the end of the details and long lists of permission choices reachable", async () => {
  const view = renderRequest(
    260,
    Array.from({ length: 9 }, (_, index) => ({
      optionId: `scope-${index + 1}`,
      label: `Allow permission for scope ${index + 1}`,
    })),
  );
  const details = view.getByRole("region", { name: "Request details" });
  const text = within(details).getByText(/echo line 60/);
  const lastAction = within(details).getByRole("button", { name: "Allow permission for scope 9" });
  const toolbar = lastAction.closest<HTMLElement>(".poracode-floating-chrome--clear")!;
  await waitFor(() => {
    expect(toolbar.scrollHeight).toBeGreaterThan(toolbar.clientHeight);
    details.scrollTop = details.scrollHeight;
    expect(text.getBoundingClientRect().bottom).toBeLessThan(toolbar.getBoundingClientRect().top);
    expect(text.getBoundingClientRect().bottom).toBeGreaterThan(
      details.getBoundingClientRect().top,
    );
  });
  lastAction.focus();
  expect(toolbar.scrollTop).toBeGreaterThan(0);
  expect(lastAction.getBoundingClientRect().bottom).toBeLessThan(
    toolbar.getBoundingClientRect().bottom,
  );
});

it.each(["dark", "light"] as const)(
  "keeps question action backgrounds and Decline hover visible on the composer surface in %s mode",
  async (mode) => {
    const html = document.documentElement;
    const originalTheme = html.getAttribute("data-theme");
    const hadLight = html.classList.contains("light");
    const hadDark = html.classList.contains("dark");
    html.setAttribute("data-theme", mode);
    html.classList.toggle("light", mode === "light");
    html.classList.toggle("dark", mode === "dark");
    const { page } = await browserInput();
    const request: OpenRuntimeRequest = {
      requestId: "question-buttons",
      threadId: "thread",
      requestType: "tool_user_input",
      payload: {
        summary: "Questions",
        details: {
          acpElicitation: {
            mode: "form",
            message: "Clarify scope",
            requestedSchema: {
              type: "object",
              required: ["embedded", "sdks"],
              properties: {
                embedded: {
                  type: "array",
                  title: "Embedded projects",
                  description: "Which projects should be updated?",
                  minItems: 1,
                  items: { enum: ["OpenCode TUI", "Expo Device Hub"] },
                },
                sdks: {
                  type: "string",
                  title: "Agent SDKs",
                  enum: ["All", "None"],
                },
              },
            },
          },
        },
      },
      receivedAt: new Date().toISOString(),
    };

    try {
      const view = render(
        <I18nProvider i18n={i18n}>
          <style>{`*, *::before, *::after { transition-duration: 0s !important; }`}</style>
          <div data-testid="neutral-hover-parking" style={{ height: 20 }} />
          <div
            data-testid="composer-shell"
            className="poracode-composer-shell content-surface"
            style={{ width: 640 }}
          >
            <ThreadRuntimeRequestPanel
              threadId={request.threadId}
              request={request}
              onResolve={async () => undefined}
            />
          </div>
        </I18nProvider>,
      );

      const shell = view.getByTestId("composer-shell");
      const parking = view.getByTestId("neutral-hover-parking");
      const decline = view.getByRole("button", { name: "Decline" });
      const continueBtn = view.getByRole("button", { name: "Continue" });
      const firstOption = view.getByRole("option", { name: /OpenCode TUI/ });

      // Check disabled Continue + Decline rest/hover across every preset.
      expect(continueBtn.hasAttribute("disabled")).toBe(true);
      for (const { id } of APP_THEME_PRESETS) {
        applyAppTheme(html, mode, id);
        const composerBgCss = getComputedStyle(shell).backgroundColor;
        const composerHex = hexOf(composerBgCss);

        // Disabled Continue still reads as a filled button over the composer.
        const disabledStyle = getComputedStyle(continueBtn);
        const disabledBgHex = compositedHex(
          disabledStyle.backgroundColor,
          composerBgCss,
          Number(disabledStyle.opacity),
        );
        expect(
          contrastRatio(disabledBgHex, composerHex),
          `${id}/${mode} disabled Continue vs composer`,
        ).toBeGreaterThanOrEqual(1.11);

        // Decline is transparent at rest and clearly highlights on hover.
        await page.elementLocator(parking).hover();
        const restDeclineStyle = getComputedStyle(decline);
        expect(readCssRgba(restDeclineStyle.backgroundColor)[3]).toBe(0);
        const restDeclineColor = hexOf(restDeclineStyle.color);

        await page.elementLocator(decline).hover();
        const hoveredDeclineStyle = getComputedStyle(decline);
        const hoveredDeclineBg = compositedHex(hoveredDeclineStyle.backgroundColor, composerBgCss);
        expect(
          contrastRatio(hoveredDeclineBg, composerHex),
          `${id}/${mode} hovered Decline vs composer`,
        ).toBeGreaterThanOrEqual(1.18);
        expect(
          hexOf(hoveredDeclineStyle.color),
          `${id}/${mode} hovered Decline text brightens`,
        ).not.toBe(restDeclineColor);
      }

      // Select an option to enable Continue and verify enabled rest + hover contrast.
      await page.elementLocator(parking).hover();
      fireEvent.click(firstOption);
      expect(continueBtn.hasAttribute("disabled")).toBe(false);

      for (const { id } of APP_THEME_PRESETS) {
        applyAppTheme(html, mode, id);
        const composerBgCss = getComputedStyle(shell).backgroundColor;
        const composerHex = hexOf(composerBgCss);

        await page.elementLocator(parking).hover();
        const restStyle = getComputedStyle(continueBtn);
        const restBgHex = compositedHex(restStyle.backgroundColor, composerBgCss);
        expect(
          contrastRatio(restBgHex, composerHex),
          `${id}/${mode} enabled Continue vs composer`,
        ).toBeGreaterThanOrEqual(1.25);
        expect(
          contrastRatio(hexOf(restStyle.color), restBgHex),
          `${id}/${mode} enabled Continue label contrast`,
        ).toBeGreaterThanOrEqual(4.5);

        await page.elementLocator(continueBtn).hover();
        const hoverStyle = getComputedStyle(continueBtn);
        const hoverBgHex = compositedHex(hoverStyle.backgroundColor, composerBgCss);
        expect(
          contrastRatio(hoverBgHex, composerHex),
          `${id}/${mode} hovered Continue steps further than rest`,
        ).toBeGreaterThan(contrastRatio(restBgHex, composerHex));
      }
    } finally {
      applyAppTheme(html, mode, "default");
      html.classList.toggle("light", hadLight);
      html.classList.toggle("dark", hadDark);
      if (originalTheme === null) html.removeAttribute("data-theme");
      else html.setAttribute("data-theme", originalTheme);
    }
  },
);
