import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { clickCdpElements, clickCdpLabel } from "./poracode-cdp-actions.mjs";

function fixture(t) {
  const dom = new JSDOM('<main><button id="target"><span>Action</span></button></main>', {
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const element = window.document.querySelector("button");
  const events = [];
  element.scrollIntoView = () => {};
  element.getBoundingClientRect = () => ({ x: 10, y: 20, width: 60, height: 40 });
  window.document.elementFromPoint = () => element.querySelector("span");
  const click = (elementsExpression = 'document.querySelectorAll("#target")') =>
    clickCdpElements({
      client: { send: async (method, payload) => events.push({ method, payload }) },
      evaluate: (_client, expression) => window.eval(expression),
      elementsExpression,
      label: "fixture target",
    });
  return { window, element, events, click };
}

await test("a visible target hit through its descendant receives real pointer events", async (t) => {
  const { click, events } = fixture(t);
  await click();
  assert.deepEqual(
    events.map(({ method, payload }) => ({ method, ...payload })),
    [
      { method: "Input.dispatchMouseEvent", type: "mouseMoved", x: 40, y: 40 },
      {
        method: "Input.dispatchMouseEvent",
        type: "mousePressed",
        x: 40,
        y: 40,
        button: "left",
        buttons: 1,
        clickCount: 1,
      },
      {
        method: "Input.dispatchMouseEvent",
        type: "mouseReleased",
        x: 40,
        y: 40,
        button: "left",
        buttons: 0,
        clickCount: 1,
      },
    ],
  );
});

for (const [name, expression, error] of [
  ["missing", "[]", "missing"],
  [
    "ambiguous",
    '[document.querySelector("button"),document.querySelector("button")]',
    "ambiguous:2",
  ],
  ["non-HTML", '[document.createElementNS("http://www.w3.org/2000/svg", "svg")]', "not-html"],
]) {
  await test(`refuses ${name} targets without pointer input`, async (t) => {
    const { click, events } = fixture(t);
    await assert.rejects(click(expression), new RegExp(error));
    assert.deepEqual(events, []);
  });
}

await test("an optional label skips only an absent control", async (t) => {
  const { window, events } = fixture(t);
  const result = await clickCdpLabel({
    client: { send: async (method, payload) => events.push({ method, payload }) },
    evaluate: (_client, expression) => window.eval(expression),
    label: "Missing action",
    optional: true,
  });
  assert.deepEqual(result, { ok: false });
  assert.deepEqual(events, []);
});

await test("an optional label still refuses a present but occluded control", async (t) => {
  const { window, events } = fixture(t);
  window.document.elementFromPoint = () => window.document.body;
  await assert.rejects(
    clickCdpLabel({
      client: { send: async (method, payload) => events.push({ method, payload }) },
      evaluate: (_client, expression) => window.eval(expression),
      label: "Action",
      optional: true,
    }),
    /occluded/,
  );
  assert.deepEqual(events, []);
});

await test("a matching label uses pointer input instead of synthetic DOM activation", async (t) => {
  const { window, events, element } = fixture(t);
  element.click = () => {
    throw new Error("Synthetic activation must not be used.");
  };
  const result = await clickCdpLabel({
    client: { send: async (method, payload) => events.push({ method, payload }) },
    evaluate: (_client, expression) => window.eval(expression),
    label: "Action",
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(events.length, 3);
});

for (const [name, change, error] of [
  ["disabled", ({ element }) => (element.disabled = true), "disabled"],
  ["ARIA-disabled", ({ element }) => element.setAttribute("aria-disabled", "true"), "disabled"],
  ["inert ancestor", ({ element }) => element.parentElement.setAttribute("inert", ""), "inert"],
  ["display none", ({ element }) => (element.style.display = "none"), "not-visible"],
  ["hidden", ({ element }) => (element.style.visibility = "hidden"), "not-visible"],
  ["transparent", ({ element }) => (element.style.opacity = "0"), "not-visible"],
  ["pointer-events none", ({ element }) => (element.style.pointerEvents = "none"), "not-visible"],
  [
    "zero size",
    ({ element }) => (element.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0 })),
    "not-visible",
  ],
  [
    "offscreen",
    ({ element }) =>
      (element.getBoundingClientRect = () => ({ x: -100, y: 0, width: 20, height: 20 })),
    "outside-viewport",
  ],
  [
    "occluded",
    ({ window }) => (window.document.elementFromPoint = () => window.document.body),
    "occluded",
  ],
]) {
  await test(`refuses ${name} targets without pointer input`, async (t) => {
    const state = fixture(t);
    change(state);
    await assert.rejects(state.click(), new RegExp(error));
    assert.deepEqual(state.events, []);
  });
}
