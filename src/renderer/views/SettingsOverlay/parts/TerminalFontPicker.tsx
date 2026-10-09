import { use, useState } from "react";
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
          // Custom values are committed explicitly on Enter or field blur.
          if (key == null) return;
          const family = key === "default" ? "" : String(key).slice(5);
          setDraft(family);
          if (family !== value) onChange(family);
        }}
        onBlur={commit}
        isInvalid={invalid}
      >
        <FontFamilyInput onCommit={commit} onCancel={() => setDraft(value)} />
        <ComboBox.Popover
          placement="bottom end"
          maxHeight={240}
          className="min-w-0 max-w-[calc(100vw-16px)]"
          style={{ width: "var(--trigger-width)" }}
        >
          <ListBox className="max-h-60 overflow-y-auto">
            {(option: SelectOption) => (
              <ListBox.Item id={option.id} textValue={option.label} className="min-w-0 pe-7">
                <div className="min-w-0 flex-1">
                  <Label className="block truncate">{option.label}</Label>
                  {option.detail ? (
                    <Description className="block truncate text-xs">{option.detail}</Description>
                  ) : null}
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            )}
          </ListBox>
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
function FontFamilyInput({ onCommit, onCancel }: { onCommit: () => void; onCancel: () => void }) {
  const { t } = useLingui();
  const state = use(ComboBoxStateContext);
  return (
    <div
      onKeyDownCapture={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) {
          if (event.key === "Enter") event.stopPropagation();
          return;
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
          state?.close();
        } else if (
          event.key === "Enter" &&
          !(event.target as HTMLElement).getAttribute("aria-activedescendant")
        ) {
          event.preventDefault();
          event.stopPropagation();
          onCommit();
          state?.close();
        }
      }}
    >
      <ComboBox.InputGroup>
        <Input placeholder={t`Default`} maxLength={256} />
        <ComboBox.Trigger aria-label={t`Show font suggestions`} />
      </ComboBox.InputGroup>
    </div>
  );
}
