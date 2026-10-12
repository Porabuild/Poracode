import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import type { ModelFamilyControlPresentation } from "../modelFamilyControlOptions";

/**
 * Native option labels carry component effort; pair UIDs remain opaque.
 * Match only the known native suffix vocabulary. Unknown labels stay exact
 * unsplit choices, including product names such as SWE-1.6 Fast.
 */
export const devinModelFamilyPresentation: ModelFamilyControlPresentation = {
  accepts: (family) => family.label === "Fusion",
  selectorLabel: (id) => (id === "lead" ? i18n._(msg`Main`) : undefined),
  // The family compiler names the encoded axis lead effort. ACP exposes the
  // same main-model control via its live thought_level ladder; a representative
  // label's embedded effort is not the session's current level.
  configEffortScope: "primary",
  option: (_selectorId, option) => {
    const match = /^(.*?) (Low|Medium|High|Extra High|Max|Ultra)(?: Thinking)?$/i.exec(
      option.label,
    );
    if (!match?.[1] || !match[2]) return undefined;
    return {
      model: { id: match[1], label: match[1] },
      effort: match[2].toLowerCase().replace("extra high", "xhigh"),
    };
  },
};
