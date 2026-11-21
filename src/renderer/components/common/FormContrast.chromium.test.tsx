import { Input, Label, Modal, TextArea } from "@heroui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "@/renderer/tailwind.css";
import { applyAppTheme } from "@/renderer/theme/applyAppTheme";
import { contrastRatio, toHex } from "@/renderer/theme/colorMath";
import { installKeyboardFieldFocus } from "@/renderer/theme/keyboardFieldFocus";
import { APP_THEME_PRESETS } from "@/renderer/theme/themePresets";
import { readCompositedCssRgba, readCssRgba } from "@/renderer/testUtils/cssColor";
import { ContentSurface } from "./ContentSurface";
import { ToggleSwitch } from "./ToggleSwitch";

function color(css: string) {
  const [red, green, blue, alpha] = readCssRgba(css);
  expect(alpha).toBe(255);
  return toHex([red, green, blue]);
}

function compositedColor(fgCss: string, bgCss: string) {
  const [red, green, blue, alpha] = readCompositedCssRgba(fgCss, bgCss);
  expect(alpha).toBe(255);
  return toHex([red, green, blue]);
}

afterEach(cleanup);

it.each(["light", "dark"] as const)("distinguishes editable fields in %s dialogs", async (mode) => {
  const html = document.documentElement;
  const original = html.getAttribute("data-theme");
  html.setAttribute("data-theme", mode);
  const removeKeyboardFieldFocus = installKeyboardFieldFocus();
  try {
    const view = render(
      <>
        <style>{`*, *::before, *::after { transition-duration: 0s !important; }`}</style>
        <div data-testid="plain-canvas" style={{ backgroundColor: "var(--content-background)" }}>
          <Input aria-label="Canvas field" placeholder="Canvas" />
          <ContentSurface data-testid="raised-panel">
            <Input aria-label="Panel field" placeholder="Panel" />
          </ContentSurface>
        </div>
        <Modal.Backdrop isOpen>
          <Modal.Container>
            <Modal.Dialog aria-label="Preferences">
              <Label className="text-muted" htmlFor="contrast-name">
                Name
              </Label>
              <Input id="contrast-name" placeholder="Your name" />
              <TextArea aria-label="Details" variant="secondary" placeholder="Details" />
              <ToggleSwitch aria-label="Notifications" isSelected={false} />
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </>,
    );
    const dialog = await view.findByRole("dialog");
    const canvas = view.getByTestId("plain-canvas");
    const raisedPanel = view.getByTestId("raised-panel");
    const canvasField = view.getByLabelText("Canvas field");
    const panelField = view.getByLabelText("Panel field");
    const name = view.getByLabelText("Name");
    const details = view.getByLabelText("Details");
    const label = view.getByText("Name");
    const track = dialog.querySelector(".switch__control")!;
    const thumb = dialog.querySelector(".switch__thumb")!;
    for (const { id } of APP_THEME_PRESETS) {
      applyAppTheme(html, mode, id);
      const dialogBgCss = getComputedStyle(dialog).backgroundColor;
      const background = color(dialogBgCss);
      expect(
        contrastRatio(color(getComputedStyle(label).color), background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(
          color(getComputedStyle(track).backgroundColor),
          color(getComputedStyle(thumb).backgroundColor),
        ),
      ).toBeGreaterThanOrEqual(3);

      // The translucent field wash adapts automatically over both plain canvas and raised surfaces.
      const canvasBgCss = getComputedStyle(canvas).backgroundColor;
      const panelBgCss = getComputedStyle(raisedPanel).backgroundColor;
      const canvasFieldPainted = compositedColor(
        getComputedStyle(canvasField).backgroundColor,
        canvasBgCss,
      );
      const panelFieldPainted = compositedColor(
        getComputedStyle(panelField).backgroundColor,
        panelBgCss,
      );
      expect(canvasFieldPainted).not.toBe(color(canvasBgCss));
      expect(panelFieldPainted).not.toBe(color(panelBgCss));
      expect(
        contrastRatio(
          color(getComputedStyle(canvasField, "::placeholder").color),
          canvasFieldPainted,
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(
          color(getComputedStyle(panelField, "::placeholder").color),
          panelFieldPainted,
        ),
      ).toBeGreaterThanOrEqual(4.5);

      for (const field of [name, details]) {
        const style = getComputedStyle(field);
        const paintedField = compositedColor(style.backgroundColor, dialogBgCss);
        expect(paintedField).not.toBe(background);
        expect(style.borderBottomWidth).toBe("0px");
        expect(style.boxShadow).toBe("none");
        expect(
          contrastRatio(color(getComputedStyle(field, "::placeholder").color), paintedField),
        ).toBeGreaterThanOrEqual(4.5);
        fireEvent.pointerDown(field);
        field.focus();
        expect(document.activeElement).toBe(field);
        expect(style.outlineStyle).toBe("none");
        expect(style.boxShadow).toBe("none");
        fireEvent.keyDown(window, { key: "Tab" });
        field.focus();
        expect(style.outlineStyle).toBe("solid");
        expect(style.outlineWidth).toBe("1px");
        expect(style.outlineOffset).toBe("-1px");
        const [, , , focusAlpha] = readCssRgba(style.outlineColor);
        expect(focusAlpha).toBeGreaterThan(40);
        expect(focusAlpha).toBeLessThan(128);
        fireEvent.pointerDown(field);
        expect(style.outlineStyle).toBe("none");
      }
    }
  } finally {
    removeKeyboardFieldFocus();
    applyAppTheme(html, mode, "default");
    if (original === null) html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", original);
  }
});
