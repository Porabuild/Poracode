import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/renderer/tailwind.css";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { applyAppTheme } from "@/renderer/theme/applyAppTheme";
import { contrastRatio, relativeLuminance, toHex } from "@/renderer/theme/colorMath";
import { APP_THEME_PRESETS } from "@/renderer/theme/themePresets";
import { readCompositedCssRgba, readCssRgba } from "@/renderer/testUtils/cssColor";
import { UsageProviderCard } from "./UsageProviderCard";

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({
    ref: () => {},
    handleRef: () => {},
    isDragging: false,
  }),
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: () => <span data-testid="provider-icon" />,
}));

vi.mock("@/renderer/components/providers/usageProviders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/components/providers/usageProviders")>()),
  browserSessionAddsDetails: () => false,
}));

vi.mock("@/renderer/components/providers/useProviderUsageRefresh", () => ({
  useProviderUsageRefresh: () => ({ refreshing: false, refresh: vi.fn<() => void>() }),
}));

vi.mock("@/renderer/components/providers/useUsageProviderLogin", () => ({
  useUsageProviderLogin: () => ({
    canBrowserSignIn: true,
    canApiKeySignIn: true,
    canSignOut: true,
    signingIn: false,
    signingOut: false,
    apiKey: "sk-test",
    setApiKey: vi.fn<(value: string) => void>(),
    handleSignIn: vi.fn<() => void>(),
    handleSubmitApiKey: vi.fn<() => void>(),
    handleSignOut: vi.fn<() => void>(),
  }),
}));

vi.mock("@/renderer/state/providerUsageStore", () => ({
  useProviderUsage: () => undefined,
}));

afterEach(cleanup);

function opaqueHex(css: string) {
  const [r, g, b, alpha] = readCssRgba(css);
  expect(alpha).toBe(255);
  return toHex([r, g, b]);
}

describe("UsageProviderCard theme styles", () => {
  it.each(["light", "dark"] as const)(
    "renders theme-aware ghost buttons aligned with the API key field in %s mode",
    (mode) => {
      const html = document.documentElement;
      const originalTheme = html.getAttribute("data-theme");
      html.setAttribute("data-theme", mode);
      try {
        const { container } = render(
          <UsageProviderCard
            id="qoder"
            label="Qoder"
            index={0}
            compact={false}
            collapsed={false}
            draggable={false}
            onToggleCollapse={vi.fn<(id: string) => void>()}
          />,
        );

        const card = container.querySelector<HTMLElement>('[data-usage-provider-id="qoder"]')!;
        const input = screen.getByLabelText("Qoder API key");
        const signInButton = screen.getByRole("button", { name: "Sign in" });
        const browserSignInButton = screen.getByRole("button", { name: "Browser sign-in" });

        // The Sign in button and adjacent API key input share the sm control height.
        expect(
          Math.abs(
            input.getBoundingClientRect().height - signInButton.getBoundingClientRect().height,
          ),
        ).toBeLessThanOrEqual(1);

        // Dense desktop header icon buttons keep their 20x20 footprint.
        const collapseIconButton = screen
          .getAllByRole("button", { name: "Collapse Qoder" })
          .find((button) => button.classList.contains("size-5"))!;
        expect(collapseIconButton).toBeDefined();
        for (const button of [
          screen.getByRole("button", { name: "Refresh Qoder" }),
          screen.getByRole("button", { name: "Sign out Qoder" }),
          collapseIconButton,
        ]) {
          const rect = button.getBoundingClientRect();
          expect(Math.round(rect.width)).toBe(20);
          expect(Math.round(rect.height)).toBe(20);
        }

        // Ghost buttons stay transparent at rest, use readable theme foreground text, and define a
        // translucent theme hover wash that steps away from the card fill in every preset.
        const direction = mode === "dark" ? 1 : -1;
        for (const { id } of APP_THEME_PRESETS) {
          applyAppTheme(html, mode, id);
          const cardBg = getComputedStyle(card).backgroundColor;
          const [cr, cg, cb] = readCssRgba(cardBg);
          const cardLum = relativeLuminance([cr, cg, cb]);
          const cardHex = opaqueHex(cardBg);

          for (const button of [signInButton, browserSignInButton]) {
            const style = getComputedStyle(button);
            const [, , , restAlpha] = readCssRgba(style.backgroundColor);
            expect(restAlpha).toBe(0);
            expect(contrastRatio(opaqueHex(style.color), cardHex)).toBeGreaterThanOrEqual(4.5);

            const hoverFill = style.getPropertyValue("--button-bg-hover").trim();
            const probe = document.createElement("div");
            probe.style.backgroundColor = hoverFill;
            button.append(probe);
            const hoverBg = getComputedStyle(probe).backgroundColor;
            probe.remove();

            const [, , , hoverAlpha] = readCssRgba(hoverBg);
            expect(hoverAlpha).toBeGreaterThan(0);
            expect(hoverAlpha).toBeLessThan(255);
            const [br, bg, bb] = readCompositedCssRgba(hoverBg, cardBg);
            expect((relativeLuminance([br, bg, bb]) - cardLum) * direction).toBeGreaterThan(0);
          }
        }
      } finally {
        applyAppTheme(html, "dark", "default");
        if (originalTheme === null) html.removeAttribute("data-theme");
        else html.setAttribute("data-theme", originalTheme);
      }
    },
  );
});
