import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Check, ChevronDown, Search } from "lucide-react";
import { ResponsiveMenuSurface } from "@/renderer/components/common/ResponsiveMenuSurface";

export interface SearchableOption {
  value: string;
  label: string;
  /** Rendered under the label in a muted line — the folder path, say. */
  hint?: string;
}

/**
 * A select whose menu carries a search box. A native `<select>` cannot be
 * filtered, and a list of a few dozen project folders is unusable without
 * one. Options are given in display order; the search matches label and hint.
 */
export function SearchableSelect(props: {
  label: string;
  value: string;
  options: readonly SearchableOption[];
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  className?: string;
  mono?: boolean;
}) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Search resets from the open/close event itself; the effect only has to
  // move focus, which is a DOM side effect and belongs here.
  const setOpen = (open: boolean) => {
    if (!open) setSearch("");
    setIsOpen(open);
  };
  useEffect(() => {
    if (!isOpen) return;
    const handle = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(handle);
  }, [isOpen]);

  const needle = search.trim().toLowerCase();
  const visible =
    needle.length === 0
      ? props.options
      : props.options.filter(
          (option) =>
            option.label.toLowerCase().includes(needle) ||
            (option.hint ?? "").toLowerCase().includes(needle),
        );
  const current = props.options.find((option) => option.value === props.value);

  const trigger = (
    <button
      type="button"
      aria-label={props.label}
      className={`flex h-7 min-w-0 items-center gap-1 rounded border border-border/20 bg-transparent px-2 text-xs text-foreground hover:bg-[var(--row-hover)] ${
        props.mono ? "font-mono" : ""
      } ${props.className ?? ""}`}
      onClick={() => setOpen(true)}
    >
      <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? props.value}</span>
      <ChevronDown className="size-3 shrink-0 text-muted" />
    </button>
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={setOpen}
      label={props.label}
      trigger={trigger}
      triggerClassName="flex min-w-0 items-center"
      placement="bottom start"
      contentClassName="w-96 p-0"
      dialogClassName="flex max-h-[22rem] flex-col overflow-hidden !p-0 !pb-1"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="size-3.5 shrink-0 text-muted" />
        <input
          ref={searchRef}
          aria-label={t`Search ${props.label}`}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
          placeholder={props.searchPlaceholder ?? t`Search…`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && visible[0]) {
              props.onChange(visible[0].value);
              setOpen(false);
            }
          }}
        />
      </div>
      <div role="listbox" aria-label={props.label} className="min-h-0 flex-1 overflow-y-auto py-1">
        {visible.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted">{t`No matches`}</div>
        ) : null}
        {visible.map((option) => {
          const selected = option.value === props.value;
          return (
            <div key={option.value} role="option" aria-selected={selected}>
              <button
                type="button"
                className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--row-hover)] ${
                  selected ? "text-foreground" : "text-foreground/85"
                }`}
                onClick={() => {
                  props.onChange(option.value);
                  setOpen(false);
                }}
              >
                <Check
                  className={`mt-0.5 size-3 shrink-0 ${selected ? "text-accent" : "invisible"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${props.mono ? "font-mono" : ""}`}>
                    {option.label}
                  </span>
                  {option.hint ? (
                    <span className="block truncate font-mono text-[10px] text-muted">
                      {option.hint}
                    </span>
                  ) : null}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </ResponsiveMenuSurface>
  );
}
