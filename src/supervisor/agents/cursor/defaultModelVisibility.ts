import type { LabeledOption } from "@/shared/contracts";

type LegacyCursorFamily = "composer" | "gemini" | "gpt" | "opus" | "sonnet";

/**
 * Read the numeric generation adjacent to a family name. Cursor model ids use
 * both decimal (`gpt-5.5`) and dashed (`claude-opus-4-7`) versions, while the
 * display labels consistently keep the human-readable decimal form.
 */
function familyVersion(value: string, family: LegacyCursorFamily): number | undefined {
  const normalized = value.trim().toLowerCase();
  const familyMatch = new RegExp(`\\b${family}\\b`, "u").exec(normalized);
  if (!familyMatch) return undefined;

  const afterFamily = normalized.slice(familyMatch.index + familyMatch[0].length);
  const adjacent = /^[^0-9]*(\d+)(?:[._-](\d+))?/u.exec(afterFamily);
  const fallback = /(\d+)(?:[._-](\d+))?/u.exec(normalized);
  const match = adjacent ?? fallback;
  if (!match) return undefined;

  const major = Number.parseInt(match[1]!, 10);
  const minor = match[2];
  return minor ? major + Number.parseInt(minor, 10) / 10 ** minor.length : major;
}

function modelFamilyVersion(
  model: Pick<LabeledOption, "id" | "label">,
  family: LegacyCursorFamily,
): number | undefined {
  return familyVersion(model.label, family) ?? familyVersion(model.id, family);
}

/**
 * Keep Cursor's live catalogs intact while de-emphasizing superseded model
 * generations on first use. The provider supplies ids rather than making the
 * shared picker understand Cursor naming.
 */
export function isLegacyCursorModel(model: Pick<LabeledOption, "id" | "label">): boolean {
  const gpt = modelFamilyVersion(model, "gpt");
  if (gpt !== undefined) return gpt <= 5.5;

  const opus = modelFamilyVersion(model, "opus");
  if (opus !== undefined) return opus < 5;

  const sonnet = modelFamilyVersion(model, "sonnet");
  if (sonnet !== undefined) return sonnet < 5;

  const gemini = modelFamilyVersion(model, "gemini");
  if (gemini !== undefined) return gemini < 3.6;

  const composer = modelFamilyVersion(model, "composer");
  return composer === 2;
}

export function cursorDefaultHiddenModels(
  models: readonly Pick<LabeledOption, "id" | "label">[],
): string[] {
  const hidden = models.filter(isLegacyCursorModel);
  // Provider defaults must not leave a usable catalog with no selectable
  // model. Auto normally remains visible, but limited accounts may advertise
  // only older named models.
  if (hidden.length === models.length && hidden.length > 0) hidden.shift();
  return hidden.map((model) => model.id);
}
