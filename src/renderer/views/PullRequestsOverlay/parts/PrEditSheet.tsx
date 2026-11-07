import type { KeyboardEvent } from "react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { useKeyboardOffset } from "@/renderer/components/mobileComposer/useKeyboardOffset";
import { PrField } from "./PrField";

/**
 * The compact editor for one text of a review (its title or description): a bottom
 * sheet with a multi-line, growing field and Cancel / Save. The page behind never
 * moves, and the field stays above the on-screen keyboard. Desktop edits inline.
 */
export function PrEditSheet(props: {
  isOpen: boolean;
  /** Names the sheet (its heading and accessible name). */
  label: string;
  fieldLabel: string;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  saveDisabled: boolean;
  /** Enter saves instead of adding a line (a title has no line breaks). */
  singleLine?: boolean;
  maxRows: number;
}) {
  const keyboardLift = useKeyboardOffset();
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!props.singleLine || event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!props.saveDisabled) props.onSave();
  }
  return (
    <BottomSheet isOpen={props.isOpen} label={props.label} onClose={props.onCancel}>
      <div className="m-sheet-head">
        <span className="truncate">{props.label}</span>
      </div>
      <div
        className="flex min-h-0 flex-col gap-3 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        style={{ paddingBottom: keyboardLift > 0 ? keyboardLift + 12 : undefined }}
      >
        <PrField
          ariaLabel={props.fieldLabel}
          value={props.value}
          disabled={props.saving}
          onChange={props.onChange}
          onKeyDown={onKeyDown}
          maxRows={props.maxRows}
          large
          focusOnMount
        />
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            isDisabled={props.saving}
            onPress={props.onCancel}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            isPending={props.saving}
            isDisabled={props.saveDisabled}
            onPress={props.onSave}
          >
            <Trans>Save</Trans>
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
