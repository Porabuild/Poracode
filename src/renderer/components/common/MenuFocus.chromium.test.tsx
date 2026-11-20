import { useRef, useState } from "react";
import {
  ColorField,
  ComboBox,
  Dropdown,
  Input,
  ListBox,
  NumberField,
  SearchField,
} from "@heroui/react";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/renderer/tailwind.css";
import { readCssRgba } from "@/renderer/testUtils/cssColor";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { installKeyboardFieldFocus } from "@/renderer/theme/keyboardFieldFocus";
import { Button } from "./Button";
import { MultiSelect } from "./MultiSelect";
import { OptionMenu } from "./OptionMenu";
import { ModelMenuSearchInput } from "./ProviderModelMenu/parts/ModelMenuSearchInput";
import { useMenuSearchAutofocus } from "./ProviderModelMenu/parts/useMenuSearchAutofocus";
import { ResponsiveMenuSurface } from "./ResponsiveMenuSurface";
import { Select } from "./Select";

vi.mock("@/renderer/adaptiveLayout", () => ({
  isCompactLayoutViewport: () => false,
  useCompactLayout: () => false,
}));

// The app-wide typecheck stubs the browser provider to avoid matcher conflicts.
async function browserInput() {
  return (await import("vitest/browser")) as unknown as {
    page: {
      elementLocator: (element: Element) => {
        click: (options?: { button?: "left" | "right" | "middle" }) => Promise<void>;
      };
    };
    userEvent: { keyboard: (keys: string) => Promise<void> };
  };
}

function parseAlpha(cssColor: string): number {
  return readCssRgba(cssColor)[3] / 255;
}

function shadowLayerColor(layer: string): string | null {
  const fnMatch = layer.match(/(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)/);
  if (fnMatch) return fnMatch[0];
  if (/\btransparent\b/.test(layer)) return "transparent";
  return null;
}

function hasVisibleShadow(boxShadow: string): boolean {
  if (!boxShadow || boxShadow === "none") return false;
  // Tailwind composes zero-width or transparent ring variables into a box-shadow
  // list; reject only layers that paint a non-zero spread/blur with non-zero alpha.
  return boxShadow.split(/,(?![^(]*\))/).some((layer) => {
    const hasExtent = /\b[1-9]\d*(?:\.\d+)?px\b|\b0?\.[1-9]\d*px\b/.test(layer);
    if (!hasExtent) return false;
    const color = shadowLayerColor(layer);
    return color === null || parseAlpha(color) > 0;
  });
}

function hasVisibleOutline(style: CSSStyleDeclaration): boolean {
  return (
    style.outlineStyle !== "none" &&
    Number.parseFloat(style.outlineWidth) > 0 &&
    parseAlpha(style.outlineColor) > 0
  );
}

function expectNoFocusRingOn(element: Element) {
  const style = getComputedStyle(element);
  expect(
    {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      outline: hasVisibleOutline(style)
        ? `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`
        : "none",
      boxShadow: hasVisibleShadow(style.boxShadow) ? style.boxShadow : "none",
    },
    `Unexpected focus ring on <${element.tagName.toLowerCase()}>`,
  ).toEqual({
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute("role"),
    outline: "none",
    boxShadow: "none",
  });
}

function expectNoFocusRingIn(root: ParentNode) {
  for (const element of root.querySelectorAll("*")) {
    expectNoFocusRingOn(element);
  }
}

afterEach(cleanup);

describe("menu open focus rings", () => {
  it("does not paint focus rings when opening menus without Tab navigation", async () => {
    const removeKeyboardFocus = installKeyboardFieldFocus();
    const { page, userEvent } = await browserInput();
    try {
      function Fixture() {
        const [modelOpen, setModelOpen] = useState(false);
        const [query, setQuery] = useState("");
        const searchRef = useRef<HTMLInputElement | null>(null);
        useMenuSearchAutofocus(modelOpen, false, searchRef);

        const [opt, setOpt] = useState("bypass");
        const [sel, setSel] = useState("a");
        const [multi, setMulti] = useState<string[]>(["a"]);
        const [chatOpen, setChatOpen] = useState(false);
        const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);

        return (
          <div className="flex flex-wrap gap-4 p-8">
            <style>{`*, *::before, *::after { transition-duration: 0s !important; }`}</style>
            <textarea aria-label="Composer" />

            <ResponsiveMenuSurface
              isOpen={modelOpen}
              onOpenChange={setModelOpen}
              label="Select model"
              trigger={
                <Button size="sm" variant="ghost">
                  Model Trigger
                </Button>
              }
              contentClassName="w-80 p-0"
              dialogClassName="p-0"
            >
              <ModelMenuSearchInput
                inputRef={searchRef}
                listboxId="menu-focus-model-lb"
                expanded={modelOpen}
                value={query}
                onChange={setQuery}
                onKeyDown={() => {}}
              />
              <div
                id="menu-focus-model-lb"
                role="listbox"
                className="poracode-model-menu-listbox p-1"
              >
                <div role="option" aria-selected="true" className="poracode-menu-item">
                  Fusion
                </div>
              </div>
            </ResponsiveMenuSurface>

            <OptionMenu
              value={opt}
              options={[
                { id: "bypass", label: "Bypass Permissions" },
                { id: "ask", label: "Ask" },
              ]}
              onChange={setOpt}
              placeholder="Permissions"
            />

            <Select
              aria-label="Theme select"
              value={sel}
              options={[
                { id: "a", label: "Alpha" },
                { id: "b", label: "Beta" },
              ]}
              onChange={setSel}
            />

            <MultiSelect
              aria-label="Multi picker"
              value={multi}
              options={[
                { id: "a", label: "Alpha" },
                { id: "b", label: "Beta" },
              ]}
              summary="Alpha"
              onChange={setMulti}
            />

            <Dropdown isOpen={chatOpen} onOpenChange={setChatOpen}>
              <Button size="sm" variant="ghost">
                Chats
              </Button>
              <Dropdown.Popover placement="bottom" className="w-72">
                <SearchField aria-label="Search recent chats" variant="secondary">
                  <SearchField.Group className="poracode-borderless-field !h-7 !min-h-7 !rounded-none !bg-transparent">
                    <SearchField.Input
                      autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- mirrors ChatSidebarHeader's menu search autofocus
                      placeholder="Search recent chats"
                    />
                  </SearchField.Group>
                </SearchField>
                <Dropdown.Menu autoFocus={false} aria-label="Chats">
                  <Dropdown.Item id="new" textValue="New chat">
                    New chat
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>

            <div
              data-testid="context-row"
              className="border p-2"
              onContextMenu={(event) => {
                event.preventDefault();
                setCtxPos({ x: event.clientX, y: event.clientY });
              }}
            >
              Row
            </div>
            {ctxPos ? (
              <Dropdown isOpen onOpenChange={(open) => !open && setCtxPos(null)}>
                <Dropdown.Trigger className="fixed" style={{ left: ctxPos.x, top: ctxPos.y }}>
                  <div className="size-0" />
                </Dropdown.Trigger>
                <Dropdown.Popover placement="bottom start" isNonModal>
                  <Dropdown.Menu
                    aria-label="Row menu"
                    autoFocus="first" // eslint-disable-line jsx-a11y/no-autofocus -- mirrors ContextMenu's React Aria menu prop
                  >
                    <Dropdown.Item id="rename" textValue="Rename">
                      Rename
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            ) : null}
          </div>
        );
      }

      const view = render(<Fixture />);

      // Simulate typing in the composer before opening menus (no Tab navigation).
      await page.elementLocator(view.getByLabelText("Composer")).click();
      await userEvent.keyboard("hello");

      const triggers: Array<{
        name: string;
        open: () => Promise<void>;
        expectActive?: () => Element | null;
      }> = [
        {
          name: "ModelMenu",
          open: () =>
            page
              .elementLocator(view.getAllByRole("button", { name: "Model Trigger" }).at(-1)!)
              .click(),
          expectActive: () => document.querySelector('input[placeholder="Search models..."]'),
        },
        {
          name: "OptionMenu",
          open: () =>
            page.elementLocator(view.getByRole("button", { name: "Permissions" })).click(),
        },
        {
          name: "Select",
          open: () => page.elementLocator(view.getByLabelText("Theme select")).click(),
        },
        {
          name: "MultiSelect",
          open: () => page.elementLocator(view.getByLabelText("Multi picker")).click(),
        },
        {
          name: "ChatSearchDropdown",
          open: () => page.elementLocator(view.getByRole("button", { name: "Chats" })).click(),
          expectActive: () => document.querySelector('input[placeholder="Search recent chats"]'),
        },
        {
          name: "RightClickContextMenu",
          open: () =>
            page.elementLocator(view.getByTestId("context-row")).click({ button: "right" }),
        },
      ];

      for (const item of triggers) {
        await item.open();
        let popover: Element | null = null;
        await vi.waitFor(() => {
          popover = document.querySelector(".popover, .dropdown__popover, .select__popover");
          expect(popover).not.toBeNull();
          const expectedActive = item.expectActive?.();
          expect(expectedActive === undefined || document.activeElement === expectedActive).toBe(
            true,
          );
        });
        expectNoFocusRingIn(popover!);
        await userEvent.keyboard("{Escape}");
        await vi.waitFor(() => {
          expect(
            document.querySelector(".popover, .dropdown__popover, .select__popover"),
          ).toBeNull();
        });
      }
    } finally {
      removeKeyboardFocus();
    }
  });

  it("hides all focus rings during mouse interaction and shows subtle 1px translucent rings on keyboard navigation", async () => {
    const removeKeyboardFocus = installKeyboardFieldFocus();
    const { page, userEvent } = await browserInput();
    try {
      const view = render(
        <div className="flex flex-col gap-3 p-4">
          <style>{`*, *::before, *::after { transition-duration: 0s !important; }`}</style>
          <input aria-label="Raw filter" placeholder="Filter..." />
          <Input
            aria-label="Palette search"
            variant="secondary"
            className="poracode-borderless-field border-0 bg-transparent px-0 text-sm shadow-none"
          />
          <SearchField aria-label="Table filter" variant="secondary">
            <SearchField.Group>
              <SearchField.Input placeholder="Filter rows..." />
            </SearchField.Group>
          </SearchField>
          <NumberField aria-label="Retry limit" defaultValue={3} variant="secondary">
            <NumberField.Group>
              <NumberField.Input />
            </NumberField.Group>
          </NumberField>
          <ColorField aria-label="Accent color" defaultValue="#3b82f6">
            <ColorField.Group variant="secondary">
              <ColorField.Input />
            </ColorField.Group>
          </ColorField>
          <Input aria-label="Broken field" aria-invalid="true" variant="secondary" />
          <input type="checkbox" aria-label="Native option" />
          <button type="button">Native action</button>
          <button
            type="button"
            className="focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-focus"
          >
            Outline action
          </button>
          <Button size="sm" variant="ghost">
            Hero action
          </Button>
          <button
            type="button"
            aria-pressed="true"
            className="rounded-md px-2 py-1 ring-1 ring-accent"
          >
            Selected swatch
          </button>
          <ComboBox aria-label="Font picker">
            <ComboBox.InputGroup>
              <Input placeholder="Select font" />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                <ListBox.Item id="mono" textValue="Mono">
                  Mono
                </ListBox.Item>
                <ListBox.Item id="sans" textValue="Sans">
                  Sans
                </ListBox.Item>
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>,
      );

      const rawFilter = view.getByLabelText("Raw filter");
      const paletteSearch = view.getByLabelText("Palette search");
      const tableFilterInput = view.getByPlaceholderText("Filter rows...");
      const tableFilterGroup = tableFilterInput.closest(".search-field__group")!;
      const retryInput = view.getByRole("textbox", { name: "Retry limit" });
      const retryGroup = retryInput.closest(".number-field__group")!;
      const colorInput = view.getByRole("textbox", { name: "Accent color" });
      const colorGroup = colorInput.closest(".color-input-group")!;
      const invalidInput = view.getByLabelText("Broken field");
      const checkbox = view.getByLabelText("Native option");
      const nativeButton = view.getByRole("button", { name: "Native action" });
      const outlineButton = view.getByRole("button", { name: "Outline action" });
      const heroButton = view.getByRole("button", { name: "Hero action" });
      const selectedSwatch = view.getByRole("button", { name: "Selected swatch" });
      const fontInput = view.getByPlaceholderText("Select font");

      // Clicking any control with the mouse never paints a focus ring or outline,
      // even after moving the caret with arrow keys inside text inputs.
      await page.elementLocator(rawFilter).click();
      await userEvent.keyboard("abc{ArrowLeft}");
      expectNoFocusRingOn(rawFilter);

      await page.elementLocator(paletteSearch).click();
      expectNoFocusRingOn(paletteSearch);

      await page.elementLocator(tableFilterInput).click();
      expectNoFocusRingOn(tableFilterInput);
      expectNoFocusRingOn(tableFilterGroup);

      await page.elementLocator(retryInput).click();
      expectNoFocusRingOn(retryInput);
      expectNoFocusRingOn(retryGroup);

      await page.elementLocator(colorInput).click();
      expectNoFocusRingOn(colorInput);
      expectNoFocusRingOn(colorGroup);

      await page.elementLocator(nativeButton).click();
      expectNoFocusRingOn(nativeButton);

      await page.elementLocator(outlineButton).click();
      expectNoFocusRingOn(outlineButton);

      await page.elementLocator(heroButton).click();
      expectNoFocusRingOn(heroButton);

      // Invalid fields retain their semantic danger ring under pointer and keyboard focus.
      await page.elementLocator(invalidInput).click();
      expect(hasVisibleShadow(getComputedStyle(invalidInput).boxShadow)).toBe(true);

      // Non-focus selection rings stay visible when clicked.
      await page.elementLocator(selectedSwatch).click();
      expect(hasVisibleShadow(getComputedStyle(selectedSwatch).boxShadow)).toBe(true);

      // Tabbing activates keyboard focus with a subtle 1px translucent grey indicator.
      await page.elementLocator(tableFilterInput).click();
      expectNoFocusRingOn(tableFilterGroup);

      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(retryInput);
      const retryStyle = getComputedStyle(retryGroup);
      expect(retryStyle.outlineStyle).toBe("solid");
      expect(retryStyle.outlineWidth).toBe("1px");
      const fieldAlpha = parseAlpha(retryStyle.outlineColor);
      expect(fieldAlpha).toBeGreaterThan(0.15);
      expect(fieldAlpha).toBeLessThan(0.5);

      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(colorInput);
      const colorStyle = getComputedStyle(colorGroup);
      expect(colorStyle.outlineStyle).toBe("solid");
      expect(colorStyle.outlineWidth).toBe("1px");
      expect(hasVisibleShadow(colorStyle.boxShadow)).toBe(false);

      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(invalidInput);
      // Invalid fields keep HeroUI's opaque danger outline + ring instead of translucent --focus.
      expect(readCssRgba(getComputedStyle(invalidInput).outlineColor)[3]).toBe(255);
      expect(hasVisibleShadow(getComputedStyle(invalidInput).boxShadow)).toBe(true);

      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(checkbox);
      expect(hasVisibleShadow(getComputedStyle(checkbox).boxShadow)).toBe(true);

      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(nativeButton);
      const nativeShadow = getComputedStyle(nativeButton).boxShadow;
      expect(hasVisibleShadow(nativeShadow)).toBe(true);
      expect(nativeShadow).toContain("0px 0px 0px 1px inset");
      const nativeRingColor = shadowLayerColor(
        nativeShadow.split(/,(?![^(]*\))/).find((layer) => layer.includes("1px inset"))!,
      )!;
      const ringAlpha = parseAlpha(nativeRingColor);
      expect(ringAlpha).toBeGreaterThan(0.15);
      expect(ringAlpha).toBeLessThan(0.5);

      // Explicit Tailwind focus-visible:outline-* utilities are preserved on keyboard Tab.
      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(outlineButton);
      const outlineStyle = getComputedStyle(outlineButton);
      expect(outlineStyle.outlineStyle).toBe("solid");
      expect(outlineStyle.outlineWidth).toBe("1px");
      expect(parseAlpha(outlineStyle.outlineColor)).toBeGreaterThan(0.15);
      expect(hasVisibleShadow(outlineStyle.boxShadow)).toBe(false);

      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(heroButton);
      const heroShadow = getComputedStyle(heroButton).boxShadow;
      expect(hasVisibleShadow(heroShadow)).toBe(true);
      expect(heroShadow).toContain("0px 0px 0px 1px inset");

      // Returning to mouse interaction immediately removes the focus ring.
      await page.elementLocator(heroButton).click();
      expectNoFocusRingOn(heroButton);

      // Arrow-keying in an expanded ComboBox after clicking its input activates keyboard focus.
      await page.elementLocator(fontInput).click();
      await userEvent.keyboard("{ArrowDown}");
      await vi.waitFor(() => {
        const focusedOption = document.querySelector('.list-box-item[data-focused="true"]');
        expect(focusedOption).not.toBeNull();
        expect(document.documentElement.hasAttribute("data-keyboard-navigation")).toBe(true);
        expect(hasVisibleShadow(getComputedStyle(focusedOption!).boxShadow)).toBe(true);
      });
    } finally {
      removeKeyboardFocus();
    }
  });
});
