/**
 * Console tracing for the mobile composer keyboard dance (probe, guarded
 * focus, ghost-tap suppression). Silent by default — enable on-device via
 * `localStorage.setItem("lightcode-mobile-keyboard-debug", "1")` and reload.
 */
const DEBUG_FLAG_KEY = "lightcode-mobile-keyboard-debug";

let enabled: boolean | null = null;

function debugEnabled(): boolean {
  if (enabled === null) {
    try {
      enabled = window.localStorage.getItem(DEBUG_FLAG_KEY) === "1";
    } catch {
      enabled = false;
    }
  }
  return enabled;
}

export function describeElement(element: Element | null): string | null {
  if (!(element instanceof HTMLElement)) return null;
  const id = element.id ? `#${element.id}` : "";
  const className =
    typeof element.className === "string" && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
  const markers = [
    element.hasAttribute("data-composer-keyboard-primer") ? "primer" : null,
    element.hasAttribute("data-composer-focus-sentinel") ? "sentinel" : null,
    element.closest("[data-composer-input-anchor]") ? "composer-input" : null,
    element.getAttribute("contenteditable")
      ? `contenteditable=${element.getAttribute("contenteditable")}`
      : null,
  ].filter(Boolean);
  return `${element.tagName.toLowerCase()}${id}${className}${markers.length ? ` [${markers.join(",")}]` : ""}`;
}

export function keyboardDebug(event: string, data: Record<string, unknown> = {}): void {
  if (!debugEnabled()) return;
  const viewport = window.visualViewport;
  const payload = {
    ...data,
    active: describeElement(document.activeElement),
    scrollY: window.scrollY,
    docScrollTop: document.scrollingElement?.scrollTop ?? null,
    innerHeight: window.innerHeight,
    visualViewport: viewport
      ? {
          height: viewport.height,
          offsetTop: viewport.offsetTop,
          pageTop: viewport.pageTop,
          scale: viewport.scale,
        }
      : null,
  };
  console.log("[mobile-composer-keyboard]", event, payload, JSON.stringify(payload));
}
