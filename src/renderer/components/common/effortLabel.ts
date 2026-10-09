import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { i18n } from "@/renderer/i18n/i18n";
import { canonicalizeEffortId } from "@/shared/effortOrder";

const effortLabels: Record<string, MessageDescriptor> = {
  none: msg`None`,
  minimal: msg`Minimal`,
  low: msg`Low`,
  medium: msg`Medium`,
  high: msg`High`,
  xhigh: msg`Extra High`,
  max: msg`Max`,
};

/**
 * Localized effort display label, shared by the composer controls, the
 * shortcut (favorites/recents) labels, and the family member labels. Kept in
 * `common/` so common menu code can localize encoded Effort coordinates
 * without depending on `components/thread`.
 */
export function formatEffortLabel(id: string): string {
  const key = canonicalizeEffortId(id);
  const label = Object.hasOwn(effortLabels, key) ? effortLabels[key] : undefined;
  if (label) return i18n._(label);
  if (id === "ultracode") return "Ultracode";
  return id.charAt(0).toUpperCase() + id.slice(1);
}
