import { use, useState, type ReactNode } from "react";
import { ComboBox, Description, Label, ListBox } from "@heroui/react";
import { ComboBoxStateContext } from "react-aria-components";
import { useLingui } from "@lingui/react/macro";
import { Button, Input, type SelectOption } from "@/renderer/components/common";
import { sharedSettingsSchema } from "@/shared/settings";

/** Editable family name; installed fonts are suggestions, never a requirement. */
export function TerminalFontPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
}) {
  const { t } = useLingui();
  const [draft, setDraft] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    setDraft(value);
  }
  const parsed = sharedSettingsSchema.shape.terminalFontFamily.safeParse(draft.trim());
  const invalid = !parsed.success;
  const commit = () => {
    if (!parsed.success) return;
    setDraft(parsed.data);
    if (parsed.data !== value) onChange(parsed.data);
  };

  return (
    <div className="flex w-[240px] max-w-full flex-col items-end gap-1">
      <ComboBox
        aria-label={t`Terminal font face`}
        className="w-full min-w-0"
        allowsCustomValue
        menuTrigger="input"
        defaultItems={options}
        inputValue={draft}
        onInputChange={setDraft}
        value={value ? `font:${value}` : "default"}
        onChange={(key) => {
          // React Aria also emits null while editing/committing custom text.
          // Custom values are committed explicitly on Enter, never on blur.
          if (key == null) return;
          const family = key === "default" ? "" : String(key).slice(5);
          setDraft(family);
          if (family !== value) onChange(family);
        }}
        onBlur={() => setDraft(value)}
        isInvalid={invalid}
      >
        <FontPickerFocusOwner onCommit={commit} onCancel={() => setDraft(value)}>
          <FontFamilyInput />
        </FontPickerFocusOwner>
        <ComboBox.Popover
          placement="bottom end"
          className="min-w-0 max-w-[calc(100vw-16px)] p-1"
          style={{ width: "var(--trigger-width)" }}
        >
          <FontPickerFocusOwner onCommit={commit} onCancel={() => setDraft(value)}>
            <ListBox className="poracode-menu max-h-60 overflow-y-auto">
              {(option: SelectOption) => (
                <ListBox.Item
                  id={option.id}
                  textValue={option.id === "default" ? "" : option.label}
                  className="min-w-0 pe-7"
                >
                  <div className="min-w-0 flex-1">
                    <Label className="block max-w-full truncate">{option.label}</Label>
                    {option.detail ? (
                      <Description className="block truncate text-xs">{option.detail}</Description>
                    ) : null}
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              )}
            </ListBox>
          </FontPickerFocusOwner>
        </ComboBox.Popover>
      </ComboBox>
      {invalid ? (
        <span role="alert" className="text-xs text-danger">
          {t`Enter a font family of up to 256 characters without control characters.`}
        </span>
      ) : draft !== value ? (
        <span className="text-xs text-muted">{t`Press Enter to apply.`}</span>
      ) : null}
      {value || draft ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label={t`Use default font`}
          onPress={() => {
            setDraft("");
            onChange("");
          }}
        >
          {t`Default`}
        </Button>
      ) : null}
    </div>
  );
}

/** Capture before React Aria commits so Escape and IME leave the preference intact. */
function FontPickerFocusOwner({
  onCommit,
  onCancel,
  children,
}: {
  onCommit: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const state = use(ComboBoxStateContext);
  return (
    <div
      data-overlay-escape-owner=""
      onKeyDownCapture={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) {
          // Keep native composition's default action, but bypass widget shortcuts.
          if (event.key === "Enter" || event.key === "Escape") event.stopPropagation();
          return;
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
          state?.revert();
        } else if (
          event.key === "Enter" &&
          event.target instanceof HTMLInputElement &&
          !event.target.getAttribute("aria-activedescendant")
        ) {
          event.preventDefault();
          event.stopPropagation();
          onCommit();
          state?.close();
        }
      }}
    >
      {children}
    </div>
  );
}

function FontFamilyInput() {
  const { t } = useLingui();
  return (
    <ComboBox.InputGroup>
      <Input placeholder={t`Default`} maxLength={256} />
      <ComboBox.Trigger aria-label={t`Show font suggestions`} />
    </ComboBox.InputGroup>
  );
}
