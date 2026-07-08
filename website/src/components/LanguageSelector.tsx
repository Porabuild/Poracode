"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Globe } from "lucide-react";
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function LanguageSelector() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Map the current path to its equivalent under another locale. The default
  // locale is unprefixed; every other locale gets a "/<code>" prefix.
  const pathForLocale = (target: Locale): string => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0 && segments[0] !== DEFAULT_LOCALE && isLocale(segments[0])) {
      segments.shift();
    }
    const rest = segments.join("/");
    if (target === DEFAULT_LOCALE) return rest ? `/${rest}` : "/";
    return rest ? `/${target}/${rest}` : `/${target}`;
  };

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={t("lang.label")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Globe className="h-4 w-4" />
        <span>{current.label}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("lang.label")}
          className="absolute right-0 z-50 mt-2 max-h-80 w-48 overflow-y-auto rounded-xl border border-white/10 bg-black/95 p-1 shadow-2xl shadow-black/50 backdrop-blur"
        >
          {LOCALES.map((l) => {
            const selected = l.code === locale;
            return (
              <button
                key={l.code}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setOpen(false);
                  if (l.code !== locale) router.push(pathForLocale(l.code));
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/10 ${
                  selected ? "text-white" : "text-gray-300"
                }`}
              >
                <span>{l.label}</span>
                {selected && <Check className="h-3.5 w-3.5 text-gray-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
