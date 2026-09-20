import { describe, expect, it } from "vitest";
import {
  encodeTerminalKeyStroke,
  terminalKeyCsiModifier,
  type TerminalKeyStroke,
} from "./terminalKeyEncoding";
import {
  TERMINAL_KEY_ENCODING_SPEC,
  validateTerminalKeyEncodingSpec,
  type TerminalKeyEncodingRule,
} from "./terminalKeyEncodingSpec";

// Built from code points so the vector table never embeds raw control bytes.
const ESC = String.fromCodePoint(0x1b);
const c0 = (codePoint: number) => String.fromCodePoint(codePoint);
const DEL = c0(0x7f);

/** The shared vector table. The Android JVM (`TerminalKeyAccessoryTest`) and
 * iOS (`TerminalRawKeyInputTests`) suites pin the same rows against their
 * generated encoders; rows marked [R1]-[R3] document the reconciled edge
 * divergences from the spec header. */
const VECTORS: ReadonlyArray<
  readonly [label: string, stroke: TerminalKeyStroke, expected: string]
> = [
  // Bare characters pass through verbatim.
  ["bare lowercase", { key: "character", character: "q" }, "q"],
  ["bare space", { key: "character", character: " " }, " "],
  ["bare non-ascii", { key: "character", character: "é" }, "é"],
  // Shift realizes case on characters; Back-Tab is the one shifted named form.
  ["shift uppercases", { key: "character", character: "a", modifiers: ["shift"] }, "A"],
  ["shift keeps uppercase", { key: "character", character: "A", modifiers: ["shift"] }, "A"],
  ["shift tab backtabs", { key: "tab", modifiers: ["shift"] }, `${ESC}[Z`],
  // The classic C0 chords, including the punctuation band.
  ["ctrl+c folds to etx", { key: "character", character: "c", modifiers: ["ctrl"] }, c0(0x03)],
  ["ctrl+d folds to eot", { key: "character", character: "d", modifiers: ["ctrl"] }, c0(0x04)],
  ["ctrl+l folds to ff", { key: "character", character: "l", modifiers: ["ctrl"] }, c0(0x0c)],
  ["ctrl+a folds to soh", { key: "character", character: "a", modifiers: ["ctrl"] }, c0(0x01)],
  ["ctrl+z folds to sub", { key: "character", character: "z", modifiers: ["ctrl"] }, c0(0x1a)],
  [
    "uppercase input folds identically",
    { key: "character", character: "C", modifiers: ["ctrl"] },
    c0(0x03),
  ],
  ["ctrl+@ folds to nul", { key: "character", character: "@", modifiers: ["ctrl"] }, c0(0x00)],
  ["ctrl+[ folds to esc", { key: "character", character: "[", modifiers: ["ctrl"] }, ESC],
  [
    "ctrl+backslash folds to fs",
    { key: "character", character: "\\", modifiers: ["ctrl"] },
    c0(0x1c),
  ],
  ["ctrl+] folds to gs", { key: "character", character: "]", modifiers: ["ctrl"] }, c0(0x1d)],
  ["ctrl+^ folds to rs", { key: "character", character: "^", modifiers: ["ctrl"] }, c0(0x1e)],
  ["ctrl+_ folds to us", { key: "character", character: "_", modifiers: ["ctrl"] }, c0(0x1f)],
  [
    "shifted ctrl chord still folds",
    { key: "character", character: "c", modifiers: ["ctrl", "shift"] },
    c0(0x03),
  ],
  // Bare named keys use the classic sequences.
  ["bare enter", { key: "enter" }, "\r"],
  ["bare backspace", { key: "backspace" }, DEL],
  ["bare tab", { key: "tab" }, "\t"],
  ["bare escape", { key: "escape" }, ESC],
  ["bare up", { key: "up" }, `${ESC}[A`],
  ["bare home", { key: "home" }, `${ESC}[H`],
  ["bare pageUp", { key: "pageUp" }, `${ESC}[5~`],
  // Modified keys use the xterm CSI forms.
  ["shift arrow", { key: "up", modifiers: ["shift"] }, `${ESC}[1;2A`],
  ["ctrl arrow", { key: "up", modifiers: ["ctrl"] }, `${ESC}[1;5A`],
  ["ctrl left arrow", { key: "left", modifiers: ["ctrl"] }, `${ESC}[1;5D`],
  ["alt character", { key: "character", character: "b", modifiers: ["alt"] }, `${ESC}[66;3u`],
  ["meta character", { key: "character", character: "c", modifiers: ["meta"] }, `${ESC}[67;9u`],
  [
    "ctrl+meta character",
    { key: "character", character: "c", modifiers: ["ctrl", "meta"] },
    `${ESC}[67;13u`,
  ],
  [
    "all modifiers character",
    { key: "character", character: "c", modifiers: ["shift", "alt", "ctrl", "meta"] },
    `${ESC}[67;16u`,
  ],
  ["ctrl enter", { key: "enter", modifiers: ["ctrl"] }, `${ESC}[13;5u`],
  ["ctrl backspace", { key: "backspace", modifiers: ["ctrl"] }, `${ESC}[127;5u`],
  ["ctrl escape", { key: "escape", modifiers: ["ctrl"] }, `${ESC}[27;5u`],
  ["ctrl tab", { key: "tab", modifiers: ["ctrl"] }, `${ESC}[9;5u`],
  ["alt tab", { key: "tab", modifiers: ["alt"] }, `${ESC}[9;3u`],
  ["shift enter", { key: "enter", modifiers: ["shift"] }, `${ESC}[13;2u`],
  // [R1] Ctrl-only (and Ctrl+Shift) on a fold-band miss uses the CSI-u
  // form — iOS used to pass the character through unmodified.
  [
    "ctrl+1 fold miss is csi-u",
    { key: "character", character: "1", modifiers: ["ctrl"] },
    `${ESC}[49;5u`,
  ],
  [
    "ctrl+shift+1 fold miss is csi-u",
    { key: "character", character: "1", modifiers: ["ctrl", "shift"] },
    `${ESC}[49;6u`,
  ],
  [
    "ctrl+space fold miss is csi-u",
    { key: "character", character: " ", modifiers: ["ctrl"] },
    `${ESC}[32;5u`,
  ],
  [
    "ctrl+delete fold miss is csi-u",
    { key: "character", character: DEL, modifiers: ["ctrl"] },
    `${ESC}[127;5u`,
  ],
  // [R2] The CSI-u code point is the Unicode SCALAR value: a single
  // supplementary scalar maps by code point (Android used to emit the
  // first UTF-16 unit — a lone surrogate — into the PTY stream), while a
  // multi-scalar character is unmappable and falls back to the bare
  // sequence instead of emitting a broken escape.
  [
    "single supplementary scalar maps by code point",
    { key: "character", character: "👍", modifiers: ["alt"] },
    `${ESC}[128077;3u`,
  ],
  [
    "multi-scalar character under alt falls back",
    { key: "character", character: "👍🏻", modifiers: ["alt"] },
    "👍🏻",
  ],
  ["multi-scalar character bare passes through", { key: "character", character: "👍🏻" }, "👍🏻"],
  // [R3] The C0 fold measures Unicode scalars. A multi-scalar uppercase
  // ('ß' uppercases to the two-scalar "SS") neither folds nor maps to
  // CSI-u, so it passes through — Android used to throw on `.single()`
  // here. A single non-ASCII scalar whose uppercase lands in the band
  // ('ſ' → "S") folds; a single scalar that uppercases outside the band
  // ('ⅴ' → 'Ⅴ') is a fold miss and CSI-u maps instead.
  [
    "ctrl+sharp-s passes through unflopped",
    { key: "character", character: "ß", modifiers: ["ctrl"] },
    "ß",
  ],
  [
    "ctrl+long-s folds through uppercase mapping",
    { key: "character", character: "ſ", modifiers: ["ctrl"] },
    c0(0x13),
  ],
  [
    "ctrl+roman-numeral-five fold miss is csi-u",
    { key: "character", character: "ⅴ", modifiers: ["ctrl"] },
    `${ESC}[8548;5u`,
  ],
];

describe("terminal key encoding spec", () => {
  it("validates and encodes the shared vector table", () => {
    expect(validateTerminalKeyEncodingSpec(TERMINAL_KEY_ENCODING_SPEC)).toEqual([]);
    for (const [label, stroke, expected] of VECTORS) {
      const actual = encodeTerminalKeyStroke(stroke);
      expect(`${label}: ${JSON.stringify(actual)}`).toBe(`${label}: ${JSON.stringify(expected)}`);
    }
  });

  it("keeps the modifier math at 1 + shift(1) + alt(2) + ctrl(4) + meta(8)", () => {
    expect(terminalKeyCsiModifier(0)).toBe(1);
    expect(terminalKeyCsiModifier(0b1111)).toBe(16);
  });

  it("fails closed on an unsound rule table", () => {
    const rules = TERMINAL_KEY_ENCODING_SPEC.rules as readonly TerminalKeyEncodingRule[];
    const dropCatchAll = { ...TERMINAL_KEY_ENCODING_SPEC, rules: rules.slice(0, -1) };
    expect(validateTerminalKeyEncodingSpec(dropCatchAll)).toContain(
      "the rule table must end with the passthrough catch-all",
    );
    const reordered = {
      ...TERMINAL_KEY_ENCODING_SPEC,
      rules: [rules.at(-1)!, ...rules.slice(0, -1)],
    };
    expect(validateTerminalKeyEncodingSpec(reordered)).toContain(
      "the always guard must be the last rule",
    );
    const duplicated = { ...TERMINAL_KEY_ENCODING_SPEC, rules: [...rules, rules[0]!] };
    expect(validateTerminalKeyEncodingSpec(duplicated)).toContain(
      `duplicate rule id ${rules[0]!.id}`,
    );
    const unknownGuard = {
      ...TERMINAL_KEY_ENCODING_SPEC,
      rules: [
        ...rules.slice(0, -1),
        {
          id: "future",
          guard: "someday",
          effect: "verbatim",
        } as unknown as TerminalKeyEncodingRule,
      ],
    };
    expect(validateTerminalKeyEncodingSpec(unknownGuard)).toContain(
      "rule future names unknown guard someday",
    );
  });

  it("fails closed when the lookup tables do not cover the key set", () => {
    const rules = TERMINAL_KEY_ENCODING_SPEC.rules as readonly TerminalKeyEncodingRule[];
    const missingCsiU = { ...TERMINAL_KEY_ENCODING_SPEC, csiUCodePoints: {}, rules };
    expect(validateTerminalKeyEncodingSpec(missingCsiU)).toContain(
      "named key escape has no CSI-u code point",
    );
    const strayArrow = {
      ...TERMINAL_KEY_ENCODING_SPEC,
      csiUCodePoints: { ...TERMINAL_KEY_ENCODING_SPEC.csiUCodePoints, up: 1 },
      rules,
    };
    expect(validateTerminalKeyEncodingSpec(strayArrow)).toContain(
      "csiUCodePoints must not name arrow key up",
    );
  });
});
