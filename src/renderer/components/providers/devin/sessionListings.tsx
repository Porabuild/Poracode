import { Trans, useLingui } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common";

/**
 * View models and the shared read-only listing panel for the rules
 * session actions. The supervisor's adapters validate the provider wire
 * contract (one malformed entry fails the whole list, over-bound results
 * fail); this module renders what survived that admission and carries the
 * same strictness leaf-side: a listing that arrives without its array, or
 * with entries that cannot be rendered, is a contract violation shown as a
 * failed state — never silently emptied into a "no entries" message.
 */

export interface DevinRuleEntryView {
  name: string;
  path: string;
  scope?: string;
  trigger?: string;
}

export type DevinListingFailure = "transport" | "malformed";

export type DevinListingState<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "entries"; entries: readonly T[] }
  | { kind: "failed"; reason: DevinListingFailure };

/**
 * Project one rules entry for display. Returns undefined for anything that is
 * not a record with a name and path — the supervisor contract — so a shape
 * violation fails the listing instead of dropping a rule from view.
 */
export function devinRuleEntryView(entry: unknown): DevinRuleEntryView | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const record = entry as Record<string, unknown>;
  if (typeof record.name !== "string" || record.name.length === 0) return undefined;
  if (typeof record.path !== "string" || record.path.length === 0) return undefined;
  return {
    name: record.name,
    path: record.path,
    ...(typeof record.scope === "string" ? { scope: record.scope } : {}),
    ...(typeof record.trigger === "string" ? { trigger: record.trigger } : {}),
  };
}

export function DevinListingPanel<T>(props: {
  title: string;
  emptyText: string;
  malformedText: string;
  state: DevinListingState<T>;
  renderEntry: (entry: T) => React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{props.title}</p>
      {props.state.kind === "loading" || props.state.kind === "idle" ? (
        <PixelLoader size="xs" />
      ) : null}
      {props.state.kind === "failed" ? (
        <p className="text-sm text-warning">
          {props.state.reason === "malformed" ? (
            props.malformedText
          ) : (
            <Trans>The listing could not be read.</Trans>
          )}
        </p>
      ) : null}
      {props.state.kind === "entries" ? (
        props.state.entries.length === 0 ? (
          <p className="text-sm text-muted">{props.emptyText}</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-auto">
            {props.state.entries.map((entry) => props.renderEntry(entry))}
          </div>
        )
      ) : null}
    </div>
  );
}

export function DevinRuleEntry(props: { entry: DevinRuleEntryView }) {
  const { t } = useLingui();
  const { entry } = props;
  const scope =
    entry.scope === "global" ? t`Global` : entry.scope === "project" ? t`Project` : undefined;
  const trigger = entry.trigger === "always_on" ? t`Always applied` : undefined;
  return (
    <div className="min-w-0 rounded-lg border border-border/50 p-3">
      <p className="text-sm font-medium text-foreground">{entry.name}</p>
      <p className="mt-1 break-words text-xs text-muted">{entry.path}</p>
      {scope || trigger ? (
        <p className="mt-2 text-xs text-muted">{[scope, trigger].filter(Boolean).join(" · ")}</p>
      ) : null}
    </div>
  );
}
