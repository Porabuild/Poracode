import type { MessageDescriptor } from "@lingui/core";
import type { ThreadPresentationMode } from "@/shared/contracts";
import type { ModelPickerRef } from "@/shared/modelPickerOrder";

/**
 * Ephemeral UI origin of one picker selection event, resolved by the row the
 * user clicked: a projected family row (the collapsed relation entry) emits
 * `"family"` and preserves the family's current member; every other model row
 * — plain models, favorites, and recents, an exact representative row included
 * — emits `"exact"` and selects that exact UID. Carried on the event only;
 * never persisted or serialized.
 */
export type ProviderModelSelectionIntent = "family" | "exact";

/** The payload of a provider-model picker selection event. */
export interface ProviderModelSelection {
  agentKind: string;
  model: string;
  presentationMode?: ThreadPresentationMode;
  selectionIntent?: ProviderModelSelectionIntent;
}

export interface ProviderModelHeaderPlain {
  type: "header-plain";
  id: string;
  label: MessageDescriptor;
}

export interface ProviderModelHeaderCrews {
  type: "header-crews";
  id: string;
}

export interface ProviderModelCrewRow {
  type: "crew";
  id: string;
  crewId: string;
  name: string;
  leadLabel: string;
  leadKind: string;
  helperKinds: readonly string[];
  details: string;
  isCurrent: boolean;
  isFavorite: boolean;
  isRecent?: boolean;
  lastUsedAt?: number;
}

export interface ProviderModelNewCrewRow {
  type: "new-crew";
  id: string;
  label: string;
  meta: string;
}

export interface ProviderModelHeaderProvider {
  type: "header-provider";
  id: string;
  providerKind: string;
  providerKey: string;
  hiddenModelsKey: string;
  providerIcon?: string;
  label: string;
}

export interface ProviderModelHeaderSubProvider {
  type: "header-sub";
  id: string;
  providerKind: string;
  providerKey: string;
  hiddenModelsKey: string;
  subId: string;
  label: string;
}

export interface ProviderModelRow {
  type: "model";
  id: string;
  providerKind: string;
  providerKey: string;
  hiddenModelsKey: string;
  providerIcon?: string;
  providerLabel: string;
  presentationMode?: ThreadPresentationMode;
  modelId: string;
  label: string;
  /** Exact-choice detail, including effort when the option itself encodes it. */
  optionHint?: string;
  /** Tail hint shown to the right of the model label. */
  subProviderLabel?: string;
  /** Fixed context-window hint (e.g. "200K") when the model has no Context picker. */
  contextDescription?: string;
  /**
   * Muted right-hand price text: the row's exact provider price hint, or for
   * a projected family row the honest range across its complete member
   * inventory (absent when any member's price is unknown). Parsed by the
   * provider leaf formatter via the description seam — never in shared code.
   */
  priceLine?: string;
  /** Full provider-provided model description. Rendered in a delayed tooltip. */
  tooltipDescription?: string;
  /** When true, show the provider icon before the model label. */
  showProviderIcon?: boolean;
  /** Original persisted identity of a reorderable favorite (before alias resolution). */
  favoriteRef?: ModelPickerRef;
  /** Original persisted identity of a removable Recent shortcut. */
  recentRef?: ModelPickerRef;
  /** When true, this model supports a usable fast mode (drives the fast-mode hint glyph). */
  supportsFast?: boolean;
  /**
   * Every exact member UID this row stands for (a projected family row). The
   * row's `modelId` is the representative; visibility toggles persist the whole
   * list so exact member ids stay canonical.
   */
  familyModelIds?: readonly string[];
  /** When true, the row's persisted favorite state is true (drives the star icon). */
  isFavorite: boolean;
  /** When true, omit the star button — used for read-only contexts (none today). */
  hideFavoriteToggle?: boolean;
}

export type ProviderModelItem =
  | ProviderModelHeaderPlain
  | ProviderModelHeaderCrews
  | ProviderModelHeaderProvider
  | ProviderModelHeaderSubProvider
  | ProviderModelCrewRow
  | ProviderModelNewCrewRow
  | ProviderModelRow;
