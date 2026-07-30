import type { Matcher } from "@testing-library/dom";

/**
 * Matches an element by its full `textContent` rather than its direct text
 * nodes, which is what Testing Library's default matcher looks at.
 *
 * Needed for labels that mix static words with an `<AnimatedNumber>`: the digits
 * live in their own element, so `getByText("2 commands")` sees only " commands".
 * The matcher deliberately resolves to the innermost element whose text content
 * matches, so ancestors don't produce "found multiple elements".
 */
export function byTextContent(expected: string | RegExp): Matcher {
  const matches = (value: string) =>
    typeof expected === "string" ? value === expected : expected.test(value);

  return (_content: string, element: Element | null) => {
    if (!element) return false;
    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!matches(text)) return false;
    return Array.from(element.children).every((child) => {
      const childText = child.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return !matches(childText);
    });
  };
}
