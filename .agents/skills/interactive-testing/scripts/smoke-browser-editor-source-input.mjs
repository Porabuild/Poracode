import assert from "node:assert/strict";
import { normalizeSource } from "./smoke-browser-editor-media-probe.mjs";

/** Exact owned fixture states, including interrupted forward/restoration edits.
 * No other source changes are admitted, even when its dimensions match.
 */
export function ownedSvgDimensionSources(originalSvg, editedSvg) {
  let sources = [originalSvg];
  for (const attribute of ["width", "height"]) {
    const pattern = new RegExp(`${attribute}="(\\d+)"`);
    const original = originalSvg.match(pattern),
      edited = editedSvg.match(pattern);
    assert(
      original && edited && original[1].length === edited[1].length,
      "unsupported SVG fixture dimensions",
    );
    sources = sources.flatMap((source) => [
      source,
      source.replace(pattern, `${attribute}="${edited[1]}"`),
    ]);
  }
  assert(sources.includes(editedSvg), "SVG fixture changes content beyond dimensions");
  return [...new Set(sources)];
}

/** Edit the two owned SVG fixture attributes through actual keyboard controls.
 * Bulk IME insertion is typing, so Monaco may apply XML completion rules.
 * Numeric replacement avoids those rules without changing editor options.
 */
export async function replaceNativeSvgDimensions({
  client,
  read,
  wait,
  content,
  originalSvg,
  editedSvg,
  receipts,
}) {
  const current = await read();
  assert(current.sourceEditable && current.sourceFocused, "native SVG editor lost focus");
  const allowed = ownedSvgDimensionSources(originalSvg, editedSvg);
  const initial = allowed.find(
    (source) => normalizeSource(source) === normalizeSource(current.sourceText),
  );
  assert(
    initial && [originalSvg, editedSvg].includes(content),
    "refusing unrelated SVG source replacement",
  );
  let expected = initial;
  const sendKey = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    const params = { key, code, windowsVirtualKeyCode, modifiers };
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...params });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
  };
  for (const attribute of ["width", "height"]) {
    const pattern = new RegExp(`${attribute}="(\\d+)"`);
    const old = expected.match(pattern),
      next = content.match(pattern);
    assert(old && next && old[1].length === next[1].length, "unsupported SVG fixture dimensions");
    if (old[1] === next[1]) continue;
    const offset = old.index + `${attribute}="`.length;
    // Ctrl/Cmd+A then Left collapses to the beginning without platform-specific
    // Home bindings. Attributes occur on the fixture's first physical line.
    await sendKey("a", "KeyA", 65, current.mac ? 4 : 2);
    await sendKey("ArrowLeft", "ArrowLeft", 37);
    for (let index = 0; index < offset; index++) await sendKey("ArrowRight", "ArrowRight", 39);
    for (let index = 0; index < old[1].length; index++)
      await sendKey("ArrowRight", "ArrowRight", 39, 8);
    const selected = await wait((state) => {
      assert(state.sourceEditable && state.sourceFocused, "SVG attribute selection lost focus");
      const selection = state.sourceSelection;
      assert(selection, "SVG attribute selection is absent");
      assert.equal(selection.start, offset, "SVG attribute selection starts elsewhere");
      assert.equal(selection.end, offset + old[1].length, "SVG attribute selection is incomplete");
      assert.equal(selection.text.slice(selection.start, selection.end), old[1]);
      assert(
        selection.text.slice(0, offset).endsWith(`${attribute}="`),
        "selected another SVG field",
      );
    }, `native SVG ${attribute} selection`);
    receipts.push({
      operation: "svg-attribute-selection",
      attribute,
      start: selected.sourceSelection.start,
      end: selected.sourceSelection.end,
      oldValue: old[1],
      newValue: next[1],
    });
    await client.send("Input.insertText", { text: next[1] });
    expected = expected.replace(pattern, `${attribute}="${next[1]}"`);
    await wait((state) => {
      assert.equal(
        normalizeSource(state.sourceText),
        normalizeSource(expected),
        "SVG attribute edit changed other content",
      );
    }, `native SVG ${attribute} replacement`);
  }
  assert.equal(expected, content, "SVG replacement contains changes beyond owned dimensions");
}
