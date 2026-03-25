import type { ReactNode } from "react";
import { ArrowUp } from "lucide-react";
import { ToggleButton } from "@heroui/react";
import { Button, OptionMenu, TextArea } from "../common";

type OptionMenuOption = string | { id: string; label: string };

type ComposerControl =
  | {
      kind?: "menu";
      value: string;
      options: readonly OptionMenuOption[];
      onChange?: (value: string) => void;
      icon?: ReactNode;
      placeholder?: string;
      isDisabled?: boolean;
    }
  | {
      kind: "toggle";
      label: string;
      icon?: ReactNode;
      isSelected: boolean;
      onChange?: (isSelected: boolean) => void;
      isDisabled?: boolean;
    }
  | {
      kind: "static";
      value: string;
      icon?: ReactNode;
    };

export function ThreadComposer(props: {
  autoFocus?: boolean;
  compact?: boolean;
  prompt: string;
  placeholder: string;
  inputContent?: ReactNode;
  promptDisabled?: boolean;
  submitLabel: string;
  submitDisabled: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  controls: ComposerControl[];
}) {
  const {
    autoFocus = false,
    compact = false,
    prompt,
    placeholder,
    inputContent,
    promptDisabled = false,
    submitLabel,
    submitDisabled,
    onPromptChange,
    onSubmit,
    controls,
  } = props;
  const editorClassName = compact
    ? "lightcode-composer-editor lightcode-composer-editor--compact"
    : "lightcode-composer-editor";
  const customInputClassName = compact
    ? "lightcode-composer-custom-input lightcode-composer-custom-input--compact"
    : "lightcode-composer-custom-input";
  const toolbarClassName = compact
    ? "lightcode-composer-toolbar lightcode-composer-toolbar--compact flex flex-wrap items-center justify-between gap-3"
    : "lightcode-composer-toolbar flex flex-wrap items-center justify-between gap-3";

  const renderControls = () => (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {controls.map((control, index) => {
        if (control.kind === "static") {
          return (
            <div
              key={`${control.value}-${index}`}
              className="lightcode-composer-static min-w-0 px-2.5"
            >
              {control.icon}
              <span className="truncate">{control.value}</span>
            </div>
          );
        }

        if (control.kind === "toggle") {
          return (
            <ToggleButton
              key={`toggle-${index}`}
              className="lightcode-composer-toggle min-w-0 px-2.5 text-xs"
              isDisabled={control.isDisabled ?? false}
              isSelected={control.isSelected}
              size="sm"
              variant="ghost"
              onChange={control.onChange ?? (() => undefined)}
            >
              {control.icon}
              {control.label}
            </ToggleButton>
          );
        }

        const optionalProps = {
          ...(control.icon ? { icon: control.icon } : {}),
          ...(control.placeholder ? { placeholder: control.placeholder } : {}),
          ...(control.isDisabled !== undefined ? { isDisabled: control.isDisabled } : {}),
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
      })}
    </div>
  );

  const renderEditor = () =>
    inputContent ? (
      <div className={customInputClassName}>{inputContent}</div>
    ) : (
      <TextArea
        autoFocus={autoFocus}
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
        {renderEditor()}
        <div className={toolbarClassName}>
          {renderControls()}
          <div className="flex items-center gap-2">{renderSendButton()}</div>
        </div>
      </div>
    </div>
  );
}
