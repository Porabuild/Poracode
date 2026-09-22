import { open } from "node:fs/promises";
import {
  LOCALE_SETTING_VALUES,
  resolveLocale,
  type LocaleSetting,
  type SupportedLocale,
} from "@/shared/locale";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { PROMOTION_PROGRESS_MESSAGES } from "./promotionMessages.generated";

/** The two strings the pre-renderer promotion window renders. */
export interface DesktopPromotionProgressStrings {
  readonly title: string;
  readonly body: string;
}

/**
 * The two roots a desktop promotion spans: the plain profile namespace it
 * copies from and the owned `.host-v1` sibling it copies into.
 */
export interface DesktopPromotionProgressRoots {
  readonly sourceRoot: string;
  readonly ownedRoot: string;
}

/**
 * Upper bound for the one settings read admission performs. `locale` sits near
 * the top of `settings.json`; the bound exists so a corrupt or enormous file
 * delays neither startup nor the copy — an over-bound file is treated as
 * "no saved locale" and resolves through the system language.
 */
export const PROMOTION_SETTINGS_READ_MAX_BYTES = 1024 * 1024;

/** The committed catalog subset for one resolved locale. */
export function promotionProgressStringsFor(
  locale: SupportedLocale,
): DesktopPromotionProgressStrings {
  return {
    title: PROMOTION_PROGRESS_MESSAGES["desktop.promotion.progress.title"][locale],
    body: PROMOTION_PROGRESS_MESSAGES["desktop.promotion.progress.body"][locale],
  };
}

/** Bounded UTF-8 read; missing, unreadable, or over-bound files yield `undefined`. */
async function readBoundedUtf8(path: string): Promise<string | undefined> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, "r");
  } catch {
    return undefined;
  }
  try {
    const buffer = Buffer.allocUnsafe(PROMOTION_SETTINGS_READ_MAX_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > PROMOTION_SETTINGS_READ_MAX_BYTES) return undefined;
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch {
    return undefined;
  } finally {
    await handle.close().catch(() => {});
  }
}

/**
 * Read only the `locale` field out of a `settings.json`. This runs during
 * admission, before any settings authority exists, so it deliberately uses a
 * bounded read of the raw file instead of the full settings schema: unknown
 * values, corrupt JSON, and unreadable or oversized files all resolve to
 * `undefined` and never throw.
 */
export async function readSavedLocaleSetting(
  settingsPath: string,
): Promise<LocaleSetting | undefined> {
  const text = await readBoundedUtf8(settingsPath);
  if (text === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const value = (parsed as { locale?: unknown }).locale;
  if (typeof value !== "string") return undefined;
  return (LOCALE_SETTING_VALUES as readonly string[]).includes(value)
    ? (value as LocaleSetting)
    : undefined;
}

/**
 * Resolve the promotion window's strings from the profile the user was just
 * using, before the copy starts.
 *
 * The plain source root is read first because a promotion never modifies it:
 * it stays the pre-promotion copy, so its `settings.json` is the profile the
 * user last saved. The owned root is only a fallback for a resumed promotion
 * whose source settings are gone; a missing or unknown locale setting resolves
 * through `resolveLocale` (system languages, then English) without blocking the
 * copy. Callers resolve this once per promotion — progress updates must never
 * re-read settings.
 */
export async function resolvePromotionProgressStrings(
  roots: DesktopPromotionProgressRoots,
  preferredLanguages: readonly string[],
): Promise<DesktopPromotionProgressStrings> {
  const sourceSetting = await readSavedLocaleSetting(
    resolvePoracodePaths(roots.sourceRoot).settingsPath,
  );
  const saved =
    sourceSetting ??
    (await readSavedLocaleSetting(resolvePoracodePaths(roots.ownedRoot).settingsPath));
  return promotionProgressStringsFor(resolveLocale(saved ?? "system", preferredLanguages));
}
