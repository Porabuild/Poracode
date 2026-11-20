import { Button, Card, Input, Surface, TextArea } from "@heroui/react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "@/renderer/tailwind.css";
import { relativeLuminance } from "@/renderer/theme/colorMath";
import { readCompositedCssRgba, readCssRgba } from "@/renderer/testUtils/cssColor";
import { ContentSurface } from "./ContentSurface";

afterEach(cleanup);

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
