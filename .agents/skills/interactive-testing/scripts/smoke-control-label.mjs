/** Match the naming forms used by native inputs and React Aria controls. */
export function hasAccessibleControlLabel(element) {
  const labelledBy = element.getAttribute("aria-labelledby")?.trim().split(/\s+/);
  const referencedLabel = labelledBy?.some((id) =>
    element.ownerDocument.getElementById(id)?.textContent?.trim(),
  );
  const nativeLabel =
    element.labels && [...element.labels].some((label) => label.textContent?.trim());
  return Boolean(
    referencedLabel ||
    element.getAttribute("aria-label")?.trim() ||
    nativeLabel ||
    element.getAttribute("title")?.trim() ||
    element.getAttribute("placeholder")?.trim() ||
    element.textContent?.trim(),
  );
}
