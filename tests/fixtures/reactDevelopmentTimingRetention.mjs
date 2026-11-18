import { performance, PerformanceObserver } from "node:perf_hooks";
import { JSDOM } from "jsdom";

const mode = process.argv[2];
const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
globalThis.PerformanceObserver = PerformanceObserver;
if (typeof console.timeStamp !== "function") console.timeStamp = () => {};

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { flushSync } = await import("react-dom");
const name = "\u200bRawTextBoundary";
const tick = () => new Promise((resolve) => setImmediate(resolve));
function RawTextBoundary({ text }) {
  return React.createElement("div", null, text.slice(-8192));
}
const container = document.getElementById("root");
let root = createRoot(container);
performance.clearMeasures();
performance.measure("foreign-control", { start: 0, detail: { owner: "fixture" } });
let observedComponentEntries = 0;
const witness = new PerformanceObserver((list) => {
  observedComponentEntries += list
    .getEntries()
    .filter(
      (entry) => entry.name === name && entry.detail?.devtools?.track === "Components ⚛",
    ).length;
});
witness.observe({ type: "measure" });
let text = "";
for (let index = 0; index < 240; index++) {
  text += "x".repeat(255) + "\n";
  flushSync(() => root.render(React.createElement(RawTextBoundary, { text })));
  if (index % 16 === 0) await tick();
}
await tick();
await tick();
if (mode === "collision") {
  // A consumer can record its own measure under the component name after React
  // emits it. Earlier component notifications must not discard that entry.
  performance.measure(name, { start: 0, detail: { owner: "foreign-same-name" } });
  await tick();
} else if (mode === "remount") {
  root.unmount();
  root = createRoot(container);
  for (let index = 0; index < 4; index++) {
    text += "after-remount";
    flushSync(() => root.render(React.createElement(RawTextBoundary, { text })));
  }
  await tick();
}
const entries = performance.getEntriesByType("measure");
const components = entries.filter(
  (entry) => entry.name === name && entry.detail?.devtools?.track === "Components ⚛",
);
const output = {
  componentEntries: components.length,
  retainedPropertyStringUnits: components.reduce(
    (total, entry) =>
      total +
      entry.detail.devtools.properties.reduce((sum, property) => sum + property[1].length, 0),
    0,
  ),
  domChars: document.getElementById("root").textContent.length,
  foreignControlEntries: performance.getEntriesByName("foreign-control", "measure").length,
  foreignSameNameEntries: entries.filter((entry) => entry.detail?.owner === "foreign-same-name")
    .length,
  observedComponentEntries,
};
console.log(JSON.stringify(output));
witness.disconnect();
root.unmount();
performance.clearMeasures();
dom.window.close();
