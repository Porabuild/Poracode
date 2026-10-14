import type { KeyboardEvent, Ref } from "react";
import { useLingui } from "@lingui/react/macro";
import { Search } from "lucide-react";

/**
 * The model picker's filter row: a combobox-role input wired to the listbox
 * below it. Presentational only — the owning menu keeps the query, the active
 * descendant, and every key decision, so the ProviderModelMenu and the family
 * selector menus share identical DOM and handling.
 */
export function ModelMenuSearchInput(props: {
  inputRef: Ref<HTMLInputElement>;
  /** DOM id of the listbox this input controls. */
  listboxId: string;
  expanded: boolean;
  activeDescendantId?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const { inputRef, listboxId, expanded, activeDescendantId, value, onChange, onKeyDown } = props;
  const { t } = useLingui();
  return (
    <div className="poracode-model-menu-search flex items-center gap-2 border-b border-border px-3 py-2">
      <Search className="size-3.5 shrink-0 text-muted" />
      <input
        ref={inputRef}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
        placeholder={t`Search models...`}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={expanded}
        aria-activedescendant={activeDescendantId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
