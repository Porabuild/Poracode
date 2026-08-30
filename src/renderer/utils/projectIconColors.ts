import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface ProjectIconColor {
  /** Stored in the icon value as `lucide:<name>:<id>`. */
  readonly id: string;
  readonly label: MessageDescriptor;
  /** Theme variable from `styles.css`, so each colour tracks the appearance. */
  readonly cssValue: string;
}

/**
 * Tints offered for bundled glyphs. Images (`auto`, `file:`) carry their own
 * colours and are never tinted.
 */
export const PROJECT_ICON_COLORS: readonly ProjectIconColor[] = [
  { id: "red", label: msg`Red`, cssValue: "var(--project-icon-red)" },
  { id: "orange", label: msg`Orange`, cssValue: "var(--project-icon-orange)" },
  { id: "amber", label: msg`Amber`, cssValue: "var(--project-icon-amber)" },
  { id: "green", label: msg`Green`, cssValue: "var(--project-icon-green)" },
  { id: "teal", label: msg`Teal`, cssValue: "var(--project-icon-teal)" },
  { id: "blue", label: msg`Blue`, cssValue: "var(--project-icon-blue)" },
  { id: "violet", label: msg`Violet`, cssValue: "var(--project-icon-violet)" },
  { id: "pink", label: msg`Pink`, cssValue: "var(--project-icon-pink)" },
];

const colorIndex = new Map(PROJECT_ICON_COLORS.map((color) => [color.id, color]));

/**
 * A custom colour is stored as its six lowercase hex digits, which keeps the
 * icon value a single catalog token (`lucide:rocket:5f6cd9`) — no separate
 * field, no new persisted column, and no preset id can collide with it.
 */
const CUSTOM_COLOR = /^[0-9a-f]{6}$/;

export function isCustomProjectIconColor(id: string | undefined): boolean {
  return !!id && !colorIndex.has(id) && CUSTOM_COLOR.test(id);
}

/** `#rrggbb` for a custom colour id, for feeding a colour input. */
export function customProjectIconColorHex(id: string | undefined): string | undefined {
  return isCustomProjectIconColor(id) ? `#${id}` : undefined;
}

/** The stored form of a `#rrggbb` value picked in the colour picker. */
export function formatCustomProjectIconColor(hex: string): string {
  return hex.replace("#", "").toLowerCase();
}

/** Look up a preset by id. Custom (hex) colours are not presets. */
export function findProjectIconColor(id: string | undefined): ProjectIconColor | undefined {
  return id ? colorIndex.get(id) : undefined;
}

/**
 * CSS colour for a stored id — a preset's theme variable or a custom hex.
 * Unknown ids resolve to undefined so the glyph still renders in the
 * surrounding text colour: a value from an older or newer app version degrades
 * to "untinted", never to a missing icon.
 */
export function resolveProjectIconColor(id: string | undefined): string | undefined {
  const preset = findProjectIconColor(id);
  if (preset) return preset.cssValue;
  return customProjectIconColorHex(id);
}
