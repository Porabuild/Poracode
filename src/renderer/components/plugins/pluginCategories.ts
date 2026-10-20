import { useLingui } from "@lingui/react/macro";
import type { PluginCategorySectionId } from "@/shared/plugins/categories";

/**
 * Localized labels for the canonical marketplace sections.
 *
 * Kept separate from `categories.ts` because that module is shared with the
 * supervisor and must stay catalog-free; these ids are the only stable part.
 */
export function usePluginCategoryLabel(): (id: PluginCategorySectionId) => string {
  const { t } = useLingui();
  return (id) => {
    switch (id) {
      case "developer-tools":
        return t`Developer tools`;
      case "productivity":
        return t`Productivity`;
      case "data-analytics":
        return t`Data and databases`;
      case "monitoring":
        return t`Monitoring`;
      case "security":
        return t`Security`;
      case "design":
        return t`Design and creativity`;
      case "deployment":
        return t`Deployment`;
      case "communication":
        return t`Communication`;
      case "learning-research":
        return t`Learning and research`;
      case "finance":
        return t`Finance`;
      case "automation":
        return t`Automation`;
      case "testing":
        return t`Testing`;
      case "location":
        return t`Location and maps`;
      case "migration":
        return t`Migration`;
      case "business-operations":
        return t`Business and operations`;
      case "other":
        return t`Other`;
    }
  };
}
