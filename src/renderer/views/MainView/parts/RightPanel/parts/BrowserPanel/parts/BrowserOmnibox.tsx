import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Globe, History, Search } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { stripScheme } from "@/shared/url";

const LOCALHOST_PATTERN =
  /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[(?:[0-9a-f:]+)\])(?::\d+)?(?:[/?#]|$)/i;

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith("about:")) {
    return trimmed;
  }
  if (LOCALHOST_PATTERN.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/\s/.test(trimmed) || !/\./.test(trimmed)) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
  }
  return `https://${trimmed}`;
}

interface OmniItem {
  kind: "history" | "search";
  label: string;
  detail?: string;
  /** Normalized URL to navigate to when chosen. */
  value: string;
}

const SUGGEST_DEBOUNCE_MS = 110;

/**
 * Address bar with history + DuckDuckGo autocomplete. The suggestions dropdown
 * is portaled to the body and the page is frozen behind a screenshot while the
 * bar is focused (via `onPreviewChange`) because the embedded `<webview>` paints
 * over normal DOM and would otherwise hide the dropdown.
 */
export function BrowserOmnibox(props: {
  activeTabId: string | null;
  activeUrl: string | undefined;
  disabled: boolean;
  onPreviewChange: (dataUrl: string | null) => void;
}) {
  const { t } = useLingui();
  const { activeTabId, activeUrl, onPreviewChange } = props;
  const [urlInput, setUrlInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [items, setItems] = useState<OmniItem[]>([]);
  const [selected, setSelected] = useState(-1);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const prevValueRef = useRef("");
  const lastInsertRef = useRef(false);
  const pendingSelectRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!focused) {
      setUrlInput(activeUrl ?? "");
      prevValueRef.current = activeUrl ?? "";
    }
  }, [activeUrl, focused]);

  // Apply a pending inline-autocomplete selection once the controlled value has
  // committed to the DOM, so the completed tail is highlighted (overtypable).
  useEffect(() => {
    const sel = pendingSelectRef.current;
    if (!sel) return;
    pendingSelectRef.current = null;
    inputRef.current?.setSelectionRange(sel[0], sel[1]);
  }, [urlInput]);

  const open = focused && items.length > 0;

  // Freeze the page behind a screenshot while the dropdown is open. The embedded
  // <webview> paints over normal DOM, so the dropdown would otherwise be hidden;
  // BrowserPanel swaps in this preview image and hides the live webview.
  useEffect(() => {
    if (!open || !activeTabId) return;
    let cancelled = false;
    readBridge()
      .browserCapturePreview({ tabId: activeTabId })
      .then((res) => {
        if (!cancelled && res?.dataUrl) onPreviewChange(res.dataUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      onPreviewChange(null);
    };
  }, [open, activeTabId, onPreviewChange]);

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  function clearSuggest() {
    reqIdRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setItems([]);
    setSelected(-1);
  }

  function scheduleSuggest(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      clearSuggest();
      return;
    }
    debounceRef.current = setTimeout(() => {
      const id = ++reqIdRef.current;
      readBridge()
        .browserSuggest({ query })
        .then((res) => {
          if (id !== reqIdRef.current) return;
          const history: OmniItem[] = res.history.map((h) => ({
            kind: "history",
            label: h.title || stripScheme(h.url),
            detail: stripScheme(h.url),
            value: h.url,
          }));
          const seen = new Set(history.map((h) => h.value));
          const search: OmniItem[] = res.suggestions
            .filter((s) => !seen.has(s))
            .slice(0, 8)
            .map((s) => ({ kind: "search", label: s, value: normalizeUrl(s) }));
          setItems([...history, ...search].slice(0, 10));
          setSelected(-1);
          if (lastInsertRef.current && history[0]) applyInlineAutocomplete(history[0].value);
        })
        .catch(() => {});
    }, SUGGEST_DEBOUNCE_MS);
  }

  function applyInlineAutocomplete(candidateUrl: string) {
    const typed = inputRef.current?.value ?? "";
    if (!typed) return;
    const typedLc = typed.toLowerCase();
    const candidates = [candidateUrl, stripScheme(candidateUrl)];
    for (const candidate of candidates) {
      if (candidate.toLowerCase().startsWith(typedLc) && candidate.length > typed.length) {
        // Preserve what the user typed; append + highlight the completion.
        const completed = typed + candidate.slice(typed.length);
        pendingSelectRef.current = [typed.length, completed.length];
        setUrlInput(completed);
        return;
      }
    }
  }

  function navigate(value: string) {
    const url = value || normalizeUrl(urlInput);
    if (!url || !activeTabId) return;
    readBridge()
      .browserNavigate({ tabId: activeTabId, url })
      .catch(() => {});
    clearSuggest();
    onPreviewChange(null);
    inputRef.current?.blur();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const chosen =
      selected >= 0 && items[selected] ? items[selected].value : normalizeUrl(urlInput);
    navigate(chosen);
  }

  function onChange(value: string) {
    lastInsertRef.current = value.length > prevValueRef.current.length;
    prevValueRef.current = value;
    setUrlInput(value);
    scheduleSuggest(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && items.length > 0) {
      event.preventDefault();
      setSelected((s) => (s + 1) % items.length);
    } else if (event.key === "ArrowUp" && items.length > 0) {
      event.preventDefault();
      setSelected((s) => (s <= 0 ? items.length - 1 : s - 1));
    } else if (event.key === "Escape") {
      if (items.length > 0) {
        event.stopPropagation();
        clearSuggest();
      } else {
        inputRef.current?.blur();
      }
    }
  }

  function onFocus() {
    setFocused(true);
    inputRef.current?.select();
  }

  function onBlur() {
    setFocused(false);
    setUrlInput(activeUrl ?? "");
    clearSuggest();
    onPreviewChange(null);
  }

  return (
    <form className="relative flex-1" onSubmit={onSubmit}>
      <input
        ref={inputRef}
        type="text"
        data-poracode-browser-address=""
        className="h-7 w-full rounded border border-border bg-[var(--field-background)] px-2 text-[12px] text-foreground outline-none placeholder:text-[color:var(--field-placeholder)] focus:border-[color:var(--accent)]"
        placeholder={t`Search or enter address`}
        value={urlInput}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={props.disabled}
      />
      {open && rect
        ? createPortal(
            <div
              className="fixed z-[1000] overflow-hidden rounded-md border border-border bg-[var(--content-background)] py-1 shadow-2xl"
              style={{ left: rect.left, top: rect.top, width: rect.width }}
            >
              {items.map((item, index) => (
                <button
                  key={`${item.kind}-${item.value}-${index}`}
                  type="button"
                  // Prevent the input's blur from firing before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => navigate(item.value)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] ${
                    index === selected ? "bg-[var(--surface-secondary)]" : ""
                  }`}
                >
                  {item.kind === "history" ? (
                    <History className="size-3.5 shrink-0 text-muted" />
                  ) : item.value.includes("duckduckgo.com/?q=") ? (
                    <Search className="size-3.5 shrink-0 text-muted" />
                  ) : (
                    <Globe className="size-3.5 shrink-0 text-muted" />
                  )}
                  <span className="truncate text-foreground">{item.label}</span>
                  {item.detail ? (
                    <span className="ml-auto shrink-0 truncate pl-3 text-[11px] text-muted">
                      {item.detail}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </form>
  );
}
