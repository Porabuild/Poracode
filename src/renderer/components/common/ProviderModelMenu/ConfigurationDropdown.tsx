import { startTransition, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { ComboBox, Input, Label, ListBox, Select } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { FamilyMenuSelect } from "./ModelConfigurationPanel.types";

/** Per-gesture pointer state for the dropdown rows: which row the press started
 * on, where it started, and which id the select's own change event already
 * delivered for the gesture. Reset on every press start. */
interface PointerActivation {
  downId: string | null;
  downX: number;
  downY: number;
  deliveredId: string | null;
}

const NO_ACTIVATION: PointerActivation = {
  downId: null,
  downX: 0,
  downY: 0,
  deliveredId: null,
};

/** A compact field with the library's keyboard, filtering and nested-overlay semantics. */
export function ConfigurationDropdown({
  label,
  select,
  disabled,
  mobile,
  searchable = false,
  visibleLabel,
}: {
  label: string;
  select: FamilyMenuSelect;
  disabled: boolean;
  mobile: boolean;
  searchable?: boolean;
  visibleLabel?: string;
}) {
  const { t } = useLingui();
  // Deliberate activations reach the owner even when the value equals the
  // current one: re-picking the stored value is still evidence the user touched
  // that selector (it can revoke or refresh selection-binding evidence), and
  // the owner's own equality checks suppress genuinely unchanged persistence.
  const activation = useRef<PointerActivation>(NO_ACTIVATION);
  const onChange = (value: unknown) => {
    if (
      !disabled &&
      typeof value === "string" &&
      select.options.some((option) => option.id === value)
    ) {
      // The select reports changed values itself; remember the delivery so the
      // row-level same-value channel below never doubles it for the gesture.
      activation.current.deliveredId = value;
      startTransition(() => select.onChange(value));
    }
  };
  // The searchable ComboBox reports same-value reselects itself; the plain
  // Select suppresses them inside the library, so its rows forward same-value
  // pointer activations themselves. Only real pointer gestures land here —
  // controlled value updates never fire.
  const list = (
    <ListBox
      className="poracode-menu max-h-60 overflow-y-auto"
      renderEmptyState={() => (
        <span className="px-2 text-sm text-muted">
          <Trans>No models found</Trans>
        </span>
      )}
    >
      {select.options.map((option) => (
        <ListBox.Item
          key={option.id}
          id={option.id}
          textValue={option.label}
          className={mobile ? "min-h-11" : ""}
          {...(searchable
            ? {}
            : {
                onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                  if (
                    !disabled &&
                    !event.repeat &&
                    option.id === select.value &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    startTransition(() => select.onChange(option.id));
                  }
                },
                onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
                  activation.current = {
                    downId: option.id,
                    downX: event.clientX,
                    downY: event.clientY,
                    deliveredId: null,
                  };
                },
                onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
                  // A drag larger than the press slop (e.g. scrolling the rows)
                  // cancels the pending activation instead of firing it on
                  // release.
                  const session = activation.current;
                  if (session.downId !== option.id) return;
                  if (
                    Math.hypot(event.clientX - session.downX, event.clientY - session.downY) > 8
                  ) {
                    session.downId = null;
                  }
                },
                onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
                  const session = activation.current;
                  activation.current = NO_ACTIVATION;
                  if (disabled) return;
                  if (session.downId !== option.id || session.deliveredId === option.id) return;
                  if (option.id === select.value && event.button === 0) {
                    startTransition(() => select.onChange(option.id));
                  }
                },
                onPointerCancel: () => {
                  activation.current = NO_ACTIVATION;
                },
              })}
        >
          <Label className="min-w-0 flex-1 truncate">{option.label}</Label>
          <ListBox.ItemIndicator />
        </ListBox.Item>
      ))}
    </ListBox>
  );
  if (searchable) {
    return (
      <ComboBox
        aria-label={label}
        selectedKey={select.value}
        onSelectionChange={onChange}
        isDisabled={disabled}
        className="min-w-0 w-full"
        menuTrigger="focus"
      >
        <ComboBox.InputGroup className={mobile ? "h-11 min-w-0" : "h-9 min-w-0"}>
          <Input placeholder={t`Search models...`} className="min-w-0 w-full text-sm" />
          <ComboBox.Trigger />
        </ComboBox.InputGroup>
        <ComboBox.Popover className="max-w-[calc(100vw-2rem)] p-1">{list}</ComboBox.Popover>
      </ComboBox>
    );
  }
  return (
    <Select
      aria-label={label}
      value={select.value}
      onChange={onChange}
      isDisabled={disabled}
      className="min-w-0 w-full"
      variant="secondary"
    >
      {visibleLabel ? <Label className="text-xs text-muted">{visibleLabel}</Label> : null}
      <Select.Trigger className={mobile ? "h-11 min-w-0" : "h-9 min-w-0"}>
        <Select.Value className="truncate text-sm" />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="max-w-[calc(100vw-2rem)] p-1">{list}</Select.Popover>
    </Select>
  );
}
