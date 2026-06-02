import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { ToggleButton, Tooltip } from "@heroui/react";
import {
  Button,
  EffortContextMenu,
  OptionMenu,
  PixelLoader,
  ProviderModelMenu,
  TextArea,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common";
import { EffortIcon } from "@/renderer/components/providers/EffortIcon";
import { PermissionIcon } from "@/renderer/components/providers/PermissionIcon";
import type { LabeledOption, ThreadPresentationMode } from "@/shared/contracts";

export type OptionMenuOption = string | { id: string; label: string; hint?: string };

/** Semantic icon kinds resolved automatically by the composer. */
export type ComposerIconKind = "effort" | "permission";

const COLLAPSE_LEVELS = [0, 1, 2, 3, 4, 5] as const;
const DEFAULT_LABEL_COLLAPSE_LEVEL = 1;

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
      label: string;
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

function resolveIcon(control: ComposerControl): ReactNode | undefined {
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
    if (control.kind === "toggle") {
      return (
        <PermissionIcon
          className="size-4 text-foreground"
          index={control.isSelected ? 1 : 0}
          count={2}
        />
      );
    }
    const ids = control.options.map((o) => (typeof o === "string" ? o : o.id));
    const idx = ids.indexOf(control.value);
    return (
      <PermissionIcon
        className="size-4 text-foreground"
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
  if (!control.hideLabelOnWrap && control.tier === undefined) return false;
  return targetWrapLevel >= (control.tier ?? DEFAULT_LABEL_COLLAPSE_LEVEL);
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
  submitDisabled: boolean;
  submitPending?: boolean;
  stopPending?: boolean;
  preserveDisabledControlStyle?: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
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
    submitDisabled,
    submitPending = false,
    stopPending = false,
    preserveDisabledControlStyle = false,
    onPromptChange,
    onSubmit,
    onStop,
    controls,
    leadingControls,
    afterControls,
    toolbarLayoutKey,
    toolbarOnly = false,
  } = props;

  const [wrapLevel, setWrapLevel] = useState(0);
  const controlsRef = useRef<HTMLDivElement>(null);
  const probeContainerRef = useRef<HTMLDivElement>(null);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const probeContentCacheRef = useRef<{ key: string; content: ReactNode } | undefined>(undefined);
  const derivedToolbarLayoutKey = controls
    .map((control) => {
      if (control.kind === "provider-model") {
        return `provider-model:${control.currentAgentKind}:${control.currentModel}:${control.presentationMode ?? ""}:${control.hideLabelOnWrap ? "hide" : "show"}`;
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
    const el = editorHostRef.current?.querySelector<HTMLElement>(
      'textarea, [contenteditable="true"], input:not([type="hidden"])',
    );
    // rAF lets MenuTrigger's own focus-return run first, then we override it.
    if (el) requestAnimationFrame(() => el.focus());
  };

  // Use a ref to track the current wrapping level to avoid unnecessary state updates
  const wrapLevelRef = useRef(0);

  // Stable check function to find the best wrapLevel (0-5)
  // Each wrap level corresponds to a tier of controls collapsing.
  const checkWrap = () => {
    if (!probeContainerRef.current) return;
    const probes = probeContainerRef.current.children;
    if (probes.length === 0) return;

    // Find the first wrap level that fits on one row.
    // We check from level 0 (all expanded) up to 5 (all collapsed).
    let bestLevel = 5;
    for (let level = 0; level <= 5; level++) {
      const probeToolbar = probes[level] as HTMLElement;
      const wrappingContainer = probeToolbar?.querySelector(".probe-wrap-container") as HTMLElement;
      if (wrappingContainer && wrappingContainer.scrollWidth <= wrappingContainer.clientWidth) {
        bestLevel = level;
        break;
      }
    }

    if (bestLevel !== wrapLevelRef.current) {
      wrapLevelRef.current = bestLevel;
      setWrapLevel(bestLevel);
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
    ? "lightcode-composer-editor lightcode-composer-editor--compact"
    : "lightcode-composer-editor";
  const customInputClassName = compact
    ? "lightcode-composer-custom-input lightcode-composer-custom-input--compact"
    : "lightcode-composer-custom-input";
  const toolbarClassName = compact
    ? "lightcode-composer-toolbar lightcode-composer-toolbar--compact relative flex items-end justify-between gap-3"
    : "lightcode-composer-toolbar relative flex items-end justify-between gap-3";
  const shellClassName = [
    "lightcode-composer-shell",
    variant === "draft" && "lightcode-composer-shell--draft",
    variant !== "draft" &&
      preserveDisabledControlStyle &&
      "lightcode-composer-shell--preserve-disabled-controls",
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
          {...(control.openSignal !== undefined ? { openSignal: control.openSignal } : {})}
          {...(control.hideLabelOnWrap || shouldHideLabel
            ? {
                hideLabelOnWrap: true,
                forceHideLabel: shouldHideLabel,
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
          {...(control.hideLabelOnWrap || shouldHideLabel
            ? {
                hideLabelOnWrap: true,
                forceHideLabel: shouldHideLabel,
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
      const content = (
        <div key={`${control.value}-${index}`} className="lightcode-composer-static min-w-0 px-2.5">
          {control.icon}
          {!control.iconOnly && (
            <span
              className={
                hideLabel ? "lightcode-composer-label-hideable truncate is-hidden" : "truncate"
              }
            >
              {control.value}
            </span>
          )}
        </div>
      );

      if (control.iconOnly || (hideLabel && targetWrapLevel > 0)) {
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
      // A `disabledReason` toggle stays hoverable (not natively `disabled`) so
      // its explanatory tooltip still fires; it's dimmed and click is a no-op.
      const gated = Boolean(control.disabledReason);
      const toggle = (
        <ToggleButton
          key={`toggle-${index}`}
          aria-label={control.label}
          aria-disabled={gated}
          className={`lightcode-composer-toggle ${
            control.fillIconOnSelect ? "lightcode-composer-toggle--fill-icon-selected " : ""
          }${control.isCurrentState ? "lightcode-composer-toggle--current " : ""}${
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
          {resolveIcon(control)}
          {!control.iconOnly && (
            <span className={hideLabel ? "lightcode-composer-label-hideable is-hidden" : undefined}>
              {control.label}
            </span>
          )}
        </ToggleButton>
      );

      const tooltipText = gated ? control.disabledReason : hideLabel ? control.label : undefined;
      if (tooltipText) {
        return (
          <Tooltip key={`toggle-tooltip-${index}`} delay={0}>
            <Tooltip.Trigger>{toggle}</Tooltip.Trigger>
            <Tooltip.Content placement="top">{tooltipText}</Tooltip.Content>
          </Tooltip>
        );
      }

      return toggle;
    }

    const resolvedIcon = resolveIcon(control);
    const optionalProps = {
      ...(resolvedIcon ? { icon: resolvedIcon } : {}),
      ...(control.iconOnly ? { iconOnly: control.iconOnly } : {}),
      ...(control.placeholder ? { placeholder: control.placeholder } : {}),
      ...(control.isDisabled !== undefined ? { isDisabled: control.isDisabled } : {}),
      ...(control.hideLabelOnWrap || shouldHideLabel
        ? {
            hideLabelOnWrap: true,
            forceHideLabel: shouldHideLabel,
            tooltip: shouldHideLabel && targetWrapLevel > 0 ? control.value : undefined,
          }
        : {}),
    };

    return (
      <OptionMenu
        key={`${control.value}-${index}`}
        buttonVariant="ghost"
        className="lightcode-composer-menu min-w-0 px-2.5"
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

  const probeContentCacheKey = `${effectiveToolbarLayoutKey}|compact=${compact}`;
  if (!probeContentCacheRef.current || probeContentCacheRef.current.key !== probeContentCacheKey) {
    // The hidden probe tree renders a full copy of the toolbar for every
    // collapse level. Rebuild it only when layout-affecting inputs change;
    // state-only toggles such as Plan/Work can reuse the previous probe tree.
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
              className={toolbarClassName.replace("relative", "")}
              style={{ position: "absolute", inset: 0 }}
            >
              {leadingControls && (
                <div className="flex shrink-0 items-end gap-2">
                  {typeof leadingControls === "function" ? leadingControls(level) : leadingControls}
                </div>
              )}
              <div
                className="probe-wrap-container flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden [&>*]:shrink-0"
                style={{ height: "2.25rem" }}
              >
                {renderControlsList(level)}
              </div>
              <div className="flex shrink-0 items-end gap-2">
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
      {/* Real controls: wraps and respects wrapLevel state.
         Fixed height + overflow-hidden prevents a visible two-row blink
         while labels collapse — wrapped items are clipped, not shown. */}
      <div
        ref={controlsRef}
        className={`flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden [&>*]:shrink-0 ${
          wrapLevel > 0 ? "is-wrapping" : ""
        }`}
        style={{ height: "2.25rem" }}
      >
        {renderControlsList(wrapLevel)}
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
              aria-label="Stop response"
              className="lightcode-composer-send"
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
          <Tooltip.Content>Stop response</Tooltip.Content>
        </Tooltip>
      );
    }
    return (
      <Button
        isIconOnly
        aria-label={submitLabel}
        className="lightcode-composer-send"
        isDisabled={submitDisabled || promptDisabled}
        isPending={submitPending}
        onPress={onSubmit}
        size="sm"
      >
        {({ isPending }) =>
          isPending ? <PixelLoader size="xs" /> : <ArrowUp className="size-4" />
        }
      </Button>
    );
  };

  const toolbar = (
    <div className={toolbarClassName}>
      {leadingControls && (
        <div className="flex shrink-0 items-end gap-2">
          {typeof leadingControls === "function" ? leadingControls(wrapLevel) : leadingControls}
        </div>
      )}
      {renderControls()}
      <div className="flex shrink-0 items-end gap-2">
        {typeof afterControls === "function" ? afterControls(wrapLevel) : afterControls}
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
    <div>
      <div className={shellClassName}>
        {variant === "draft" && <div className="lightcode-composer-border-glow" />}
        {fixedContent}
        {attachmentBar}
        <div ref={editorHostRef}>{renderEditor()}</div>
        {toolbar}
      </div>
    </div>
  );
}
