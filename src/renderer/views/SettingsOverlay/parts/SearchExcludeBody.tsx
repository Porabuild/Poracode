import { type ReactNode, startTransition, useState } from "react";
import { Switch } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Lock, Trash2 } from "lucide-react";
import { Button, Input } from "@/renderer/components/common";
import { LOCKED_SEARCH_EXCLUDE } from "@/shared/searchExclude";

interface SearchExcludeBodyProps {
  /** Effective `useIgnoreFiles` value for this scope. */
  useIgnoreFiles: boolean;
  /** Description shown under the "Use ignore files" label. */
  useIgnoreFilesNote: ReactNode;
  /** Setter for `useIgnoreFiles` in this scope. */
  onUseIgnoreFilesChange: (value: boolean) => void;
  /** Optional reset action (project-only override). */
  useIgnoreFilesResetAction?: ReactNode;

  /**
   * The current scope's exclude map. For the global view this is the user's
   * `searchExclude`; for the project view it's the project override map.
   */
  value: Record<string, boolean>;
  /**
   * Inherited exclude map from lower layers (defaults for global view;
   * defaults + global for project view). Patterns enabled here that the
   * scope hasn't overridden are shown as inherited rows.
   */
  baseline: Record<string, boolean>;
  /** Replace the scope's exclude map. */
  onValueChange: (next: Record<string, boolean>) => void;
}

interface Row {
  pattern: string;
  inherited: boolean;
  locked?: boolean;
}

export function SearchExcludeBody(props: SearchExcludeBodyProps) {
  const {
    useIgnoreFiles,
    useIgnoreFilesNote,
    onUseIgnoreFilesChange,
    useIgnoreFilesResetAction,
    value,
    baseline,
    onValueChange,
  } = props;

  const rows = buildRows(baseline, value);

  function remove(pattern: string) {
    const baselineEnabled = baseline[pattern] === true;
    const ownEntry = value[pattern];
    if (baselineEnabled && ownEntry === undefined) {
      onValueChange({ ...value, [pattern]: false });
    } else {
      const { [pattern]: _, ...rest } = value;
      onValueChange(rest);
    }
  }

  function add(pattern: string) {
    if (value[pattern] === true) return;
    onValueChange({ ...value, [pattern]: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>Use ignore files</Trans>
          </p>
          <p className="text-xs text-muted">{useIgnoreFilesNote}</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            isSelected={useIgnoreFiles}
            onChange={(selected) => {
              startTransition(() => onUseIgnoreFilesChange(selected));
            }}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
          {useIgnoreFilesResetAction}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            <Trans>Exclude patterns</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>Files matching these globs are hidden from the @file mention search.</Trans>
          </p>
        </div>
        <ExcludeList rows={rows} onRemove={remove} />
        <AddPatternInput onAdd={add} />
      </div>
    </div>
  );
}

function ExcludeList(props: { rows: Row[]; onRemove: (pattern: string) => void }) {
  const { t } = useLingui();
  if (props.rows.length === 0) {
    return (
      <div className="rounded border border-[var(--hairline)] bg-surface/40 px-2.5 py-1 text-xs text-muted">
        <Trans>No patterns.</Trans>
      </div>
    );
  }
  return (
    <div className="max-h-[280px] divide-y divide-[var(--hairline)] overflow-y-auto rounded border border-[var(--hairline)] bg-surface/40">
      {props.rows.map((row) => {
        const pattern = row.pattern;
        return (
          <div key={pattern} className="flex h-8 items-center gap-2 px-2.5">
            <code className="flex-1 truncate font-mono text-xs text-foreground">{pattern}</code>
            {row.inherited && !row.locked && (
              <span className="text-[10px] uppercase tracking-wide text-muted">
                <Trans comment="Badge on an exclude pattern inherited from a lower scope">
                  inherited
                </Trans>
              </span>
            )}
            {row.locked ? (
              <span
                className="flex size-5 items-center justify-center text-muted"
                title={t`Always excluded`}
              >
                <Lock className="size-3" />
              </span>
            ) : (
              <button
                type="button"
                aria-label={t`Remove ${pattern}`}
                onClick={() => props.onRemove(pattern)}
                className="flex size-5 items-center justify-center rounded text-muted hover:bg-[var(--row-hover)] hover:text-foreground"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddPatternInput(props: { onAdd: (pattern: string) => void }) {
  const { t } = useLingui();
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    props.onAdd(trimmed);
    setDraft("");
  }

  return (
    <div className="flex gap-2">
      <Input
        aria-label={t`Add pattern`}
        className="flex-1"
        placeholder="**/your-glob"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      <Button variant="secondary" onPress={commit}>
        <Trans>Add</Trans>
      </Button>
    </div>
  );
}

function buildRows(baseline: Record<string, boolean>, value: Record<string, boolean>): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();

  for (const pattern of LOCKED_SEARCH_EXCLUDE) {
    seen.add(pattern);
    rows.push({ pattern, inherited: true, locked: true });
  }

  for (const pattern of Object.keys(baseline)) {
    if (seen.has(pattern)) continue;
    if (baseline[pattern] !== true) continue;
    seen.add(pattern);
    const own = value[pattern];
    if (own === false) continue; // explicitly overridden off in this scope
    rows.push({ pattern, inherited: own === undefined });
  }
  for (const [pattern, enabled] of Object.entries(value)) {
    if (seen.has(pattern)) continue;
    if (!enabled) continue;
    rows.push({ pattern, inherited: false });
  }

  return rows;
}
