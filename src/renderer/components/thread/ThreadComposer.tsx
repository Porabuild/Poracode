import { ReactNode, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { ToggleButton, Tooltip } from "@heroui/react";
import { Button, OptionMenu, TextArea } from "../common";

export type OptionMenuOption = string | { id: string; label: string; hint?: string };

export type ComposerControl =
  | {
      kind?: "menu";
      value: string;
      options: readonly OptionMenuOption[];
      onChange?: (value: string) => void;
      icon?: ReactNode;
      iconOnly?: boolean;
      placeholder?: string;
      isDisabled?: boolean;
      hideLabelOnWrap?: boolean;
    }
  | {
      kind: "toggle";
      label: string;
      icon?: ReactNode;
      isSelected: boolean;
      onChange?: (isSelected: boolean) => void;
      isDisabled?: boolean;
      hideLabelOnWrap?: boolean;
    }
  | {
      kind: "static";
      value: string;
      icon?: ReactNode;
      iconOnly?: boolean;
      hideLabelOnWrap?: boolean;
    };

export function ThreadComposer(props: {
  autoFocus?: boolean;
  compact?: boolean;
  prompt: string;
  placeholder: string;
  inputContent?: ReactNode;
  attachmentBar?: ReactNode;
  promptDisabled?: boolean;
  submitLabel: string;
  submitDisabled: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  controls: ComposerControl[];
  afterControls?: ReactNode;
}) {
  const {
    autoFocus = false,
    compact = false,
    prompt,
    placeholder,
    inputContent,
    attachmentBar,
    promptDisabled = false,
    submitLabel,
    submitDisabled,
    onPromptChange,
    onSubmit,
    controls,
    afterControls,
  } = props;

  const [isWrapping, setIsWrapping] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  // Use a ref to track the current wrapping state to avoid unnecessary state updates
  const isWrappingRef = useRef(false);

  useEffect(() => {
    const check = () => {
      if (controlsRef.current && rulerRef.current) {
        const containerWidth = controlsRef.current.getBoundingClientRect().width;
        const preferredWidth = rulerRef.current.getBoundingClientRect().width;
        const shouldWrap = preferredWidth > containerWidth;

        if (shouldWrap !== isWrappingRef.current) {
          isWrappingRef.current = shouldWrap;
          setIsWrapping(shouldWrap);
        }
      }
    };

    const observer = new ResizeObserver(check);
    if (controlsRef.current) observer.observe(controlsRef.current);
    if (rulerRef.current) observer.observe(rulerRef.current);

    // Initial check
    check();

    return () => observer.disconnect();
  }, []); // Only setup once on mount

  // Also trigger a check when controls change (e.g. model name changes)
  // but without recreating the observer.
  useEffect(() => {
    if (controlsRef.current && rulerRef.current) {
      const containerWidth = controlsRef.current.getBoundingClientRect().width;
      const preferredWidth = rulerRef.current.getBoundingClientRect().width;
      const shouldWrap = preferredWidth > containerWidth;
      if (shouldWrap !== isWrappingRef.current) {
        isWrappingRef.current = shouldWrap;
        setIsWrapping(shouldWrap);
      }
    }
  }, [controls]);

  const editorClassName = compact
    ? "lightcode-composer-editor lightcode-composer-editor--compact"
    : "lightcode-composer-editor";
  const customInputClassName = compact
    ? "lightcode-composer-custom-input lightcode-composer-custom-input--compact"
    : "lightcode-composer-custom-input";
  const toolbarClassName = compact
    ? "lightcode-composer-toolbar lightcode-composer-toolbar--compact flex items-end justify-between gap-3"
    : "lightcode-composer-toolbar flex items-end justify-between gap-3";

  const renderControlsList = (forceShowLabels = false) =>
    controls.map((control, index) => {
      if (control.kind === "static") {
        const hideLabel = control.iconOnly || (control.hideLabelOnWrap && !forceShowLabels);
        const content = (
          <div
            key={`${control.value}-${index}`}
            className="lightcode-composer-static min-w-0 px-2.5"
          >
            {control.icon}
            {!control.iconOnly && (
              <span
                className={hideLabel ? "lightcode-composer-label-hideable truncate" : "truncate"}
              >
                {control.value}
              </span>
            )}
          </div>
        );

        if (control.iconOnly || (hideLabel && isWrapping)) {
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
        const toggle = (
          <ToggleButton
            key={`toggle-${index}`}
            className="lightcode-composer-toggle min-w-0 px-2.5"
            isDisabled={control.isDisabled ?? false}
            isSelected={control.isSelected}
            size="sm"
            variant="ghost"
            onChange={control.onChange ?? (() => undefined)}
          >
            {control.icon}
            <span
              className={
                control.hideLabelOnWrap && !forceShowLabels
                  ? "lightcode-composer-label-hideable"
                  : undefined
              }
            >
              {control.label}
            </span>
          </ToggleButton>
        );

        if (control.hideLabelOnWrap && !forceShowLabels && isWrapping) {
          return (
            <Tooltip key={`toggle-tooltip-${index}`}>
              {toggle}
              <Tooltip.Content placement="top">{control.label}</Tooltip.Content>
            </Tooltip>
          );
        }

        return toggle;
      }

      const optionalProps = {
        ...(control.icon ? { icon: control.icon } : {}),
        ...(control.iconOnly ? { iconOnly: control.iconOnly } : {}),
        ...(control.placeholder ? { placeholder: control.placeholder } : {}),
        ...(control.isDisabled !== undefined ? { isDisabled: control.isDisabled } : {}),
        ...(control.hideLabelOnWrap !== undefined
          ? {
              hideLabelOnWrap: control.hideLabelOnWrap && !forceShowLabels,
              tooltip:
                control.hideLabelOnWrap && !forceShowLabels && isWrapping
                  ? control.value
                  : undefined,
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
          {...optionalProps}
        />
      );
    });

  const renderControls = () => (
    <div className="relative flex-1 min-w-0">
      {/* Ruler: hidden, non-wrapping, full labels */}
      <div
        ref={rulerRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 flex flex-nowrap items-center gap-1 opacity-0"
        style={{ visibility: "hidden", whiteSpace: "nowrap" }}
      >
        {renderControlsList(true)}
      </div>

      {/* Real Controls: wraps and respects isWrapping state.
         Fixed height + overflow-hidden prevents a visible two-row blink
         while labels collapse — wrapped items are clipped, not shown. */}
      <div
        ref={controlsRef}
        className={`flex min-w-0 flex-wrap items-center gap-1 overflow-hidden ${isWrapping ? "is-wrapping" : ""}`}
        style={{ height: "2.25rem" }}
      >
        {renderControlsList()}
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
        rows={3}
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

  const renderSendButton = () => (
    <Button
      isIconOnly
      aria-label={submitLabel}
      className="lightcode-composer-send"
      isDisabled={submitDisabled || promptDisabled}
      onPress={onSubmit}
      size="sm"
    >
      <ArrowUp className="size-4" />
    </Button>
  );

  return (
    <div>
      <div className="lightcode-composer-shell overflow-hidden">
        {attachmentBar}
        {renderEditor()}
        <div className={toolbarClassName}>
          {renderControls()}
          <div className="flex items-end gap-2">
            {afterControls}
            {renderSendButton()}
          </div>
        </div>
      </div>
    </div>
  );
}
