import { Button, Card, Input, Surface, TextArea } from "@heroui/react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "@/renderer/tailwind.css";
import { applyAppTheme } from "@/renderer/theme/applyAppTheme";
import { contrastRatio, relativeLuminance, toHex } from "@/renderer/theme/colorMath";
import { APP_THEME_PRESETS } from "@/renderer/theme/themePresets";
import { readCompositedCssRgba, readCssRgba } from "@/renderer/testUtils/cssColor";
import { ContentSurface } from "./ContentSurface";

afterEach(cleanup);

function compositedHex(fgCss: string, bgCss: string) {
  const [red, green, blue, alpha] = readCompositedCssRgba(fgCss, bgCss);
  expect(alpha).toBe(255);
  return toHex([red, green, blue]);
}

function hexOf(css: string) {
  const [red, green, blue, alpha] = readCssRgba(css);
  expect(alpha).toBe(255);
  return toHex([red, green, blue]);
}

it.each(["light", "dark"] as const)(
  "shares the flat material across content roots in %s mode",
  (theme) => {
    const html = document.documentElement;
    const previousTheme = html.getAttribute("data-theme");
    html.setAttribute("data-theme", theme);
    try {
      const { getByText, getByLabelText, getByTestId } = render(
        <>
          <div data-testid="plain-canvas" style={{ backgroundColor: "var(--content-background)" }}>
            <Input aria-label="Plain field" />
            <TextArea aria-label="Plain secondary field" variant="secondary" />
          </div>
          <ContentSurface>
            Panel
            <Input aria-label="Surface field" />
            <Button
              aria-label="Field picker button"
              variant="tertiary"
              className="form-field w-full justify-start"
            >
              Choose a folder
            </Button>
          </ContentSurface>
          <ContentSurface variant="row">Row</ContentSurface>
          <ContentSurface variant="group" aria-label="Row group">
            <div>First</div>
            <div>Last</div>
          </ContentSurface>
          <Card>
            Catalog
            <TextArea aria-label="Card field" variant="secondary" />
          </Card>
          <Surface variant="secondary" className="content-surface">
            Group
          </Surface>
          <div className="poracode-composer-shell content-surface">
            Composer
            <Input aria-label="Composer nested field" />
            <Button aria-label="Send enabled" className="poracode-composer-send">
              Send
            </Button>
            <Button aria-label="Send disabled" className="poracode-composer-send" isDisabled>
              Send
            </Button>
          </div>
          <div style={{ backgroundColor: "var(--field-background)" }}>Editable wash</div>
          <div style={{ backgroundColor: "var(--accent)" }}>Accent fill</div>
          <div style={{ border: "1px solid var(--hairline-soft)" }}>Theme edge</div>
        </>,
      );
      const style = (name: string) => getComputedStyle(getByText(name));
      for (const name of ["Panel", "Catalog", "Group", "Row", "Composer"]) {
        expect(style(name).borderRadius).toBe("8px");
        expect(style(name).borderTopWidth).toBe("1px");
        expect(style(name).borderTopColor).toBe(style("Theme edge").borderTopColor);
        expect(style(name).boxShadow).toBe("none");
      }
      expect(getComputedStyle(getByLabelText("Row group")).borderRadius).toBe("8px");
      expect(style("First").borderBottomWidth).toBe("1px");
      expect(style("First").borderBottomColor).toBe(style("Theme edge").borderTopColor);
      expect(style("Last").borderBottomWidth).toBe("0px");
      expect(style("Group").backgroundColor).toBe(style("Panel").backgroundColor);
      expect(style("Catalog").backgroundColor).toBe(style("Panel").backgroundColor);
      expect(style("Row").backgroundColor).toBe(style("Panel").backgroundColor);
      // Main composer on the plain canvas matches cards and user messages (opaque).
      expect(style("Composer").backgroundColor).toBe(style("Panel").backgroundColor);
      expect(readCssRgba(style("Composer").backgroundColor)[3]).toBe(255);

      // Editable fields use a translucent wash that automatically composites over any surface.
      const wash = style("Editable wash").backgroundColor;
      const [, , , washAlpha] = readCssRgba(wash);
      expect(washAlpha).toBeGreaterThan(0);
      expect(washAlpha).toBeLessThan(255);

      for (const name of [
        "Plain field",
        "Plain secondary field",
        "Surface field",
        "Field picker button",
        "Card field",
        "Composer nested field",
      ]) {
        expect(getComputedStyle(getByLabelText(name)).backgroundColor).toBe(wash);
      }

      // Composer send button uses solid accent when enabled and stays full-opacity neutral when disabled.
      expect(getComputedStyle(getByLabelText("Send enabled")).backgroundColor).toBe(
        style("Accent fill").backgroundColor,
      );
      const disabledSend = getComputedStyle(getByLabelText("Send disabled"));
      expect(Number(disabledSend.opacity)).toBe(1);
      expect(disabledSend.backgroundColor).not.toBe(style("Composer").backgroundColor);

      const canvasBg = getComputedStyle(getByTestId("plain-canvas")).backgroundColor;
      const panelBg = style("Panel").backgroundColor;
      const [cr, cg, cb] = readCompositedCssRgba(wash, canvasBg);
      const [pr, pg, pb] = readCompositedCssRgba(wash, panelBg);
      const [br, bg, bb] = readCssRgba(panelBg);
      const plainLum = relativeLuminance([cr, cg, cb]);
      const panelFieldLum = relativeLuminance([pr, pg, pb]);
      const panelLum = relativeLuminance([br, bg, bb]);
      // On raised surfaces, the composited field steps brighter (dark) or darker (light)
      // than both the plain-canvas field and the raised container itself.
      const direction = theme === "dark" ? 1 : -1;
      expect((panelFieldLum - plainLum) * direction).toBeGreaterThan(0);
      expect((panelFieldLum - panelLum) * direction).toBeGreaterThan(0);
    } finally {
      if (previousTheme === null) html.removeAttribute("data-theme");
      else html.setAttribute("data-theme", previousTheme);
    }
  },
);

it.each(["light", "dark"] as const)(
  "separates mention, slash, file path, and attachment badges from composer and user message surfaces across all themes in %s mode",
  (mode) => {
    const html = document.documentElement;
    const previousTheme = html.getAttribute("data-theme");
    const hadLight = html.classList.contains("light");
    const hadDark = html.classList.contains("dark");
    html.setAttribute("data-theme", mode);
    html.classList.toggle("light", mode === "light");
    html.classList.toggle("dark", mode === "dark");
    try {
      const view = render(
        <>
          <div data-testid="composer" className="poracode-composer-shell content-surface">
            <span data-testid="composer-mention" className="poracode-mention-chip">
              file.ts
            </span>
            <span data-testid="composer-slash" className="poracode-slash-chip">
              /goal
            </span>
            <span data-testid="composer-attachment" className="poracode-attachment-chip">
              spec.pdf
            </span>
          </div>
          <ContentSurface
            data-testid="user-message"
            variant="row"
            className="poracode-user-message-inline-content"
          >
            <button
              type="button"
              data-testid="message-thread-chip"
              className="poracode-slash-chip poracode-thread-mention-chip"
            >
              Thread mention
            </button>
            <button
              type="button"
              data-testid="message-path-chip"
              className="poracode-inline-path-chip"
            >
              src/index.ts
            </button>
          </ContentSurface>
        </>,
      );

      const composer = view.getByTestId("composer");
      const userMessage = view.getByTestId("user-message");
      const badges = [
        [view.getByTestId("composer-mention"), composer, "composer mention"],
        [view.getByTestId("composer-slash"), composer, "composer slash"],
        [view.getByTestId("composer-attachment"), composer, "composer attachment"],
        [view.getByTestId("message-thread-chip"), userMessage, "user-message thread mention"],
        [view.getByTestId("message-path-chip"), userMessage, "user-message inline path"],
      ] as const;

      for (const { id } of APP_THEME_PRESETS) {
        applyAppTheme(html, mode, id);
        for (const [badge, surface, label] of badges) {
          const surfaceBgCss = getComputedStyle(surface).backgroundColor;
          const surfaceHex = hexOf(surfaceBgCss);
          const badgeStyle = getComputedStyle(badge);
          const [, , , badgeAlpha] = readCssRgba(badgeStyle.backgroundColor);
          // Translucent accent tint adapts over whatever surface hosts the badge.
          expect(badgeAlpha, `${id}/${mode} ${label} alpha`).toBeGreaterThan(0);
          expect(badgeAlpha, `${id}/${mode} ${label} alpha`).toBeLessThan(255);
          const paintedBadgeHex = compositedHex(badgeStyle.backgroundColor, surfaceBgCss);
          expect(
            contrastRatio(paintedBadgeHex, surfaceHex),
            `${id}/${mode} ${label} vs surface`,
          ).toBeGreaterThanOrEqual(1.11);
          expect(
            contrastRatio(hexOf(badgeStyle.color), paintedBadgeHex),
            `${id}/${mode} ${label} text contrast`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    } finally {
      applyAppTheme(html, mode, "default");
      html.classList.toggle("light", hadLight);
      html.classList.toggle("dark", hadDark);
      if (previousTheme === null) html.removeAttribute("data-theme");
      else html.setAttribute("data-theme", previousTheme);
    }
  },
);
