import { ArrowUp, Plus, Wrench, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@/renderer/i18n/i18n";
import type { ChangelogChangeKind, ChangelogRelease } from "@/shared/changelog";

const KIND_ORDER: ChangelogChangeKind[] = ["added", "improved", "fixed"];

const KIND_ICON: Record<ChangelogChangeKind, { icon: LucideIcon; className: string }> = {
  added: { icon: Plus, className: "text-success" },
  improved: { icon: ArrowUp, className: "text-accent" },
  fixed: { icon: Wrench, className: "text-muted" },
};

// Intl.DateTimeFormat construction is comparatively costly, so cache one
// formatter per locale rather than rebuilding it for every release on render.
const dateFormatters = new Map<string, Intl.DateTimeFormat | null>();
function dateFormatterFor(locale: string): Intl.DateTimeFormat | null {
  let formatter = dateFormatters.get(locale);
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      formatter = null;
    }
    dateFormatters.set(locale, formatter);
  }
  return formatter;
}

/** Format an ISO date with the active app locale (falls back to the raw string). */
function formatReleaseDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return dateFormatterFor(i18n.locale)?.format(date) ?? iso;
}

function ReleaseBlock(props: { release: ChangelogRelease }) {
  const { release } = props;
  const { t } = useLingui();
  const kindLabel: Record<ChangelogChangeKind, string> = {
    added: t`New`,
    improved: t`Improved`,
    fixed: t`Fixed`,
  };
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: release.changes.filter((change) => change.kind === kind),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-foreground">{release.title}</h2>
        <span className="rounded-full bg-[var(--row-active)] px-2 py-0.5 text-xs font-medium text-muted">
          v{release.version}
        </span>
        <span className="text-xs text-muted">{formatReleaseDate(release.date)}</span>
      </header>

      <p className="text-sm leading-relaxed text-muted">{release.summary}</p>

      <div className="space-y-4">
        {groups.map((group) => {
          const { icon: Icon, className } = KIND_ICON[group.kind];
          return (
            <div key={group.kind} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Icon className={`size-3.5 ${className}`} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {kindLabel[group.kind]}
                </span>
              </div>
              <ul className="space-y-1.5 pl-5">
                {group.items.map((change, index) => (
                  <li
                    key={index}
                    className="relative text-sm leading-relaxed text-foreground/90 before:absolute before:-left-3.5 before:top-2 before:size-1 before:rounded-full before:bg-muted/60"
                  >
                    {change.text}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Renders a human-readable list of releases (newest first). Used by the
 * Settings → Changelog page and the "What's New" dialog's full view. Pass
 * `releases` to scope the list (e.g. only unseen releases); defaults to the
 * given `releases` (newest-first).
 */
export function ChangelogView(props: {
  releases: readonly ChangelogRelease[];
  footer?: ReactNode;
}) {
  const { releases } = props;
  return (
    <div className="divide-y divide-[var(--hairline)]">
      {releases.map((release) => (
        <div key={release.version} className="py-6 first:pt-0 last:pb-0">
          <ReleaseBlock release={release} />
        </div>
      ))}
      {props.footer ? <div className="pt-6">{props.footer}</div> : null}
    </div>
  );
}
