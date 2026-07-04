import type { ReactNode } from "react";

export function SettingsPage(props: {
  title: string;
  /** Optional subtitle rendered under the title. */
  description?: ReactNode;
  /** Optional controls rendered to the right of the title (e.g. an env toggle). */
  actions?: ReactNode;
  /**
   * Class for the body wrapper. Defaults to `space-y-4` (the standard row gap).
   * Pass `""` to opt out when the body has bespoke spacing (e.g. About, Archived).
   * Always use the destructuring default — switching to a truthy fallback would
   * silently override the explicit `""` opt-out.
   */
  bodyClassName?: string;
  children: ReactNode;
}) {
  const { title, description, actions, bodyClassName = "space-y-4", children } = props;
  return (
    <div className="mx-auto min-h-full max-w-[720px]">
      <div className={`flex items-center justify-between gap-4 ${description ? "mb-2" : "mb-6"}`}>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {description ? <p className="mb-6 text-xs text-muted">{description}</p> : null}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function SettingRow(props: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Marks this row as a search target. When set, the row carries
   * `data-settings-anchor` so the settings search can scroll to / highlight it.
   * `scroll-mt-4` clears the scroller's top padding (there is no sticky header).
   * Must match the corresponding `anchor` in {@link ./settingsSearchIndex}.
   */
  anchorId?: string;
}) {
  // The stable settings-row classes let the mobile PWA reflow rows on narrow
  // viewports (see src/mobile/styles.css).
  return (
    <div
      {...(props.anchorId ? { id: props.anchorId, "data-settings-anchor": props.anchorId } : {})}
      className={`settings-row flex items-center justify-between gap-4 ${props.anchorId ? "scroll-mt-4" : ""} ${props.className ?? ""}`}
    >
      <div className="settings-row__text min-w-0">
        <p className="text-sm font-medium text-foreground">{props.title}</p>
        <p className="text-xs text-muted">{props.description}</p>
      </div>
      {props.children}
    </div>
  );
}
