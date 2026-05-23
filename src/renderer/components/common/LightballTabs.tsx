import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FlyingLightball } from "./FlyingLightball";

export interface LightballTab<K extends string> {
  id: K;
  label: ReactNode;
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
  /** Optional trailing slot (e.g. a count chip). Can be a function that
   *  receives the tab's active state, for active-aware styling. */
  trailing?: ReactNode | ((isActive: boolean) => ReactNode);
  /** Disabled tabs are skipped by keyboard nav and rendered dimmed. */
  disabled?: boolean;
}

/**
 * Shared pill-shaped tabs with a flying-lightball indicator. Used by the
 * Chat | CLI presentation switcher and the PR Review tabs. Consumers pick the
 * tab shape (variable-width auto vs equal-width fill) via the `equalWidth`
 * prop, and opt into the text-ignite-on-arrival polish via `delayActiveText`.
 */
export function LightballTabs<K extends string>(props: {
  tabs: ReadonlyArray<LightballTab<K>>;
  active: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  className?: string;
  /** All tabs share equal width via `flex-1`. Useful for fixed-width pills. */
  equalWidth?: boolean;
  /** Delay text-color flip to match ball arrival (~80ms). */
  delayActiveText?: boolean;
  /** Container/tab corner shape. Defaults to a full pill. */
  shape?: "pill" | "rounded";
  /** Drop the container background and border; useful when embedding into
   *  a parent surface that already provides chrome. */
  transparent?: boolean;
}) {
  const {
    tabs,
    active,
    onChange,
    ariaLabel,
    className,
    equalWidth = false,
    delayActiveText = false,
    shape = "pill",
    transparent = false,
  } = props;
  const containerRadiusClass = shape === "rounded" ? "rounded-xl" : "rounded-full";
  const tabRadiusClass = shape === "rounded" ? "rounded-lg" : "rounded-full";
  const containerChromeClass = transparent
    ? ""
    : "border border-border/15 bg-surface-tertiary/40 backdrop-blur-md";

  const listRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});
  const [activeText, setActiveText] = useState<K | null>(active);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (!delayActiveText) {
      setActiveText(active);
      return;
    }
    if (isInitialMount.current) {
      isInitialMount.current = false;
      setActiveText(active);
      return;
    }
    setActiveText(null);
    const t = setTimeout(() => setActiveText(active), 80);
    return () => clearTimeout(t);
  }, [active, delayActiveText]);

  function selectTab(id: K) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab || tab.disabled) return;
    if (active !== id) onChange(id);
    buttonRefs.current[id]?.focus();
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = tabs.filter((t) => !t.disabled);
    if (enabled.length === 0) return;
    const currentIdx = Math.max(
      0,
      enabled.findIndex((t) => t.id === active),
    );
    let nextId: K | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextId = enabled[(currentIdx + 1) % enabled.length]?.id;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextId = enabled[(currentIdx - 1 + enabled.length) % enabled.length]?.id;
        break;
      case "Home":
        nextId = enabled[0]?.id;
        break;
      case "End":
        nextId = enabled[enabled.length - 1]?.id;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (nextId) selectTab(nextId);
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKey}
      className={`relative inline-flex h-7 items-center ${containerRadiusClass} ${containerChromeClass} p-0.5 ${className ?? ""}`}
    >
      <FlyingLightball
        containerRef={listRef}
        activeKey={active}
        activeSelector={`[data-tab-id="${active}"]`}
      />
      {tabs.map((tab, i) => {
        const isActive = active === tab.id;
        const litText = delayActiveText ? activeText === tab.id : isActive;
        const trailing = typeof tab.trailing === "function" ? tab.trailing(isActive) : tab.trailing;
        return (
          <Fragment key={tab.id}>
            {i > 0 && <div className="h-3 w-px bg-foreground/20" aria-hidden />}
            <button
              ref={(el) => {
                buttonRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              data-tab-id={tab.id}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => selectTab(tab.id)}
              className={`relative ${equalWidth ? "flex-1" : ""} flex h-full items-center justify-center gap-1.5 ${tabRadiusClass} px-3 text-[11px] font-semibold tracking-tight outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-focus/50 ${
                litText ? "text-foreground" : "text-muted/60"
              }`}
            >
              <span className="relative z-10 flex items-center gap-1.5">
                {tab.icon}
                {tab.label}
                {trailing}
              </span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
