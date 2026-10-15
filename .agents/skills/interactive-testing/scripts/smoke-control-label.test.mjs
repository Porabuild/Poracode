import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { hasAccessibleControlLabel } from "./smoke-control-label.mjs";

void test("recognizes the React Aria slider label on its clipped native input", () => {
  const dom = new JSDOM(
    '<span id="volume-label">Volume</span><div style="clip-path:inset(50%)"><input type="range" aria-labelledby="volume-label"></div>',
  );
  assert.equal(hasAccessibleControlLabel(dom.window.document.querySelector("input")), true);
  dom.window.close();
});

void test("accepts native labels and rejects missing or empty label references", () => {
  const dom = new JSDOM(
    '<label for="name">Name</label><input id="name"><span id="empty"></span><button aria-labelledby="missing"></button><input aria-labelledby="empty"><button aria-label=" "></button>',
  );
  const controls = [...dom.window.document.querySelectorAll("input,button")];
  assert.deepEqual(controls.map(hasAccessibleControlLabel), [true, false, false, false]);
  dom.window.close();
});

void test("preserves existing explicit names and rejects an unnamed icon button", () => {
  const dom = new JSDOM(
    '<button aria-label="Stop task"><svg></svg></button><button>Show details</button><input placeholder="Search"><button><svg></svg></button>',
  );
  const controls = [...dom.window.document.querySelectorAll("button,input")];
  assert.deepEqual(controls.map(hasAccessibleControlLabel), [true, true, true, false]);
  dom.window.close();
});
