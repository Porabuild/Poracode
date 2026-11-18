import { Input, Label, Modal, TextArea } from "@heroui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "@/renderer/tailwind.css";
import { applyAppTheme } from "@/renderer/theme/applyAppTheme";
import { contrastRatio, toHex } from "@/renderer/theme/colorMath";
import { installKeyboardFieldFocus } from "@/renderer/theme/keyboardFieldFocus";
import { APP_THEME_PRESETS } from "@/renderer/theme/themePresets";
import { ToggleSwitch } from "./ToggleSwitch";

const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;

// Chromium resolves colors to several CSS Color 4 formats. Read the painted sRGB pixel.
function color(css: string) {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = css;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  expect(alpha).toBe(255);
  return toHex([red!, green!, blue!]);
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
    const name = view.getByLabelText("Name");
    const details = view.getByLabelText("Details");
    const label = view.getByText("Name");
    const track = dialog.querySelector(".switch__control")!;
    const thumb = dialog.querySelector(".switch__thumb")!;
    for (const { id } of APP_THEME_PRESETS) {
      applyAppTheme(html, mode, id);
      const background = color(getComputedStyle(dialog).backgroundColor);
      expect(
        contrastRatio(color(getComputedStyle(label).color), background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(
          color(getComputedStyle(track).backgroundColor),
          color(getComputedStyle(thumb).backgroundColor),
        ),
      ).toBeGreaterThanOrEqual(3);
      for (const field of [name, details]) {
        const style = getComputedStyle(field);
        expect(style.borderBottomWidth).toBe("0px");
        expect(style.boxShadow).toBe("none");
        expect(
          contrastRatio(
            color(getComputedStyle(field, "::placeholder").color),
            color(style.backgroundColor),
          ),
        ).toBeGreaterThanOrEqual(4.5);
        fireEvent.pointerDown(field);
        field.focus();
        expect(document.activeElement).toBe(field);
        expect(style.outlineStyle).toBe("solid");
        expect(style.outlineWidth).toBe("1px");
        expect(style.outlineOffset).toBe("-1px");
        expect(style.boxShadow).toBe("none");
        fireEvent.keyDown(window, { key: "Tab" });
        field.focus();
        expect(style.outlineWidth).toBe("1px");
        const keyboardEdge = color(style.outlineColor);
        expect(contrastRatio(keyboardEdge, background)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(keyboardEdge, color(style.backgroundColor))).toBeGreaterThanOrEqual(3);
      }
    }
  } finally {
    removeKeyboardFieldFocus();
    applyAppTheme(html, mode, "default");
    if (original === null) html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", original);
  }
});
