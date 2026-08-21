import type { MessageDescriptor } from "@lingui/core";
import type { ThreadPresentationMode } from "@/shared/contracts";

export interface ProviderModelHeaderPlain {
  type: "header-plain";
  id: string;
  label: MessageDescriptor;
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
  /** Tail hint shown to the right of the model label. */
  subProviderLabel?: string;
  /** Context-window hint (e.g. "200K", "272K / 1M"). Rendered muted next to the label. */
  contextDescription?: string;
  /** Full provider-provided model description. Rendered in a delayed tooltip. */
  tooltipDescription?: string;
  /** When true, show the provider icon in the row right rail. */
  showProviderIcon?: boolean;
  /** When true, this model supports a usable fast mode (drives the fast-mode hint glyph). */
  supportsFast?: boolean;
  /** When true, the row's persisted favorite state is true (drives the star icon). */
  isFavorite: boolean;
  /** When true, omit the star button — used for read-only contexts (none today). */
  hideFavoriteToggle?: boolean;
}

export type ProviderModelItem =
  | ProviderModelHeaderPlain
  | ProviderModelHeaderProvider
  | ProviderModelHeaderSubProvider
  | ProviderModelRow;
