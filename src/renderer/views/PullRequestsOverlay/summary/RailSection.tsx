import type { ReactNode } from "react";

/** One rail block: a small heading, an optional trailing control, then the content. */
export function RailSection(props: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-[var(--hairline)] py-3 first:border-t-0 first:pt-0">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {props.title}
        </h3>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}
