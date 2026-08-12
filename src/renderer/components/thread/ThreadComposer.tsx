import { ReactNode, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { ToggleButton, Tooltip } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";
import type { ButtonProps } from "@/renderer/components/common/Button";
import { EffortContextMenu } from "@/renderer/components/common/EffortContextMenu/EffortContextMenu";
import { OptionMenu } from "@/renderer/components/common/OptionMenu";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import {
  ProviderModelMenu,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common/ProviderModelMenu/ProviderModelMenu";
import { TextArea } from "@/renderer/components/common/TextArea";
import { EffortIcon } from "@/renderer/components/providers/EffortIcon";
import { PermissionIcon } from "@/renderer/components/providers/PermissionIcon";
import { isCompactClientSurface, readBridge } from "@/renderer/bridge";
import type { LabeledOption, ThreadPresentationMode } from "@/shared/contracts";

export type OptionMenuOption = string | { id: string; label: string; hint?: string };

/** Semantic icon kinds resolved automatically by the composer. */
export type ComposerIconKind = "effort" | "fast" | "mode" | "permission";

const COLLAPSE_LEVELS = [0, 1, 2, 3, 4, 5] as const;
const DEFAULT_LABEL_COLLAPSE_LEVEL = 1;
const COMPOSER_FILE_DRAG_TYPE = "application/poracode-composer-file";

export type ComposerControl =
  | {
      kind?: "menu";
      value: string;
      options: readonly OptionMenuOption[];
      onChange?: (value: string) => void;
      icon?: ReactNode;
      iconKind?: ComposerIconKind;
      iconOnly?: boolean;
      placeholder?: string;
      isDisabled?: boolean;
      hideLabelOnWrap?: boolean;
      tier?: number | undefined;
    }
  | {
      kind: "toggle";
      /**
       * Stable English identity used for control logic (shortcuts, tier
       * defaults, tests compare against `"Plan"` / `"Work"` / `"Fast"` /
       * `"Supervised"`). Never localize this — set `displayLabel` instead.
       */
      label: string;
      /** Localized label shown to the user; falls back to `label` when absent. */
      displayLabel?: MessageDescriptor;
      icon?: ReactNode;
      iconKind?: ComposerIconKind;
      isSelected: boolean;
      onChange?: (isSelected: boolean) => void;
      isDisabled?: boolean;
      /**
       * When set, the toggle is rendered dimmed and non-interactive with this
       * message as its tooltip (e.g. a Fast toggle the account can't use). Kept
       * hoverable rather than natively `disabled` so the tooltip still shows.
       */
      disabledReason?: string;
      iconOnly?: boolean;
      fillIconOnSelect?: boolean;
      isCurrentState?: boolean;
      hideLabelOnWrap?: boolean;
      tier?: number | undefined;
      className?: string;
    }
  | {
      kind: "static";
      value: string;
      icon?: ReactNode;
      iconOnly?: boolean;
      hideLabelOnWrap?: boolean;
      tier?: number | undefined;
    }
  | {
      kind: "provider-model";
      providers: ProviderModelMenuProvider[];
      currentAgentKind: string;
      currentModel: string;
      lockedAgentKind?: string;
      presentationMode?: ThreadPresentationMode;
      isDisabled?: boolean;
      isFastEnabled?: boolean;
      hideLabelOnWrap?: boolean;
      openSignal?: number;
      onChange: (next: {
        agentKind: string;
        model: string;
        presentationMode?: ThreadPresentationMode;
      }) => void;
      tier?: number | undefined;
    }
  | {
      kind: "effort-context";
      efforts: readonly LabeledOption[];
      effortValue?: string;
      onEffortChange?: (value: string) => void;
      contextSizes: readonly LabeledOption[];
      contextValue?: string;
      onContextChange?: (value: string) => void;
      thinkingSupported?: boolean;
      thinkingValue?: boolean;
      onThinkingChange?: (value: boolean) => void;
      icon?: ReactNode;
      isDisabled?: boolean;
      hideLabelOnWrap?: boolean;
      openSignal?: number;
      tier?: number | undefined;
    };

export function resolveComposerControlIcon(control: ComposerControl): ReactNode | undefined {
  if (control.kind === "static") return control.icon;
  if (control.kind === "provider-model" || control.kind === "effort-context") {
    return undefined;
  }
  if (control.icon) return control.icon;
  const iconKind = control.iconKind;
  if (!iconKind) return undefined;

  if (iconKind === "effort" && control.kind !== "toggle") {
    const ids = control.options.map((o) => (typeof o === "string" ? o : o.id));
    return <EffortIcon className="size-4 text-foreground" effort={control.value} efforts={ids} />;
  }

  if (iconKind === "permission") {
    // The `poracode-composer-permission-icon` marker is a provider-agnostic
    // hook (keyed off the generic `iconKind`, never a provider name) that the
    // mobile compact composer uses to surface the permission chip as an icon.
    if (control.kind === "toggle") {
      return (
        <PermissionIcon
          className="size-4 text-foreground poracode-composer-permission-icon"
          index={control.isSelected ? 1 : 0}
          count={2}
        />
      );
    }
    const ids = control.options.map((o) => (typeof o === "string" ? o : o.id));
    const idx = ids.indexOf(control.value);
    return (
      <PermissionIcon
        className="size-4 text-foreground poracode-composer-permission-icon"
        index={idx < 0 ? 0 : idx}
        count={ids.length}
      />
    );
  }

  return undefined;
}

function shouldHideControlLabel(
  control: ComposerControl,
  targetWrapLevel: number,
  forceShowLabels: boolean,
): boolean {
  if (forceShowLabels) return false;
  const collapseTier = getControlCollapseTier(control);
  if (collapseTier === undefined) return false;
  return targetWrapLevel >= collapseTier;
}

function getControlCollapseTier(control: ComposerControl): number | undefined {
  if (!control.hideLabelOnWrap && control.tier === undefined) return undefined;
  return control.tier ?? DEFAULT_LABEL_COLLAPSE_LEVEL;
}

function getOptionLabel(option: OptionMenuOption): string {
  return typeof option === "string" ? option : option.label;
}

function resolveControlProbeLabel(control: ComposerControl, thinkingLabel: string): string {
  if (control.kind === "provider-model") {
    const provider =
      control.providers.find((candidate) => candidate.kind === control.currentAgentKind) ??
      control.providers[0];
    return (
      provider?.capabilities.models.find((model) => model.id === control.currentModel)?.label ??
      control.currentModel
    );
  }

  if (control.kind === "effort-context") {
    const effortLabel =
      control.efforts.find((option) => option.id === control.effortValue)?.label ??
      control.effortValue ??
      "";
    const contextLabel =
      control.contextSizes.find((option) => option.id === control.contextValue)?.label ??
      control.contextValue ??
      "";
    return (
      [effortLabel, contextLabel].filter((part) => part.length > 0).join(" · ") || thinkingLabel
    );
  }

  if (control.kind === "toggle") return control.label;
  if (control.kind === "static") return control.value;
  const selectedOption = control.options.find(
    (option) => (typeof option === "string" ? option : option.id) === control.value,
  );
  return selectedOption ? getOptionLabel(selectedOption) : control.value;
}

function hasProbeIcon(control: ComposerControl): boolean {
  if (control.kind === "provider-model" || control.kind === "effort-context") return true;
  if (control.kind === "static") return Boolean(control.icon);
  return Boolean(control.icon || control.iconKind);
}

export function ThreadComposer(props: {
  autoFocus?: boolean;
  compact?: boolean;
  variant?: "draft" | "active";
  prompt: string;
  placeholder: string;
  fixedContent?: ReactNode;
  inputContent?: ReactNode;
  attachmentBar?: ReactNode;
  promptDisabled?: boolean;
  hideSubmitButton?: boolean;
  submitLabel: string;
  submitContent?: ReactNode;
  submitVariant?: ButtonProps["variant"];
  submitDisabled: boolean;
  submitPending?: boolean;
  stopPending?: boolean;
  preserveDisabledControlStyle?: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onAttachFiles?: (paths: string[]) => void;
  onStop?: (() => void) | undefined;
  controls: ComposerControl[];
  leadingControls?: ReactNode | ((wrapLevel: number) => ReactNode);
  afterControls?: ReactNode | ((wrapLevel: number) => ReactNode);
  toolbarLayoutKey?: string;
  /** Render only the composer toolbar (no prompt shell). Used by utility settings surfaces. */
  toolbarOnly?: boolean;
}) {
  const {
    autoFocus = false,
    compact = false,
    variant = "active",
    prompt,
    placeholder,
    fixedContent,
    inputContent,
    attachmentBar,
    promptDisabled = false,
    hideSubmitButton = false,
    submitLabel,
    submitContent,
    submitVariant,
    submitDisabled,
    submitPending = false,
    stopPending = false,
    preserveDisabledControlStyle = false,
    onPromptChange,
    onSubmit,
    onAttachFiles,
    onStop,
    controls,
    leadingControls,
    afterControls,
    toolbarLayoutKey,
    toolbarOnly = false,
  } = props;
  const { t } = useLingui();

  const [isAttachmentDropActive, setIsAttachmentDropActive] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const probeContainerRef = useRef<HTMLDivElement>(null);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const attachmentDragDepthRef = useRef(0);
  const probeContentCacheRef = useRef<{ key: string; content: ReactNode } | undefined>(undefined);
  const derivedToolbarLayoutKey = controls
    .map((control) => {
      if (control.kind === "provider-model") {
        const providersKey = control.providers
          .map(
            (provider) =>
              `${provider.modelPickerKey ?? provider.kind}:${provider.capabilities.models.map((model) => `${model.id}:${model.label}`).join(",")}`,
          )
          .join(";");
        return `provider-model:${control.currentAgentKind}:${control.currentModel}:${control.presentationMode ?? ""}:${control.hideLabelOnWrap ? "hide" : "show"}:${providersKey}`;
      }
      if (control.kind === "effort-context") {
        return `effort-context:${control.effortValue ?? ""}:${control.contextValue ?? ""}:${control.thinkingValue ?? ""}:${control.hideLabelOnWrap ? "hide" : "show"}`;
      }
      if (control.kind === "toggle") {
        return `toggle:${control.label}:${control.iconOnly ? "icon" : "label"}:${control.hideLabelOnWrap ? "hide" : "show"}`;
      }
      if (control.kind === "static") {
        return `static:${control.value}:${control.iconOnly ? "icon" : "label"}`;
      }
      return `menu:${control.value}:${control.iconOnly ? "icon" : "label"}:${control.hideLabelOnWrap ? "hide" : "show"}`;
    })
    .join("|");
  const effectiveToolbarLayoutKey = `${derivedToolbarLayoutKey}::leading=${
    leadingControls ? "1" : "0"
  }::after=${afterControls ? "1" : "0"}::submit=${hideSubmitButton ? "0" : "1"}${
    toolbarLayoutKey ? `::extra=${toolbarLayoutKey}` : ""
  }`;

  const returnFocusToInput = () => {
    // In compact layout refocusing the composer after closing a menu/drawer would
    // pop the on-screen keyboard back up over the chat — a jarring side effect
    // of tapping a toolbar control. Leave focus where the user left it there.
    if (isCompactClientSurface()) return;
    const el = editorHostRef.current?.querySelector<HTMLElement>(
      'textarea, [contenteditable="true"], input:not([type="hidden"])',
    );
    // rAF lets MenuTrigger's own focus-return run first, then we override it.
    if (el) requestAnimationFrame(() => el.focus());
  };

  // Use a ref to track the current wrapping level to avoid unnecessary state updates
  const wrapLevelRef = useRef(0);
  const lastCollapseWidthRef = useRef<number | undefined>(undefined);
  const lastToolbarWidthRef = useRef<number | undefined>(undefined);
  const isToolbarWidthDecreasingRef = useRef(false);

  const applyWrapLevel = (level: number) => {
    wrapLevelRef.current = level;
    toolbarRef.current?.setAttribute("data-wrap-level", String(level));
    controlsRef.current?.classList.toggle("is-wrapping", level > 0);
  };

  // Stable check function to find the best wrapLevel (0-5)
  // Each wrap level corresponds to a tier of controls collapsing.
  const checkWrap = () => {
    if (!probeContainerRef.current) return;
    const probes = probeContainerRef.current.children;
    if (probes.length === 0) return;

    const currentLevel = wrapLevelRef.current;
    let availableWidth = 0;

    // Find the first wrap level that fits on one row.
    // We check from level 0 (all expanded) up to 5 (all collapsed).
    let bestLevel = 5;
    for (let level = 0; level <= 5; level++) {
      const probeToolbar = probes[level] as HTMLElement;
      const wrappingContainer = probeToolbar?.querySelector(".probe-wrap-container") as HTMLElement;
      if (!wrappingContainer) continue;

      availableWidth ||= wrappingContainer.clientWidth;
      if (wrappingContainer.scrollWidth <= wrappingContainer.clientWidth) {
        bestLevel = level;
        break;
      }
    }

    const toolbarWidth = toolbarRef.current?.clientWidth || availableWidth;
    const previousToolbarWidth = lastToolbarWidthRef.current;
    if (toolbarWidth > 0) {
      if (previousToolbarWidth !== undefined) {
        if (toolbarWidth < previousToolbarWidth) {
          isToolbarWidthDecreasingRef.current = true;
        } else if (toolbarWidth > previousToolbarWidth) {
          isToolbarWidthDecreasingRef.current = false;
        }
      }
      lastToolbarWidthRef.current = toolbarWidth;
    }
    toolbarRef.current?.toggleAttribute(
      "data-width-decreasing",
      isToolbarWidthDecreasingRef.current,
    );

    if (bestLevel !== currentLevel) {
      const isExpanding = bestLevel < currentLevel;
      if (
        isExpanding &&
        (isToolbarWidthDecreasingRef.current ||
          (lastCollapseWidthRef.current !== undefined &&
            toolbarWidth <= lastCollapseWidthRef.current))
      ) {
        return;
      }
      lastCollapseWidthRef.current = bestLevel > currentLevel ? toolbarWidth : undefined;
      applyWrapLevel(bestLevel);
    }
  };

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      checkWrap();
    });
    if (controlsRef.current) observer.observe(controlsRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- observer lifetime is fixed; resize callback reads current DOM
  }, []);

  // useLayoutEffect ensures this happens before paint to avoid flicker.
  useLayoutEffect(() => {
    checkWrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wrap measurement is keyed by layout-affecting values only
  }, [effectiveToolbarLayoutKey]);

  const editorClassName = compact
    ? "poracode-composer-editor poracode-composer-editor--compact"
    : "poracode-composer-editor";
  const customInputClassName = compact
    ? "poracode-composer-custom-input poracode-composer-custom-input--compact"
    : "poracode-composer-custom-input";
  const toolbarClassName = compact
    ? "poracode-composer-toolbar poracode-composer-toolbar--compact relative flex items-end justify-between gap-3"
    : "poracode-composer-toolbar relative flex items-end justify-between gap-3";
  const shellClassName = [
    "poracode-composer-shell",
    variant === "draft" && "poracode-composer-shell--draft",
    variant !== "draft" &&
      preserveDisabledControlStyle &&
      "poracode-composer-shell--preserve-disabled-controls",
    "overflow-hidden",
  ]
    .filter(Boolean)
    .join(" ");

  const renderControlItem = (
    control: ComposerControl,
    index: number,
    targetWrapLevel: number,
    forceShowLabels: boolean,
  ) => {
    const collapseTier = getControlCollapseTier(control);
    const hideOnWrap = collapseTier !== undefined;
    const shouldHideLabel = shouldHideControlLabel(control, targetWrapLevel, forceShowLabels);
    if (control.kind === "provider-model") {
      return (
        <ProviderModelMenu
          key={`provider-model-${index}`}
          providers={control.providers}
          currentAgentKind={control.currentAgentKind}
          currentModel={control.currentModel}
          {...(control.lockedAgentKind ? { lockedAgentKind: control.lockedAgentKind } : {})}
          {...(control.presentationMode ? { presentationMode: control.presentationMode } : {})}
          {...(control.isDisabled !== undefined ? { isDisabled: control.isDisabled } : {})}
          {...(control.isFastEnabled !== undefined ? { isFastEnabled: control.isFastEnabled } : {})}
          {...(control.openSignal !== undefined ? { openSignal: control.openSignal } : {})}
          {...(hideOnWrap || shouldHideLabel
            ? {
                hideLabelOnWrap: true,
                forceHideLabel: shouldHideLabel,
                ...(collapseTier !== undefined ? { collapseTier } : {}),
              }
            : {})}
          onChange={control.onChange}
          onOpenChange={(open) => {
            if (!open) returnFocusToInput();
          }}
        />
      );
    }

    if (control.kind === "effort-context") {
      return (
        <EffortContextMenu
          key={`effort-context-${index}`}
          efforts={control.efforts}
          {...(control.effortValue !== undefined ? { effortValue: control.effortValue } : {})}
          {...(control.onEffortChange ? { onEffortChange: control.onEffortChange } : {})}
          contextSizes={control.contextSizes}
          {...(control.contextValue !== undefined ? { contextValue: control.contextValue } : {})}
          {...(control.onContextChange ? { onContextChange: control.onContextChange } : {})}
          {...(control.thinkingSupported !== undefined
            ? { thinkingSupported: control.thinkingSupported }
            : {})}
          {...(control.thinkingValue !== undefined ? { thinkingValue: control.thinkingValue } : {})}
          {...(control.onThinkingChange ? { onThinkingChange: control.onThinkingChange } : {})}
          {...(control.icon ? { icon: control.icon } : {})}
          {...(control.isDisabled !== undefined ? { isDisabled: control.isDisabled } : {})}
          {...(control.openSignal !== undefined ? { openSignal: control.openSignal } : {})}
          {...(hideOnWrap || shouldHideLabel
            ? {
                hideLabelOnWrap: true,
                forceHideLabel: shouldHideLabel,
                ...(collapseTier !== undefined ? { collapseTier } : {}),
              }
            : {})}
          onOpenChange={(open) => {
            if (!open) returnFocusToInput();
          }}
        />
      );
    }

    if (control.kind === "static") {
      const hideLabel = control.iconOnly || shouldHideLabel;
      const labelClassName = hideOnWrap
        ? `poracode-composer-label-hideable truncate${hideLabel ? " is-hidden" : ""}`
        : "truncate";
      const content = (
        <div key={`${control.value}-${index}`} className="poracode-composer-static min-w-0 px-2.5">
          {control.icon}
          {!control.iconOnly && (
            <span data-collapse-tier={collapseTier} className={labelClassName}>
              {control.value}
            </span>
          )}
        </div>
      );

      if (control.iconOnly || hideOnWrap || (hideLabel && targetWrapLevel > 0)) {
        return (
          <Tooltip key={`static-tooltip-${index}`}>
            {content}
            <Tooltip.Content placement="top">{control.value}</Tooltip.Content>
          </Tooltip>
        );
      }

      return content;
    }

    if (control.kind === "toggle") {
      const hideLabel = control.iconOnly || shouldHideLabel;
      const labelClassName = hideOnWrap
        ? `poracode-composer-label-hideable${hideLabel ? " is-hidden" : ""}`
        : undefined;
      // `label` is the stable English logic key; `displayLabel` (when present)
      // is the localized text actually shown to the user.
      const toggleLabel = control.displayLabel ? t(control.displayLabel) : control.label;
      // A `disabledReason` toggle stays hoverable (not natively `disabled`) so
      // its explanatory tooltip still fires; it's dimmed and click is a no-op.
      const gated = Boolean(control.disabledReason);
      const toggle = (
        <ToggleButton
          key={`toggle-${index}`}
          aria-label={toggleLabel}
          aria-disabled={gated}
          className={`poracode-composer-toggle ${
            control.fillIconOnSelect ? "poracode-composer-toggle--fill-icon-selected " : ""
          }${control.isCurrentState ? "poracode-composer-toggle--current " : ""}${
            control.iconOnly ? "min-w-9 px-2" : "min-w-0 px-2.5"
          }${gated ? " opacity-50 cursor-not-allowed" : ""}${
            control.className ? ` ${control.className}` : ""
          }`}
          isDisabled={gated ? false : (control.isDisabled ?? false)}
          isSelected={gated ? false : control.isSelected}
          size="sm"
          variant="ghost"
          onChange={gated ? () => undefined : (control.onChange ?? (() => undefined))}
        >
          {resolveComposerControlIcon(control)}
          {!control.iconOnly && (
            <span data-collapse-tier={collapseTier} className={labelClassName}>
              {toggleLabel}
            </span>
          )}
        </ToggleButton>
      );

      const tooltipText = gated
        ? control.disabledReason
        : hideOnWrap || hideLabel
          ? toggleLabel
          : undefined;
      if (tooltipText) {
        // Place the ToggleButton directly inside <Tooltip> (no <Tooltip.Trigger>
        // wrapper) so the tooltip attaches to the button itself. Wrapping a
        // focusable control in <Tooltip.Trigger> would add a redundant
        // `role="button"` host element, duplicating the toggle in the
        // accessibility tree. Mirrors the OptionMenu tooltip pattern.
        return (
          <Tooltip key={`toggle-tooltip-${index}`} delay={0}>
            {toggle}
            <Tooltip.Content placement="top">{tooltipText}</Tooltip.Content>
          </Tooltip>
        );
      }

      return toggle;
    }

    const resolvedIcon = resolveComposerControlIcon(control);
    const optionalProps = {
      ...(resolvedIcon ? { icon: resolvedIcon } : {}),
      ...(control.iconOnly ? { iconOnly: control.iconOnly } : {}),
      ...(control.placeholder ? { placeholder: control.placeholder } : {}),
      ...(control.isDisabled !== undefined ? { isDisabled: control.isDisabled } : {}),
      ...(hideOnWrap || shouldHideLabel
        ? {
            hideLabelOnWrap: true,
            forceHideLabel: shouldHideLabel,
            ...(collapseTier !== undefined ? { collapseTier } : {}),
            tooltip: control.value,
          }
        : {}),
    };

    return (
      <OptionMenu
        key={`${control.value}-${index}`}
        buttonVariant="ghost"
        className="poracode-composer-menu min-w-0 px-2.5"
        options={control.options}
        value={control.value}
        onChange={control.onChange ?? (() => undefined)}
        onOpenChange={(open) => {
          if (!open) returnFocusToInput();
        }}
        {...optionalProps}
      />
    );
  };

  const renderControlsList = (targetWrapLevel: number, forceShowLabels = false) =>
    controls.map((control, index) =>
      renderControlItem(control, index, targetWrapLevel, forceShowLabels),
    );

  const renderProbeControlItem = (
    control: ComposerControl,
    index: number,
    targetWrapLevel: number,
    forceShowLabels: boolean,
  ) => {
    const hideLabel = shouldHideControlLabel(control, targetWrapLevel, forceShowLabels);
    const iconOnly =
      control.kind !== "provider-model" &&
      control.kind !== "effort-context" &&
      control.iconOnly === true;
    const isStatic = control.kind === "static";
    const isToggle = control.kind === "toggle";
    const probeClassName = isStatic
      ? "poracode-composer-static min-w-0 px-2.5"
      : isToggle
        ? `poracode-composer-toggle inline-flex min-w-0 items-center gap-[0.35rem] px-2.5 ${
            control.iconOnly ? "min-w-9 px-2" : ""
          }`
        : "poracode-composer-menu inline-flex min-w-0 items-center gap-[0.35rem] px-2.5";
    const label = resolveControlProbeLabel(control, t`Thinking`);

    return (
      <div key={`probe-control-${index}`} className={probeClassName}>
        {hasProbeIcon(control) ? <span className="size-4 shrink-0" /> : null}
        {!iconOnly && !hideLabel ? (
          <span className="truncate whitespace-nowrap">{label}</span>
        ) : null}
        {!isStatic && !isToggle && !iconOnly && !hideLabel ? (
          <span className="size-3.5 shrink-0" />
        ) : null}
      </div>
    );
  };

  const renderProbeControlsList = (targetWrapLevel: number, forceShowLabels = false) =>
    controls.map((control, index) =>
      renderProbeControlItem(control, index, targetWrapLevel, forceShowLabels),
    );

  const probeContentCacheKey = `${effectiveToolbarLayoutKey}|compact=${compact}`;
  if (!probeContentCacheRef.current || probeContentCacheRef.current.key !== probeContentCacheKey) {
    // The hidden probe tree uses cheap geometry stubs for controls instead of
    // mounting full menu/popover trigger trees for every collapse level.
    probeContentCacheRef.current = {
      key: probeContentCacheKey,
      content: (
        <div
          ref={probeContainerRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0"
          style={{ visibility: "hidden", zIndex: -1 }}
        >
          {COLLAPSE_LEVELS.map((level) => (
            <div
              key={`probe-${level}`}
              data-wrap-level={level}
              className={toolbarClassName.replace("relative", "")}
              style={{ position: "absolute", inset: 0 }}
            >
              {leadingControls && (
                <div className="flex shrink-0 items-end gap-1">
                  {typeof leadingControls === "function" ? leadingControls(level) : leadingControls}
                </div>
              )}
              <div
                className="probe-wrap-container flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden [&>*]:shrink-0"
                style={{ height: "2.25rem" }}
              >
                {renderProbeControlsList(level)}
              </div>
              <div className="flex shrink-0 items-end gap-1">
                {typeof afterControls === "function" ? afterControls(level) : afterControls}
                {!hideSubmitButton && <div className="size-8 shrink-0" />}
              </div>
            </div>
          ))}
        </div>
      ),
    };
  }
  const probeContent = probeContentCacheRef.current.content;

  const renderControls = () => (
    <div className="relative min-w-0 flex-1">
      {/* Real controls: wrap collapse is applied through DOM attributes/classes.
         Fixed height + overflow-hidden prevents a visible two-row blink
         while labels collapse — wrapped items are clipped, not shown. */}
      <div
        ref={controlsRef}
        className={`flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden [&>*]:shrink-0 ${
          wrapLevelRef.current > 0 ? "is-wrapping" : ""
        }`}
        style={{ height: "2.25rem" }}
      >
        {renderControlsList(0)}
      </div>
    </div>
  );

  const renderEditor = () =>
    inputContent ? (
      <div className={customInputClassName}>{inputContent}</div>
    ) : (
      <TextArea
        autoFocus={autoFocus} // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
        fullWidth
        className={editorClassName}
        disabled={promptDisabled}
        placeholder={placeholder}
        rows={1}
        value={prompt}
        variant="secondary"
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
    );

  const renderSendButton = () => {
    if (hideSubmitButton) return null;

    // When the agent is running and input is empty, show stop button
    if (onStop && submitDisabled) {
      return (
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              aria-label={t`Stop response`}
              className="poracode-composer-send"
              isDisabled={stopPending}
              isPending={stopPending}
              onPress={onStop}
              size="sm"
            >
              {({ isPending }) =>
                isPending ? <PixelLoader size="xs" /> : <Square className="size-3.5 fill-current" />
              }
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <Trans>Stop response</Trans>
          </Tooltip.Content>
        </Tooltip>
      );
    }
    return (
      <Button
        isIconOnly={!submitContent}
        aria-label={submitLabel}
        className={submitContent ? "h-9 px-3" : "poracode-composer-send"}
        isDisabled={submitDisabled || promptDisabled}
        isPending={submitPending}
        onPress={onSubmit}
        size="sm"
        {...(submitVariant ? { variant: submitVariant } : {})}
      >
        {({ isPending }) =>
          isPending ? <PixelLoader size="xs" /> : (submitContent ?? <ArrowUp className="size-4" />)
        }
      </Button>
    );
  };

  const hasAttachmentDragData = (dataTransfer: DataTransfer) =>
    Array.from(dataTransfer.types).some(
      (type) => type === "Files" || type === COMPOSER_FILE_DRAG_TYPE,
    );

  const resolveAttachmentDropPaths = (dataTransfer: DataTransfer): string[] => {
    const payload = dataTransfer.getData(COMPOSER_FILE_DRAG_TYPE);
    if (payload) {
      try {
        const parsed = JSON.parse(payload) as { path?: unknown; type?: unknown };
        return typeof parsed.path === "string" && parsed.type === "file" ? [parsed.path] : [];
      } catch {
        return [];
      }
    }
    return readBridge().getDroppedFilePaths(Array.from(dataTransfer.files));
  };

  const handleAttachmentDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!onAttachFiles || !hasAttachmentDragData(event.dataTransfer)) return;
    event.preventDefault();
    attachmentDragDepthRef.current += 1;
    event.dataTransfer.dropEffect = "copy";
    setIsAttachmentDropActive(true);
  };

  const handleAttachmentDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!onAttachFiles || !hasAttachmentDragData(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleAttachmentDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!onAttachFiles || !hasAttachmentDragData(event.dataTransfer)) return;
    attachmentDragDepthRef.current = Math.max(0, attachmentDragDepthRef.current - 1);
    if (attachmentDragDepthRef.current === 0) {
      setIsAttachmentDropActive(false);
    }
  };

  const handleAttachmentDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!onAttachFiles || !hasAttachmentDragData(event.dataTransfer)) return;
    event.preventDefault();
    attachmentDragDepthRef.current = 0;
    setIsAttachmentDropActive(false);
    const paths = resolveAttachmentDropPaths(event.dataTransfer);
    if (paths.length > 0) {
      onAttachFiles(paths);
    }
  };

  const toolbar = (
    <div ref={toolbarRef} className={toolbarClassName} data-wrap-level={wrapLevelRef.current}>
      {leadingControls && (
        <div className="flex shrink-0 items-end gap-1">
          {typeof leadingControls === "function" ? leadingControls(0) : leadingControls}
        </div>
      )}
      {renderControls()}
      <div className="flex shrink-0 items-end gap-1">
        {typeof afterControls === "function" ? afterControls(0) : afterControls}
        {renderSendButton()}
      </div>
      {/* Probes: invisible, each represents a collapse level for the entire toolbar layout. */}
      {probeContent}
    </div>
  );

  if (toolbarOnly) {
    return toolbar;
  }

  return (
    <div data-poracode-composer="">
      <div
        className={shellClassName}
        onDragEnter={handleAttachmentDragEnter}
        onDragOver={handleAttachmentDragOver}
        onDragLeave={handleAttachmentDragLeave}
        onDrop={handleAttachmentDrop}
      >
        {/* Inert unless a shell-level rule lights it: desktop draft focus, or
            the phone layout's expanded live composer. */}
        <div className="poracode-composer-border-glow" />
        {isAttachmentDropActive ? (
          <div className="poracode-composer-drop-overlay">
            <Trans>Drop here to attach</Trans>
          </div>
        ) : null}
        {fixedContent}
        {attachmentBar}
        <div ref={editorHostRef} data-composer-input-anchor="">
          {renderEditor()}
        </div>
        {toolbar}
      </div>
    </div>
  );
}
