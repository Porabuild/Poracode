import assert from "node:assert/strict";
import { join } from "node:path";
import { clickCdpElements } from "./poracode-cdp-actions.mjs";

export async function runEverythingSearchScenario({
  client,
  evaluate,
  waitForValue,
  screenshot,
  outDir,
}) {
  const read = (expression) => evaluate(client, expression);
  const wait = (expression, predicate, label) =>
    waitForValue(() => read(expression), predicate, label);
  const click = (elementsExpression, label) =>
    clickCdpElements({ client, evaluate, elementsExpression, label });
  const inputSelector = 'input[role="combobox"][aria-label="Search"]';
  const categories = '[role="toolbar"][aria-label="Search categories"] button';
  async function key(keyName, modifiers = 0, keyCode) {
    const code =
      keyCode ??
      { ArrowDown: 40, Enter: 13, Escape: 27, Tab: 9 }[keyName] ??
      keyName.toUpperCase().charCodeAt(0);
    await client.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: keyName,
      windowsVirtualKeyCode: code,
      modifiers,
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: keyName,
      windowsVirtualKeyCode: code,
      modifiers,
    });
  }
  async function type(text) {
    await click(`[...document.querySelectorAll(${JSON.stringify(inputSelector)})]`, "search input");
    await read(`document.querySelector(${JSON.stringify(inputSelector)}).select()`);
    await client.send("Input.insertText", { text });
    await wait(
      `document.querySelector(${JSON.stringify(inputSelector)})?.value`,
      (value) => value === text,
      "search query",
    );
  }
  async function category(label) {
    await click(
      `[...document.querySelectorAll(${JSON.stringify(categories)})].filter(button => button.textContent.trim() === ${JSON.stringify(label)})`,
      `search category ${label}`,
    );
    await wait(
      `document.querySelector('${categories}[aria-pressed="true"]')?.textContent.trim()`,
      (value) => value === label,
      `active ${label} category`,
    );
  }
  try {
    await read(
      `(() => { const d = window.__poracodeDev; const app = d.stores.app.getState(); d.reset(); app.openDraft("smoke-project"); document.activeElement?.blur(); })()`,
    );
    const shortcutModifier = await read('window.poracode.platform === "darwin" ? 4 : 2');
    await key("k", shortcutModifier);
    const initial = await wait(
      `(() => {
      const input = document.querySelector(${JSON.stringify(inputSelector)});
      const active = input?.getAttribute("aria-activedescendant");
      return { open: window.__poracodeDev.stores.commandPalette.getState().isOpen,
        focused: input === document.activeElement,
        categories: [...document.querySelectorAll(${JSON.stringify(categories)})].map(button => button.textContent.trim()),
        options: document.querySelectorAll('#everything-search-results [role="option"]').length,
        activeExists: Boolean(active && document.getElementById(active)),
        actions: document.querySelector('#everything-search-results')?.textContent.includes("Smoke check") };
    })()`,
      (state) => state.open && state.focused && state.options > 0 && state.activeExists,
      "unified search open and focus",
    );
    assert.deepEqual(initial.categories, [
      "All",
      "Threads",
      "Commands",
      "Settings",
      "Files",
      "Actions",
    ]);
    assert(initial.actions, "project action missing from unified search");
    await key("ArrowDown");
    await wait(
      `document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute("aria-activedescendant")`,
      (id) => id === "everything-search-result-1",
      "keyboard result navigation",
    );
    await key("Tab", 2);
    await wait(
      `document.querySelector('${categories}[aria-pressed="true"]')?.textContent.trim()`,
      (value) => value === "Threads",
      "keyboard category navigation",
    );
    await category("All");
    await click(
      `[...document.querySelectorAll('[aria-labelledby="search-heading-commands"] [role="option"]')].filter(option => option.textContent.includes("Show more"))`,
      "show more commands",
    );
    const expanded = await wait(
      `({ category: document.querySelector('${categories}[aria-pressed="true"]')?.textContent.trim(), count: document.querySelectorAll('#everything-search-results [role="option"]').length })`,
      (state) => state.category === "Commands" && state.count > 5,
      "expanded command results",
    );
    await category("Files");
    await type("rdm");
    const files = await wait(
      `({ text: document.querySelector('#everything-search-results')?.textContent, highlights: document.querySelectorAll('#everything-search-results mark').length })`,
      (state) => state.text?.includes("README.md"),
      "abbreviated file-name search",
    );
    assert(files.highlights > 0, "file search did not highlight matching characters");
    const screenshotPath = join(outDir, "smoke-03-everything-search.png");
    await screenshot(client, screenshotPath);
    await category("All");
    await type("Mode");
    await wait(
      `document.querySelector('#everything-search-results [role="group"]')?.getAttribute("aria-labelledby")`,
      (id) => id === "search-heading-settings",
      "relevance-ranked result groups",
    );
    await category("Settings");
    await type("Match your system");
    await wait(
      `document.querySelector('#everything-search-results')?.textContent`,
      (text) => text?.includes("Mode"),
      "setting description search",
    );
    await key("Enter");
    const deepLink = await wait(
      `(() => { const row = document.querySelector('[data-settings-anchor="appearance.mode"]'); return { open: window.__poracodeDev.stores.panel.getState().settingsOpen, target: Boolean(row), highlighted: row?.classList.contains("poracode-setting-highlight") }; })()`,
      (state) => state.open && state.target && state.highlighted,
      "setting row deep link",
    );
    await read("window.__poracodeDev.closeSettings(); document.activeElement?.blur()");
    await key("g", shortcutModifier);
    await wait(
      `Boolean(document.querySelector(${JSON.stringify(inputSelector)}))`,
      Boolean,
      "legacy search shortcut",
    );
    await key("Escape");
    await wait(
      "!window.__poracodeDev.stores.commandPalette.getState().isOpen",
      Boolean,
      "search Escape dismissal",
    );
    return { initial, expanded, files, deepLink, screenshotPath };
  } finally {
    await read("window.__poracodeDev.reset()");
  }
}
