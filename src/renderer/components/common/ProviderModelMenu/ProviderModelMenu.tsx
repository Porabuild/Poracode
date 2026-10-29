import { startTransition, useDeferredValue, useId, useRef, useState, type ReactNode } from "react";
import type { SavedCrew } from "@/shared/crew";
import { withCrewPickerItems } from "./parts/crewPickerItems";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronDown } from "lucide-react";
import { Tooltip } from "@heroui/react";
import { reorderModelPickerRefs } from "@/shared/modelPickerOrder";
import {
  WindowedProviderModelList,
  type WindowedProviderModelListHandle,
} from "./parts/WindowedProviderModelList";
import { ModelMenuSearchInput } from "./parts/ModelMenuSearchInput";
import {
  buildScopedModelItems,
  scopedModelOptionDisplay,
  type ScopedModelOption,
} from "./parts/scopedModelOptions";
import { MODEL_MENU_ROW_HEIGHT, MODEL_MENU_ROW_HEIGHT_MOBILE } from "./parts/modelMenuRowMetrics";
import { useMenuSearchAutofocus } from "./parts/useMenuSearchAutofocus";
import { splitModelLabel } from "./parts/splitModelLabel";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { PoracodeGlyph } from "@/renderer/components/common/PoracodeGlyph";
import { ResponsiveMenuSurface, useResponsiveMenu } from "../ResponsiveMenuSurface";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { effectiveProviderOrder } from "@/shared/machineSettings";
import { LOCAL_NATIVE_MACHINE_KEY } from "@/shared/machines";
import { baseAgentKind, type ThreadPresentationMode } from "@/shared/contracts";
import { migrateCursorBaseId, parseCursorModelId } from "@/shared/cursorModelId";
import {
  canonicalProviderModelId,
  defaultFastEnabled,
  normalizeProviderModelConfig,
} from "@/renderer/components/providers/modelConfig";
import { Button } from "../Button";
import {
  buildProviderModelItems,
  type ModelRef,
  type ProviderModelMenuProvider,
} from "./parts/buildItems";
import { distinctSubProviderLabel } from "./parts/deriveSubProvider";
import { modelFamilyMemberDisplay } from "./parts/modelFamilyDisplay";
import { providerMenuKey } from "./parts/providerIdentity";
import type { ProviderModelItem, ProviderModelSelection } from "./parts/types";
export type { ProviderModelSelection, ProviderModelSelectionIntent } from "./parts/types";

export type { ProviderModelMenuProvider };

export interface ProviderModelCrewSection {
  /** Existing crew threads offer compatible presets without a lead-model picker. */
  onlyCrews?: boolean;
  entries: Array<{
    crewId: string;
    name: string;
    leadLabel: string;
    leadKind: string;
    helperKinds: string[];
    details: string;
  }>;
  currentCrewId?: string;
  current?: { name: string };
  canCreate: boolean;
  onSelect: (choice: { crewId: string } | { newCrew: true }) => void;
}

export interface ProviderModelMenuProps {
  /** Providers to surface (typically all installed agents for draft, locked-only otherwise). */
  providers: ProviderModelMenuProvider[];
  /**
   * Restrict this picker to exact selector coordinates. Reuses the standard
   * surface, rows, search, scrolling and keyboard handling while excluding
   * model normalization, hidden models, favorites, recents and fallback rows.
   */
  optionScope?: { label: string; icon: ReactNode; options: readonly ScopedModelOption[] };
  crewSection?: ProviderModelCrewSection;
  /** Full-width field trigger for a configuration panel; "label" is a bare text
   * trigger for inline rows that carry their own provider icon. */
  triggerAppearance?: "composer" | "field" | "label";
  /** Text shown inside a "label" trigger; defaults to the current model name. */
  triggerLabel?: string;
  /** Accessible name for the trigger and menu surface (defaults to "Select model"). */
  menuLabel?: string;
  currentAgentKind: string;
  currentModel: string;
  /** When set, only this provider's rows are rendered. */
  lockedAgentKind?: string;
  presentationMode?: ThreadPresentationMode;
  /**
   * Machine whose provider-order preference applies ("local" when omitted).
   * Only affects ordering while the provider-order lock is off.
   */
  machineKey?: string;
  isDisabled?: boolean;
  hideLabelOnWrap?: boolean;
  forceHideLabel?: boolean;
  /** Hide tuple details when the pairing control already displays them. */
  showFamilySelectionSummary?: boolean;
  collapseTier?: number;
  openSignal?: number;
  onChange: (next: ProviderModelSelection) => void;
  onOpenChange?: (open: boolean) => void;
}

function normalizeCurrentModelForProvider(
  provider: ProviderModelMenuProvider | undefined,
  modelId: string,
): string {
  if (!provider || provider.capabilities.models.some((model) => model.id === modelId)) {
    return modelId;
  }
  const canonicalModel = canonicalProviderModelId(
    provider.kind,
    modelId,
    provider.capabilities.models,
  );
  if (canonicalModel !== modelId) return canonicalModel;
  if (baseAgentKind(provider.kind) !== "cursor") {
    return modelId;
  }
  const normalized = migrateCursorBaseId(parseCursorModelId(modelId).baseId);
  return provider.capabilities.models.some((model) => model.id === normalized)
    ? normalized
    : modelId;
}

function refsForPresentation(
  refs: readonly ModelRef[],
  presentationMode: ThreadPresentationMode | undefined,
): readonly ModelRef[] {
  if (!presentationMode) return refs;
  return refs.filter((ref) => ref.presentationMode === presentationMode);
}

export function ProviderModelMenu(props: ProviderModelMenuProps) {
  const {
    providers,
    optionScope,
    crewSection,
    triggerAppearance = "composer",
    currentAgentKind,
    currentModel,
    lockedAgentKind,
    presentationMode,
    isDisabled,
    hideLabelOnWrap,
    forceHideLabel = false,
    showFamilySelectionSummary = true,
    collapseTier,
    openSignal,
    onChange,
    onOpenChange,
  } = props;

  const { t } = useLingui();
  const menuLabel = optionScope?.label ?? props.menuLabel ?? t`Select model`;
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeModelItemId, setActiveModelItemId] = useState<string | null>(null);
  const [sessionFavorites, setSessionFavorites] = useState<readonly ModelRef[] | undefined>(
    undefined,
  );
  const [sessionRecents, setSessionRecents] = useState<readonly ModelRef[] | undefined>(undefined);
  const [sessionCrews, setSessionCrews] = useState<readonly SavedCrew[] | undefined>(undefined);
  const deferredSearch = useDeferredValue(search);
  const searchRef = useRef<HTMLInputElement>(null);
  const windowedListRef = useRef<WindowedProviderModelListHandle>(null);
  const listboxDomIdPrefix = useId();

  const crews = useSharedSettings((s) => s.crews);
  const favorites = useSharedSettings((s) => s.favoriteModels);
  const recents = useSharedSettings((s) => s.recentModels);
  const providerOrder = useSharedSettings((s) =>
    effectiveProviderOrder(s, props.machineKey ?? LOCAL_NATIVE_MACHINE_KEY),
  );
  const hiddenModels = useSharedSettings((s) => s.hiddenModels);
  const providerModelPreferences = useSharedSettings((s) => s.providerModelPreferences);
  const providerConfigs = useSharedSettings((s) => s.providerConfigs);
  const toggleFavoriteModel = useSharedSettings((s) => s.toggleFavoriteModel);

  const currentProvider =
    providers.find(
      (p) =>
        p.kind === currentAgentKind &&
        (presentationMode === undefined || p.presentationMode === presentationMode),
    ) ?? providers.find((p) => p.kind === currentAgentKind);
  const currentProviderKey = currentProvider ? providerMenuKey(currentProvider) : currentAgentKind;
  const effectiveCurrentModel = optionScope
    ? currentModel
    : normalizeCurrentModelForProvider(currentProvider, currentModel);
  // A projected family member reads as the family name plus its current
  // selector options — never the giant native pair label — and suppresses the
  // group hint, which would only repeat the family name.
  const currentFamilyDisplay = optionScope
    ? undefined
    : modelFamilyMemberDisplay(currentProvider?.capabilities, effectiveCurrentModel);
  const currentLabel =
    (optionScope ? scopedModelOptionDisplay(optionScope.options, currentModel) : undefined) ??
    currentFamilyDisplay?.familyLabel ??
    currentProvider?.capabilities.models.find((m) => m.id === effectiveCurrentModel)?.label ??
    effectiveCurrentModel;
  const currentLabelParts = splitModelLabel(currentLabel);
  const currentSubProviderLabel =
    currentProvider && !currentFamilyDisplay
      ? distinctSubProviderLabel(
          effectiveCurrentModel,
          currentProvider.capabilities,
          currentLabelParts.name,
        )
      : undefined;
  // The pairing control already shows the tuple. Keep the model trigger on
  // the family name so it does not repeat those controls or consume their width.
  const currentSubLabel =
    (triggerAppearance === "field" ? undefined : optionScope?.label) ??
    (currentFamilyDisplay
      ? showFamilySelectionSummary
        ? currentFamilyDisplay.selectorSummary
        : undefined
      : currentSubProviderLabel);
  const currentName =
    crewSection?.current?.name ?? (optionScope ? currentLabel : currentLabelParts.name);
  const currentDisplayLabel =
    !crewSection?.current && currentSubLabel ? `${currentName} · ${currentSubLabel}` : currentName;
  // Snapshot the favorites/recents lists when the menu opens so rows stay
  // stable while it is open; the search-field focus stays in the effect below.
  const [prevMenuOpen, setPrevMenuOpen] = useState(isOpen);
  if (prevMenuOpen !== isOpen) {
    setPrevMenuOpen(isOpen);
    if (isOpen) {
      setSearch("");
      setSessionFavorites(favorites);
      setSessionRecents(recents);
      setSessionCrews(crews);
    } else {
      setSessionFavorites(undefined);
      setSessionRecents(undefined);
      setSessionCrews(undefined);
    }
  }

  useMenuSearchAutofocus(isOpen, mobile, searchRef);

  // An external `openSignal` bump opens the menu, tracked as a render snapshot
  // with the previous effect's re-run semantics.
  const [prevOpenSignal, setPrevOpenSignal] = useState({
    signal: openSignal,
    disabled: isDisabled,
  });
  if (prevOpenSignal.signal !== openSignal || prevOpenSignal.disabled !== isDisabled) {
    setPrevOpenSignal({ signal: openSignal, disabled: isDisabled });
    if (openSignal !== undefined && !isDisabled) setIsOpen(true);
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) setActiveModelItemId(null);
    onOpenChange?.(open);
  }

  // Build the row model only while the popover is open. The composer can mount
  // this control twice for wrap measurement, so closed menus should stay as
  // cheap as a trigger label lookup.
  const deferredAgentKind = useDeferredValue(currentAgentKind);
  const deferredModel = useDeferredValue(effectiveCurrentModel);
  const activeFavorites = refsForPresentation(favorites, presentationMode);
  const sectionFavorites = refsForPresentation(
    isOpen ? (sessionFavorites ?? favorites) : favorites,
    presentationMode,
  );
  const sectionRecents = refsForPresentation(
    isOpen ? (sessionRecents ?? recents) : recents,
    presentationMode,
  );
  function buildItemsForSearch(searchValue: string) {
    if (optionScope) {
      return buildScopedModelItems(optionScope.options, searchValue, currentAgentKind, menuLabel);
    }
    const modelItems = crewSection?.onlyCrews
      ? []
      : buildProviderModelItems({
          providers,
          search: searchValue,
          ...(lockedAgentKind ? { lockedAgentKind } : {}),
          currentAgentKind: deferredAgentKind,
          currentModel: deferredModel,
          favorites: sectionFavorites,
          favoriteStateRefs: activeFavorites,
          recents: sectionRecents,
          hiddenModels,
          providerOrder,
        });
    if (!crewSection) return modelItems;
    const query = searchValue.trim().toLocaleLowerCase();
    const crewRows = crewSection.entries
      .filter((entry) => !query || entry.name.toLocaleLowerCase().includes(query))
      .map((entry) => ({
        type: "crew" as const,
        id: `crew:${entry.crewId}`,
        crewId: entry.crewId,
        name: entry.name,
        leadLabel: entry.leadLabel,
        leadKind: entry.leadKind,
        helperKinds: entry.helperKinds,
        details: entry.details,
        isCurrent: entry.crewId === crewSection.currentCrewId,
        isFavorite: crews.some((crew) => crew.id === entry.crewId && crew.favorite),
      }));
    const newCrewLabel = t`New crew`;
    const newCrewRow =
      crewSection.canCreate && (!query || newCrewLabel.toLocaleLowerCase().includes(query))
        ? [
            {
              type: "new-crew" as const,
              id: "crew:new",
              label: newCrewLabel,
              meta: t`Lead + 1 helper`,
            },
          ]
        : [];
    return withCrewPickerItems(modelItems, crewRows, newCrewRow, sessionCrews ?? crews);
  }

  const items = isOpen ? buildItemsForSearch(deferredSearch) : [];

  // Highlight the current model wherever it appears (provider section, favorites, recents).
  // Inside a projected family the single family row highlights for any member.
  const selectedKeys = new Set<string>(
    crewSection?.current || crewSection?.currentCrewId
      ? crewSection.currentCrewId
        ? [
            `fav:crew:${crewSection.currentCrewId}`,
            `recent:crew:${crewSection.currentCrewId}`,
            `crew:${crewSection.currentCrewId}`,
          ]
        : []
      : [
          `fav:${currentAgentKind}:${effectiveCurrentModel}`,
          `recent:${currentAgentKind}:${effectiveCurrentModel}`,
          `model:${currentProviderKey}:${effectiveCurrentModel}`,
          ...(currentFamilyDisplay && currentProvider
            ? [`model:${currentProviderKey}:${currentFamilyDisplay.representativeModel}`]
            : []),
          // An exact favorite/recent row of the current model keeps its highlight
          // even though its item id differs from the projected family row's.
          `model-exact:${currentProviderKey}:${effectiveCurrentModel}`,
        ],
  );

  // Rows mirror the Fast preference saved per model. An explicit value wins;
  // otherwise `defaultFastEnabled` applies. A saved fast-sibling id counts as
  // Fast on for the standard row. This is not the current draft's toggle:
  // the icon answers "what will selecting this model do".
  function modelFastEnabled(providerKind: string, modelId: string): boolean {
    if (optionScope) return false;
    const models =
      providers.find((provider) => provider.kind === providerKind)?.capabilities.models ?? [];
    const picked = normalizeProviderModelConfig(providerKind, { model: modelId }, models);
    const saved = providerModelPreferences[providerKind]?.[picked.model];
    if (saved) return saved.fast ?? picked.fast ?? defaultFastEnabled(providerKind);
    if (picked.fast !== undefined) return picked.fast;
    const legacy = providerConfigs[providerKind];
    if (!legacy?.model) return defaultFastEnabled(providerKind);
    const normalized = normalizeProviderModelConfig(providerKind, legacy, models);
    if (normalized.model !== picked.model) return defaultFastEnabled(providerKind);
    return normalized.fast ?? defaultFastEnabled(providerKind);
  }

  function toggleModelFavorite(
    providerKind: string,
    modelId: string,
    rowPresentationMode?: ThreadPresentationMode,
  ) {
    const mode = rowPresentationMode ?? presentationMode ?? "terminal";
    const models =
      providers.find((provider) => provider.kind === providerKind)?.capabilities.models ?? [];
    const canonicalModel = canonicalProviderModelId(providerKind, modelId, models);
    const matches = favorites.filter(
      (ref) =>
        ref.agentKind === providerKind &&
        ref.presentationMode === mode &&
        canonicalProviderModelId(providerKind, ref.modelId, models) === canonicalModel,
    );
    if (matches.length > 0) {
      for (const ref of matches) toggleFavoriteModel(providerKind, ref.modelId, mode);
    } else {
      toggleFavoriteModel(providerKind, modelId, mode);
    }
  }

  function removeModelFromRecents(ref: ModelRef) {
    const models =
      providers.find(
        (provider) =>
          provider.kind === ref.agentKind &&
          (!provider.presentationMode || provider.presentationMode === ref.presentationMode),
      )?.capabilities.models ?? [];
    const canonicalModel = canonicalProviderModelId(ref.agentKind, ref.modelId, models);
    const matches = (entry: ModelRef) =>
      entry.agentKind === ref.agentKind &&
      (!presentationMode || entry.presentationMode === ref.presentationMode) &&
      canonicalProviderModelId(entry.agentKind, entry.modelId, models) === canonicalModel;
    const settings = useSharedSettings.getState();
    settings.removeRecentModels(settings.recentModels.filter(matches));
    setSessionRecents((current) => (current ?? recents).filter((entry) => !matches(entry)));
    if (!mobile) searchRef.current?.focus();
  }

  function selectModelItem(selected: ProviderModelItem | undefined) {
    if (selected?.type !== "model" || isDisabled) return;
    // A deliberate activation always reaches the owner, including a re-pick of
    // the already-current model: an exact same-UID pick must drop stored
    // selection-binding evidence, and a family-row re-pick may clean a stale
    // record. The owner's complete-config equality check suppresses genuinely
    // unchanged persistence, so this side never second-guesses the event.
    // Close synchronously so the popover starts unmounting immediately, then
    // mark the upstream state cascade as a transition so the parent's effort/
    // context/fast resolution doesn't block the close animation.
    handleOpenChange(false);
    startTransition(() => {
      onChange({
        agentKind: selected.providerKind,
        model: selected.modelId,
        ...(selected.presentationMode ? { presentationMode: selected.presentationMode } : {}),
        // Named ephemeral intent: the collapsed family row retains the
        // family's current member, every exact row (favorites and recents
        // included, an exact representative row included) selects its UID.
        selectionIntent: selected.familyModelIds ? "family" : "exact",
      });
    });
  }

  function handleSelect(itemId: string) {
    const selected = items.find((item) => item.id === itemId);
    if (selected?.type === "crew" && crewSection) {
      handleOpenChange(false);
      crewSection.onSelect({ crewId: selected.crewId });
      return;
    }
    if (selected?.type === "new-crew" && crewSection) {
      handleOpenChange(false);
      crewSection.onSelect({ newCrew: true });
      return;
    }
    selectModelItem(selected);
  }

  const trigger = (
    <Button
      aria-label={menuLabel}
      isDisabled={
        (isDisabled ?? false) ||
        (optionScope ? optionScope.options.length === 0 : providers.length === 0)
      }
      size="sm"
      variant={triggerAppearance === "field" ? "secondary" : "ghost"}
      className={
        triggerAppearance === "field"
          ? "w-full min-w-0 justify-between px-2"
          : triggerAppearance === "label"
            ? "h-4 min-w-0 max-w-full gap-0 rounded px-1 text-xs leading-4 hover:bg-foreground/5"
            : "poracode-composer-menu poracode-composer-model-control min-w-0 px-2.5"
      }
      {...(mobile ? { onPress: () => handleOpenChange(true) } : {})}
    >
      {triggerAppearance === "label" ? (
        <span className="truncate">{props.triggerLabel ?? (currentName || menuLabel)}</span>
      ) : (
        <>
          {crewSection?.current ? (
            <PoracodeGlyph className="size-3.5 shrink-0" />
          ) : optionScope ? (
            optionScope.icon
          ) : (
            <ProviderIcon
              kind={currentAgentKind}
              {...(currentProvider?.icon ? { icon: currentProvider.icon } : {})}
              fallbackLabel={currentProvider?.label}
              tone="active"
              className="size-3.5 shrink-0"
            />
          )}
          <span
            data-collapse-tier={collapseTier}
            className={
              hideLabelOnWrap
                ? `poracode-composer-label-hideable flex min-w-0 flex-col items-start justify-center gap-0.5${forceHideLabel ? " is-hidden" : ""}`
                : "flex min-w-0 flex-col items-start justify-center gap-0.5"
            }
          >
            <span className="max-w-full truncate leading-tight">{currentName || menuLabel}</span>
            {!crewSection?.current && currentSubLabel ? (
              <span className="max-w-full truncate text-[10px] font-medium leading-tight text-muted/70">
                {currentSubLabel}
              </span>
            ) : null}
          </span>
          <ChevronDown
            data-collapse-tier={collapseTier}
            className={
              hideLabelOnWrap
                ? `poracode-composer-label-hideable size-3.5 text-muted${forceHideLabel ? " is-hidden" : ""}`
                : "size-3.5 text-muted"
            }
          />
        </>
      )}
    </Button>
  );

  const renderContent = ({ expanded }: { readonly expanded: boolean }) => (
    <>
      <ModelMenuSearchInput
        inputRef={searchRef}
        listboxId={`${listboxDomIdPrefix}-listbox`}
        expanded={isOpen}
        activeDescendantId={
          activeModelItemId && items.length > 0
            ? `${listboxDomIdPrefix}-${activeModelItemId}`
            : undefined
        }
        value={search}
        onChange={setSearch}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            handleOpenChange(false);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (search !== deferredSearch) {
              const firstSelectable = buildItemsForSearch(search).find(
                (item) => item.type === "model" || item.type === "crew" || item.type === "new-crew",
              );
              if (firstSelectable?.type === "model") selectModelItem(firstSelectable);
              else if (firstSelectable) handleSelect(firstSelectable.id);
            } else if (items.length > 0) {
              windowedListRef.current?.selectActive();
            }
            return;
          }
          if (items.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            windowedListRef.current?.moveActive(e.key === "ArrowDown" ? 1 : -1);
          }
        }}
      />
      {items.length === 0 ? (
        <div className="px-3 py-3 text-center text-sm text-muted">
          <Trans>No models found</Trans>
        </div>
      ) : (
        <WindowedProviderModelList
          domIdPrefix={listboxDomIdPrefix}
          items={items}
          selectedKeys={selectedKeys}
          ref={windowedListRef}
          modelRowHeight={mobile ? MODEL_MENU_ROW_HEIGHT_MOBILE : MODEL_MENU_ROW_HEIGHT}
          mobile={mobile}
          mobileExpanded={mobile && expanded}
          {...(optionScope ? { ariaLabel: menuLabel } : {})}
          onActiveChange={setActiveModelItemId}
          modelFastEnabled={modelFastEnabled}
          toggleFavorite={toggleModelFavorite}
          onRemoveRecent={removeModelFromRecents}
          onReorderFavorites={(ordered) => {
            useSharedSettings.getState().reorderFavoriteModels(ordered);
            setSessionFavorites((current) => reorderModelPickerRefs(current ?? favorites, ordered));
          }}
          onToggleCrewFavorite={(crewId) => {
            const settings = useSharedSettings.getState();
            const crew = settings.crews.find((entry) => entry.id === crewId);
            if (crew) settings.setCrewFavorite(crewId, !crew.favorite);
          }}
          onRemoveRecentCrew={(crewId) => {
            useSharedSettings.getState().setCrewLastUsedAt(crewId, null);
            setSessionCrews((current) =>
              (current ?? crews).map((crew) => {
                if (crew.id !== crewId) return crew;
                const { lastUsedAt: _lastUsedAt, ...rest } = crew;
                return rest;
              }),
            );
            if (!mobile) searchRef.current?.focus();
          }}
          onSelect={handleSelect}
        />
      )}
    </>
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      label={menuLabel}
      {...(triggerAppearance === "field"
        ? { triggerClassName: "w-full min-w-0" }
        : triggerAppearance === "label"
          ? { triggerClassName: "inline-flex min-w-0 max-w-full" }
          : {})}
      trigger={
        !mobile && hideLabelOnWrap ? (
          <Tooltip>
            {trigger}
            <Tooltip.Content placement="top">
              {currentDisplayLabel || t`Select model`}
            </Tooltip.Content>
          </Tooltip>
        ) : (
          trigger
        )
      }
      placement="top start"
      contentClassName="w-96 p-0"
      dialogClassName="flex max-h-[28rem] flex-col overflow-hidden !p-0"
      sheetClassName="m-sheet--model-picker"
    >
      {renderContent}
    </ResponsiveMenuSurface>
  );
}
