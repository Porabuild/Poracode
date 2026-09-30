/** Resolve one actionable DOM target inside the renderer before sending input. */
function pointerTarget(matches) {
  if (matches.length === 0) return { error: "missing" };
  if (matches.length > 1) return { error: `ambiguous:${matches.length}` };
  const el = matches[0];
  if (!(el instanceof HTMLElement)) return { error: "not-html" };
  if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") {
    return { error: "disabled" };
  }
  if (el.closest("[inert]")) return { error: "inert" };
  el.scrollIntoView({ block: "center", inline: "center" });
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    style.display === "none" ||
    style.visibility !== "visible" ||
    style.opacity === "0" ||
    style.pointerEvents === "none"
  ) {
    return { error: "not-visible" };
  }
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
    return { error: "outside-viewport" };
  }
  const hit = document.elementFromPoint(x, y);
  if (!hit || (hit !== el && !el.contains(hit))) return { error: "occluded" };
  return { x, y };
}

/**
 * Shared by the CLI and smoke drivers. The expression returns a collection of
 * candidates; requiring exactly one prevents a stale locator clicking a sibling.
 */
export async function clickCdpElements({ client, evaluate, elementsExpression, label }) {
  const point = await evaluate(client, `(${pointerTarget})(${elementsExpression})`);
  if (point?.error) throw new Error(`cannot click ${label}: ${point.error}`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

/** Optional means absent only; hidden, occluded and ambiguous controls still fail. */
export async function clickCdpLabel({
  client,
  evaluate,
  label,
  selector = "button,[role=button],a",
  optional = false,
}) {
  const elementsExpression = `[...document.querySelectorAll(${JSON.stringify(selector)})].filter((element) =>
    (element.getAttribute("aria-label") || element.title || element.textContent?.trim() || "") === ${JSON.stringify(label)})`;
  if (optional && (await evaluate(client, `${elementsExpression}.length`)) === 0)
    return { ok: false };
  await clickCdpElements({ client, evaluate, elementsExpression, label });
  return { ok: true };
}
