import type { ReactNode } from "react";
import { ArrowUp, Mic } from "lucide-react";
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
      kind: "static";
      value: string;
      icon?: ReactNode;
    };

export function ThreadComposer(props: {
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

  return (
    <div>
      <div className="lightcode-composer-shell overflow-hidden">
        {inputContent ? (
          <div className={customInputClassName}>{inputContent}</div>
        ) : (
          <TextArea
            fullWidth
            className={editorClassName}
            disabled={promptDisabled}
            placeholder={placeholder}
            rows={compact ? 2 : 3}
            value={prompt}
            variant="secondary"
            onChange={(event) => onPromptChange(event.target.value)}
          />
        )}

        <div className={toolbarClassName}>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {controls.map((control, index) => {
              if (control.kind === "static") {
                return (
                  <div
                    key={`${control.value}-${index}`}
                    className="lightcode-composer-static min-w-0 rounded-full px-2.5"
                  >
                    {control.icon}
                    <span className="truncate">{control.value}</span>
                  </div>
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
                  className="lightcode-composer-menu min-w-0 rounded-full px-2.5"
                  options={control.options}
                  value={control.value}
                  onChange={control.onChange ?? (() => undefined)}
                  {...optionalProps}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label="Voice input placeholder"
              className="lightcode-composer-utility"
              disabled={promptDisabled}
              type="button"
            >
              <Mic className="size-3.5" />
            </button>
            <Button
              isIconOnly
              aria-label={submitLabel}
              className="lightcode-composer-send rounded-full"
              isDisabled={submitDisabled || promptDisabled}
              onPress={onSubmit}
              size="sm"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
