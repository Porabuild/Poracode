import { useLingui } from "@lingui/react/macro";
import { ProviderModelMenu } from "@/renderer/components/common/ProviderModelMenu/ProviderModelMenu";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import type { CrewMemberSelection } from "@/shared/crew";

/**
 * The roster's "Add role" entry point. A role is created only after the user
 * picks the profile it runs, instead of silently taking the next default
 * helper. No current-model preselection: every pick is a deliberate choice.
 */
export function AddCrewRoleMenu(props: {
  providers: ProviderModelMenuProvider[];
  isDisabled: boolean;
  selectionFor: (
    agentKind: string,
    model: string,
    selectionIntent?: "family" | "exact",
  ) => CrewMemberSelection | undefined;
  onAdd: (selection: CrewMemberSelection) => void;
}) {
  const { t } = useLingui();
  const hasModels = props.providers.some((provider) => provider.capabilities.models.length > 0);
  return (
    <div className="mt-1 flex h-7 items-center px-1.5 text-xs text-muted">
      <ProviderModelMenu
        triggerAppearance="label"
        triggerLabel={t`Add role`}
        menuLabel={t`Model for the new role`}
        providers={props.providers}
        currentAgentKind=""
        currentModel=""
        isDisabled={props.isDisabled || !hasModels}
        onChange={(next) => {
          const selection = props.selectionFor(next.agentKind, next.model, next.selectionIntent);
          if (!selection) return;
          props.onAdd(selection);
        }}
      />
    </div>
  );
}
