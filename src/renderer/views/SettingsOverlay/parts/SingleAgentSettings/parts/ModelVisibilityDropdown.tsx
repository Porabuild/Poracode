import { Trans, useLingui } from "@lingui/react/macro";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu";
import { modelFamilyMemberIds } from "@/renderer/components/common/ProviderModelMenu/parts/modelFamilyDisplay";
import { providerVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { resolveHiddenModelIds } from "@/shared/agentSelection";
import { resolveEffectiveHiddenIdsByKey } from "../../modelVisibilityCatalog";
import { ModelVisibilityPopover } from "../../ModelVisibilityPopover";

export function ModelVisibilityDropdown(props: {
  settingsKey: string;
  provider: ProviderModelMenuProvider;
  /**
   * Sibling visibility surfaces of the same agent. When several surfaces share
   * `settingsKey`, initial defaults union across them and edits on this surface
   * preserve hidden IDs owned only by a sibling surface.
   */
  siblingProviders?: readonly ProviderModelMenuProvider[];
  /**
   * Label naming this model surface in the row title. Set when the agent
   * expands to multiple visibility providers (e.g. a CLI + ACP runtime pair)
   * so sibling rows stay distinguishable; see `modelSurfaceLabel`.
   */
  surfaceLabel?: string;
}) {
  const { t } = useLingui();
  const { settingsKey, provider } = props;
  const hiddenIds = useSharedSettings((state) => state.hiddenModels[settingsKey]);
  const setHiddenModels = useSharedSettings((state) => state.setHiddenModels);
  const sameKeySiblings = (props.siblingProviders ?? [provider]).filter(
    (candidate) => providerVisibilityKey(candidate) === settingsKey,
  );
  const effectiveHiddenIds =
    sameKeySiblings.length > 1
      ? (resolveEffectiveHiddenIdsByKey(sameKeySiblings, { [settingsKey]: hiddenIds })[
          settingsKey
        ] ?? [])
      : resolveHiddenModelIds(provider.capabilities, hiddenIds);

  const handleHiddenIdsChange = (_key: string, next: string[]) => {
    if (sameKeySiblings.length <= 1) {
      setHiddenModels(settingsKey, next);
      return;
    }
    const memberIds = modelFamilyMemberIds(provider.capabilities);
    const ownedIds = new Set<string>();
    for (const model of provider.capabilities.models) {
      ownedIds.add(model.id);
      for (const memberId of memberIds.get(model.id) ?? []) ownedIds.add(memberId);
    }
    const preservedForeign = effectiveHiddenIds.filter((id) => !ownedIds.has(id));
    setHiddenModels(settingsKey, [...new Set([...preservedForeign, ...next])]);
  };

  const label = props.surfaceLabel ? t`Visible ${props.surfaceLabel} models` : t`Visible models`;

  return (
    <div className="group flex items-center justify-between gap-4 border-b border-border/10 py-2 last:border-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="line-clamp-1 text-[11px] text-muted transition-all group-hover:line-clamp-none">
          <Trans>Toggle models off to hide them from the selector.</Trans>
        </p>
      </div>
      <ModelVisibilityPopover
        providers={[{ ...provider, hiddenModelsKey: settingsKey }]}
        hiddenIdsByKey={{ [settingsKey]: effectiveHiddenIds }}
        onHiddenIdsChange={handleHiddenIdsChange}
        listAriaLabel={label}
        triggerAriaLabel={label}
        summaryKind="visible"
        triggerClassName="min-w-[4.5rem] tabular-nums"
      />
    </div>
  );
}
