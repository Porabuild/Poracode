export async function setViewport(width: number, height: number): Promise<void> {
  const { page } = (await import("vitest/browser")) as unknown as {
    page: { viewport: (width: number, height: number) => Promise<void> };
  };
  await page.viewport(width, height);
}

function createBaselineProbe(): HTMLSpanElement {
  const probe = document.createElement("span");
  probe.style.display = "inline-block";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.verticalAlign = "baseline";
  return probe;
}

export function measureInlineBaseline(container: Element): number {
  const probe = createBaselineProbe();
  container.appendChild(probe);
  const baselineY = probe.getBoundingClientRect().top;
  probe.remove();
  return baselineY;
}

/** Measures the baseline at a text offset, then restores the text node exactly. */
export function measureTextBaseline(node: Text, offset: number): number {
  const probe = createBaselineProbe();
  const tail = node.splitText(offset);
  node.parentNode?.insertBefore(probe, tail);
  const baselineY = probe.getBoundingClientRect().top;
  probe.remove();
  node.appendData(tail.data);
  tail.remove();
  return baselineY;
}

export function findInlineTextMatch(
  root: Element,
  needle: string,
  excludeSelector: string,
): { node: Text; offset: number; rect: DOMRect } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Text)) continue;
    if (node.parentElement?.closest(excludeSelector)) continue;
    const offset = node.textContent?.indexOf(needle) ?? -1;
    if (offset >= 0) {
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + needle.length);
      return { node, offset, rect: range.getBoundingClientRect() };
    }
  }
  throw new Error(`Missing inline text "${needle}"`);
}
