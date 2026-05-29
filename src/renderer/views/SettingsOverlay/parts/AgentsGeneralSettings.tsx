import { ModelOrderSection } from "./ModelOrderSection";
import { ModelVisibilitySection } from "./ModelVisibilitySection";
import { SettingsPage } from "./SettingsForm";

export function AgentsGeneralSettings() {
  return (
    <SettingsPage title="Agents · General">
      <ModelVisibilitySection />
      <ModelOrderSection />
    </SettingsPage>
  );
}
