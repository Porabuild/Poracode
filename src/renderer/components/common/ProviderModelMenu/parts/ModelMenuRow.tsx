import type { PointerEventHandler, ReactNode, Ref } from "react";
import { Tooltip, Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { GripVertical, Star, X, Zap } from "lucide-react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  formatProviderModelDescription,
  modelPriceExplanation,
} from "@/renderer/components/providers/modelDescription";
import { joinModelRowHints } from "@/shared/modelLabels";
import type { ProviderModelRow } from "./types";
import { splitModelLabel } from "./splitModelLabel";

interface ModelMenuRowProps {
  item: ProviderModelRow;
  domId: string;
  rowHeight: number;
  isSelected: boolean;
  isActive: boolean;
  modelFastEnabled: (providerKind: string, modelId: string) => boolean;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onSelect: () => void;
  toggleFavorite: () => void;
  removeRecent?: () => void;
  rowRef?: Ref<HTMLDivElement>;
  dragHandle?: ReactNode;
  isDragging?: boolean;
}

export function SortableFavoriteModelRow(
  props: ModelMenuRowProps & { index: number; group: string },
) {
  const { t } = useLingui();
  const canReorder = props.index >= 0;
  const { ref, handleRef, isDragging } = useSortable({
    id: props.item.id,
    index: canReorder ? props.index : 0,
    disabled: !canReorder,
    type: "favorite-model",
    accept: "favorite-model",
    ...(canReorder ? { group: props.group } : {}),
  });
  return (
    <ModelMenuRow
      {...props}
      rowRef={ref}
      isDragging={isDragging}
      // Keep the disabled handle mounted: otherwise DnD annotates the row
      // itself as disabled, even though its model remains selectable.
      dragHandle={
        <Button
          ref={(element) => {
            // React Aria filters this uncommon DOM attribute. Set it before
            // the DnD accessibility plugin can supply its English default.
            element?.setAttribute("aria-roledescription", t`Draggable model`);
            handleRef(element);
          }}
          isIconOnly
          isDisabled={!canReorder}
          hidden={!canReorder}
          variant="ghost"
          aria-label={t`Reorder ${splitModelLabel(props.item.label).name}`}
          className={`${canReorder ? "" : "hidden "}size-4 min-h-0 min-w-0 shrink-0 touch-none cursor-grab rounded p-0 text-muted/60 hover:text-foreground active:cursor-grabbing`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Tab" || (event.key === "Escape" && !event.defaultPrevented)) {
              event.continuePropagation();
            }
          }}
        >
          <GripVertical className="size-3" />
        </Button>
      }
    />
  );
}

export function ModelMenuRow(props: ModelMenuRowProps) {
  const {
    item,
    domId,
    rowHeight,
    isSelected,
    isActive,
    modelFastEnabled,
    onPointerMove,
    onSelect,
    toggleFavorite,
    removeRecent,
    rowRef,
    dragHandle,
    isDragging,
  } = props;
  const { t, i18n } = useLingui();

  // Context size can stay as a muted chip. Effort and Fast are
  // first-class controls, including leftover variant labels. The
  // provider-parsed price shares the existing muted right rail.
  const { name, hint } = splitModelLabel(item.label);
  const description = formatProviderModelDescription(item.providerKind, item.tooltipDescription);
  const mutedHint = joinModelRowHints(hint, item.contextDescription);
  const rowFastEnabled = modelFastEnabled(item.providerKind, item.modelId);
  const nameLine = (
    <>
      <span className="min-w-0 truncate">{name}</span>
      {item.supportsFast ? (
        // Filled when Fast mode is saved on for this model,
        // outlined when it merely supports it or Fast was saved off.
        <Zap
          role="img"
          aria-label={rowFastEnabled ? t`Fast mode` : t`Supports Fast mode`}
          className={
            rowFastEnabled
              ? "size-3 shrink-0 fill-current text-muted"
              : "size-3 shrink-0 text-muted/60"
          }
        />
      ) : null}
      {mutedHint ? (
        <span className="shrink-0 text-[10px] leading-none text-muted/60">· {mutedHint}</span>
      ) : null}
    </>
  );
  const content = (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {nameLine}
      {item.priceLine ? (
        <span className="ml-auto min-w-0 max-w-[55%] truncate text-[10px] text-muted/70">
          {item.priceLine}
        </span>
      ) : null}
    </span>
  );

  return (
    <div
      ref={rowRef}
      id={domId}
      role="option"
      aria-selected={isSelected}
      data-active={isActive ? "true" : undefined}
      className={`poracode-menu-item group mx-1.5 flex cursor-default items-center text-foreground ${isDragging ? "opacity-40" : ""}`}
      style={{ height: rowHeight }}
      onPointerMove={onPointerMove}
      onMouseDown={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest("button"))
          event.preventDefault();
      }}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      tabIndex={-1}
    >
      {item.showProviderIcon ? (
        <ProviderIcon
          kind={item.providerKind}
          {...(item.providerIcon ? { icon: item.providerIcon } : {})}
          fallbackLabel={item.providerLabel}
          tone="inactive"
          className="size-3 shrink-0"
        />
      ) : null}
      {item.tooltipDescription || item.priceLine ? (
        <Tooltip delay={1000}>
          <Tooltip.Trigger className="min-w-0 flex-1" role="none" tabIndex={-1}>
            {content}
          </Tooltip.Trigger>
          <Tooltip.Content
            placement="right"
            className="max-w-72 whitespace-pre-line break-words text-xs"
          >
            {description || item.priceLine
              ? `${i18n._(description?.explanation ?? modelPriceExplanation)}\n\n`
              : null}
            {item.familyModelIds?.length && item.priceLine
              ? item.priceLine
              : (item.tooltipDescription ?? item.priceLine)}
          </Tooltip.Content>
        </Tooltip>
      ) : (
        content
      )}
      {item.subProviderLabel ? (
        <span className="ml-auto min-w-0 max-w-[45%] truncate text-[10px] text-muted/70">
          {item.subProviderLabel}
        </span>
      ) : null}
      {item.hideFavoriteToggle ? null : (
        <button
          type="button"
          aria-label={item.isFavorite ? t`Remove from favorites` : t`Add to favorites`}
          className={`ml-1 flex size-5 shrink-0 items-center justify-center rounded transition ${
            item.isFavorite
              ? "text-foreground"
              : "text-muted/40 opacity-0 group-hover:opacity-100 hover:text-foreground"
          }`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite();
          }}
        >
          <Star className="size-3.5" fill={item.isFavorite ? "currentColor" : "none"} />
        </button>
      )}
      {removeRecent ? (
        <Button
          isIconOnly
          variant="ghost"
          aria-label={t`Remove from recent`}
          className="size-4 min-h-0 min-w-0 shrink-0 rounded p-0 text-muted/60 opacity-100 transition-opacity hover:text-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
          onPress={removeRecent}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Tab" || event.key === "Escape") event.continuePropagation();
          }}
        >
          <X className="size-3" />
        </Button>
      ) : null}
      {dragHandle}
    </div>
  );
}
