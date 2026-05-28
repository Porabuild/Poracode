import type { WebContents } from "electron";

type PageExecutor = Pick<WebContents, "executeJavaScript">;

const DRIVER_GLOBAL = "__lightcodeBrowserDriver";

const DRIVER_SOURCE = `(() => {
  if (window.${DRIVER_GLOBAL}) return true;

  const bySelector = (selector) => document.querySelector(selector);
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const centerInit = (el, extra = {}) => {
    const r = el.getBoundingClientRect();
    return {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      ...extra,
    };
  };
  const valueSetterFor = (el) => {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : null;
    return proto ? Object.getOwnPropertyDescriptor(proto, "value")?.set : null;
  };
  const dispatchTextEvents = (el, text) => {
    const inputEvent = typeof InputEvent === "function"
      ? new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
      : new Event("input", { bubbles: true });
    el.dispatchEvent(inputEvent);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const focusElement = (el) => {
    if (!el || typeof el.focus !== "function") return false;
    el.scrollIntoView({ block: "center", inline: "center" });
    el.focus();
    return document.activeElement === el;
  };
  const submitFrom = (el) => {
    const down = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true });
    const shouldSubmit = el.dispatchEvent(down);
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    const form = el.form instanceof HTMLFormElement ? el.form : el.closest("form");
    if (shouldSubmit && form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
    }
  };
  const isEditableValueElement = (el) => {
    if (el instanceof HTMLTextAreaElement) return true;
    if (!(el instanceof HTMLInputElement)) return false;
    const TEXT_TYPES = new Set([
      "text", "search", "url", "tel", "email", "password", "number",
      "date", "datetime-local", "month", "time", "week",
    ]);
    return TEXT_TYPES.has((el.type || "text").toLowerCase());
  };
  const writeText = (selector, text, submit, append) => {
    const el = bySelector(selector);
    if (!focusElement(el)) return false;
    if (isEditableValueElement(el)) {
      if (append) {
        const value = String(el.value ?? "");
        const start = typeof el.selectionStart === "number" ? el.selectionStart : value.length;
        const end = typeof el.selectionEnd === "number" ? el.selectionEnd : value.length;
        const next = value.slice(0, start) + text + value.slice(end);
        const setter = valueSetterFor(el);
        if (setter) setter.call(el, next);
        else el.value = next;
        if (typeof el.setSelectionRange === "function") {
          try { el.setSelectionRange(start + text.length, start + text.length); } catch {}
        }
      } else {
        const setter = valueSetterFor(el);
        if (setter) setter.call(el, text);
        else el.value = text;
        if (typeof el.setSelectionRange === "function") {
          try { el.setSelectionRange(text.length, text.length); } catch {}
        }
      }
    } else if (el.isContentEditable) {
      if (append) {
        const selection = window.getSelection();
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : document.createRange();
        if (!selection || !el.contains(range.commonAncestorContainer)) {
          range.selectNodeContents(el);
          range.collapse(false);
        }
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        const nextSelection = window.getSelection();
        if (nextSelection) {
          nextSelection.removeAllRanges();
          nextSelection.addRange(range);
        }
      } else {
        el.textContent = text;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    } else {
      return false;
    }
    dispatchTextEvents(el, text);
    if (submit) submitFrom(el);
    return true;
  };

  window.${DRIVER_GLOBAL} = {
    click(selector, clickCount) {
      const el = bySelector(selector);
      if (!el) return false;
      el.scrollIntoView({ block: "center", inline: "center" });
      if (!isVisible(el)) return false;
      const init = centerInit(el, { button: 0, buttons: 1, detail: clickCount });
      if (typeof PointerEvent === "function") {
        el.dispatchEvent(new PointerEvent("pointerover", init));
        el.dispatchEvent(new PointerEvent("pointerenter", init));
        el.dispatchEvent(new PointerEvent("pointerdown", init));
      }
      el.dispatchEvent(new MouseEvent("mouseover", init));
      el.dispatchEvent(new MouseEvent("mouseenter", init));
      el.dispatchEvent(new MouseEvent("mousedown", init));
      if (typeof el.focus === "function") el.focus();
      if (typeof PointerEvent === "function") {
        el.dispatchEvent(new PointerEvent("pointerup", init));
      }
      el.dispatchEvent(new MouseEvent("mouseup", init));
      el.dispatchEvent(new MouseEvent("click", init));
      if (clickCount === 2) el.dispatchEvent(new MouseEvent("dblclick", init));
      return true;
    },
    focus(selector) {
      return focusElement(bySelector(selector));
    },
    type(selector, text, submit) {
      return writeText(selector, text, submit, true);
    },
    fill(selector, text, submit) {
      return writeText(selector, text, submit, false);
    },
    setChecked(selector, checked) {
      const el = bySelector(selector);
      if (!el || !("checked" in el)) return false;
      el.scrollIntoView({ block: "center", inline: "center" });
      if (el.checked !== checked) {
        el.checked = checked;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    },
    select(selector, value) {
      const el = bySelector(selector);
      if (!el || el.tagName !== "SELECT") return false;
      el.scrollIntoView({ block: "center", inline: "center" });
      const options = Array.from(el.options);
      const option = options.find((opt) => opt.value === value) ||
        options.find((opt) => (opt.textContent || "").trim() === value);
      if (!option) return false;
      el.value = option.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    resolveRefToSelector(ref) {
      const el = (window.__lcRefs || new Map()).get(ref);
      if (!el) return null;
      if (el.id && !/^\\d/.test(el.id)) return "#" + CSS.escape(el.id);
      const path = [];
      let n = el;
      while (n && n.nodeType === 1 && n.tagName !== "HTML") {
        let part = n.tagName.toLowerCase();
        const p = n.parentElement;
        if (p) {
          const sibs = Array.from(p.children).filter((c) => c.tagName === n.tagName);
          if (sibs.length > 1) part += ":nth-of-type(" + (sibs.indexOf(n) + 1) + ")";
        }
        path.unshift(part);
        n = p;
      }
      return path.join(" > ");
    },
    hover(selector) {
      const el = bySelector(selector);
      if (!el) return false;
      el.scrollIntoView({ block: "center", inline: "center" });
      if (!isVisible(el)) return false;
      const init = centerInit(el);
      if (typeof PointerEvent === "function") {
        el.dispatchEvent(new PointerEvent("pointerover", init));
        el.dispatchEvent(new PointerEvent("pointermove", init));
      }
      el.dispatchEvent(new MouseEvent("mouseover", init));
      el.dispatchEvent(new MouseEvent("mousemove", init));
      return true;
    },
    press(rawKey, selector, shiftKey) {
      const keyMap = { Esc: "Escape", Space: " " };
      const codeMap = { " ": "Space", Escape: "Escape", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight" };
      const normalizedKey = keyMap[rawKey] || rawKey;
      const code = codeMap[normalizedKey] || rawKey;
      let target;
      if (selector) {
        target = bySelector(selector);
        if (!target) return false;
        focusElement(target);
      } else {
        target = document.activeElement && document.activeElement !== document.body
          ? document.activeElement
          : document;
      }
      const init = { key: normalizedKey, code, shiftKey: !!shiftKey, bubbles: true, cancelable: true, composed: true };
      const down = new KeyboardEvent("keydown", init);
      const proceed = target.dispatchEvent(down);
      if (proceed) {
        if (normalizedKey === "Enter") {
          if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) {
            target.click();
          } else {
            const form = "form" in target && target.form instanceof HTMLFormElement
              ? target.form
              : target instanceof Element
                ? target.closest("form")
                : null;
            if (form && typeof form.requestSubmit === "function") form.requestSubmit();
          }
        } else if (normalizedKey === " " && target instanceof HTMLElement && (target instanceof HTMLButtonElement || target instanceof HTMLInputElement)) {
          target.click();
        } else if (normalizedKey === "Tab") {
          const focusable = Array.from(document.querySelectorAll("a[href], button, input, textarea, select, details, [tabindex]:not([tabindex='-1'])"))
            .filter((el) => {
              if (!(el instanceof HTMLElement)) return false;
              if ("disabled" in el && el.disabled) return false;
              return isVisible(el);
            });
          if (focusable.length > 0) {
            const idx = focusable.indexOf(target);
            const step = shiftKey ? -1 : 1;
            const nextIdx = idx < 0
              ? (shiftKey ? focusable.length - 1 : 0)
              : (idx + step + focusable.length) % focusable.length;
            const next = focusable[nextIdx];
            if (next instanceof HTMLElement) next.focus();
          }
        }
      }
      target.dispatchEvent(new KeyboardEvent("keyup", init));
      return true;
    },
    scroll(selector, x, y) {
      if (selector) {
        const el = bySelector(selector);
        if (!el) return false;
        el.scrollIntoView({ block: "center", inline: "center" });
        return true;
      }
      window.scrollBy(x || 0, y || 0);
      return true;
    },
  };
  return true;
})()`;

async function callDriver<T = unknown>(page: PageExecutor, expression: string): Promise<T> {
  await page.executeJavaScript(DRIVER_SOURCE, true);
  return (await page.executeJavaScript(expression, true)) as T;
}

export async function clickSelector(page: PageExecutor, selector: string): Promise<void> {
  const ok = await callDriver<boolean>(
    page,
    `window.${DRIVER_GLOBAL}.click(${JSON.stringify(selector)}, 1)`,
  );
  if (!ok) throw new Error(`Selector not found or has zero size: ${selector}`);
}

export async function doubleClickSelector(page: PageExecutor, selector: string): Promise<void> {
  const ok = await callDriver<boolean>(
    page,
    `window.${DRIVER_GLOBAL}.click(${JSON.stringify(selector)}, 2)`,
  );
  if (!ok) throw new Error(`Selector not found or has zero size: ${selector}`);
}

export async function focusSelector(page: PageExecutor, selector: string): Promise<void> {
  const focused = await callDriver<boolean>(
    page,
    `window.${DRIVER_GLOBAL}.focus(${JSON.stringify(selector)})`,
  );
  if (!focused) throw new Error(`Selector not found or not focusable: ${selector}`);
}

export async function typeIntoSelector(
  page: PageExecutor,
  selector: string,
  text: string,
  submit: boolean,
): Promise<void> {
  const ok = await callDriver<boolean>(
    page,
    `window.${DRIVER_GLOBAL}.type(${JSON.stringify(selector)}, ${JSON.stringify(text)}, ${submit ? "true" : "false"})`,
  );
  if (!ok) throw new Error(`Selector not found or not typeable: ${selector}`);
}

export async function fillSelector(
  page: PageExecutor,
  selector: string,
  text: string,
  submit: boolean,
): Promise<void> {
  const ok = await callDriver<boolean>(
    page,
    `window.${DRIVER_GLOBAL}.fill(${JSON.stringify(selector)}, ${JSON.stringify(text)}, ${submit ? "true" : "false"})`,
  );
  if (!ok) throw new Error(`Selector not found or not fillable: ${selector}`);
}

export async function setCheckedSelector(
  page: PageExecutor,
  selector: string,
  checked: boolean,
): Promise<void> {
  const ok = await callDriver<boolean>(
    page,
    `window.${DRIVER_GLOBAL}.setChecked(${JSON.stringify(selector)}, ${checked ? "true" : "false"})`,
  );
  if (!ok) throw new Error(`Selector not found or not checkable: ${selector}`);
}

export async function selectOption(
  page: PageExecutor,
  selector: string,
  value: string,
): Promise<void> {
  const ok = await callDriver<boolean>(
    page,
    `window.${DRIVER_GLOBAL}.select(${JSON.stringify(selector)}, ${JSON.stringify(value)})`,
  );
  if (!ok) throw new Error(`Selector not found or option not available: ${selector}`);
}

export async function resolveRefToSelector(
  page: PageExecutor,
  ref: string,
): Promise<string | null> {
  return await callDriver<string | null>(
    page,
    `window.${DRIVER_GLOBAL}.resolveRefToSelector(${JSON.stringify(ref)})`,
  );
}

export async function hoverSelector(page: PageExecutor, selector: string): Promise<void> {
  const ok = await callDriver<boolean>(
    page,
    `window.${DRIVER_GLOBAL}.hover(${JSON.stringify(selector)})`,
  );
  if (!ok) throw new Error(`Selector not found: ${selector}`);
}

export async function pressKey(
  page: PageExecutor,
  key: string,
  selector?: string,
  options: { shift?: boolean } = {},
): Promise<void> {
  const ok = await callDriver<boolean>(
    page,
    `window.${DRIVER_GLOBAL}.press(${JSON.stringify(key)}, ${selector ? JSON.stringify(selector) : "null"}, ${options.shift ? "true" : "false"})`,
  );
  if (!ok) throw new Error(`Selector not found: ${selector}`);
}

export async function scrollPage(
  page: PageExecutor,
  options: { selector?: string; x?: number; y?: number },
): Promise<void> {
  await callDriver(
    page,
    `window.${DRIVER_GLOBAL}.scroll(${options.selector ? JSON.stringify(options.selector) : "null"}, ${options.x ?? 0}, ${options.y ?? 0})`,
  );
}
