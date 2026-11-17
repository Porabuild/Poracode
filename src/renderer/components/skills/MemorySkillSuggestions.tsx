import { useEffect, useState, type KeyboardEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Sparkles } from "lucide-react";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common";
import { isValidSkillName } from "@/shared/contracts/skill";
import type { MemorySkillSuggestion } from "@/shared/memory";

export function MemorySkillSuggestions(props: { projectId?: string; onApproved?: () => void }) {
  const { t } = useLingui();
  const remote = isRemoteSession();
  const [suggestions, setSuggestions] = useState<MemorySkillSuggestion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "", body: "" });
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState(false);

  useEffect(() => {
    if (remote) return;
    let active = true;
    void readBridge()
      .memoryCommand({
        action: "suggestions",
        ...(props.projectId ? { projectId: props.projectId } : {}),
      })
      .then((next) => {
        if (active) {
          setError(false);
          setSuggestions(next as MemorySkillSuggestion[]);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [props.projectId, remote]);

  if (remote || (suggestions.length === 0 && !error)) return null;

  function beginEdit(suggestion: MemorySkillSuggestion) {
    setError(false);
    setEditingId(suggestion.id);
    setDraft({
      name: suggestion.name,
      description: suggestion.description,
      body: suggestion.body,
    });
  }

  function handleEditEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setEditingId(null);
  }

  async function decide(suggestion: MemorySkillSuggestion, decision: "approve" | "dismiss") {
    if (pendingIds.has(suggestion.id)) return;
    const editing = editingId === suggestion.id;
    const name = editing ? draft.name.trim() : suggestion.name;
    if (decision === "approve" && !isValidSkillName(name)) return;
    setError(false);
    setPendingIds((current) => new Set(current).add(suggestion.id));
    try {
      await readBridge().memoryCommand({
        action: "suggestion",
        id: suggestion.id,
        decision,
        name,
        description: editing ? draft.description : suggestion.description,
        body: editing ? draft.body : suggestion.body,
        scope: suggestion.scope,
        availability: suggestion.availability,
        ...(suggestion.projectId ? { projectId: suggestion.projectId } : {}),
      });
      setEditingId((current) => (current === suggestion.id ? null : current));
      setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
      if (decision === "approve") props.onApproved?.();
    } catch {
      setError(true);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(suggestion.id);
        return next;
      });
    }
  }

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium text-muted">
        <Trans>Suggestions</Trans>
      </p>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          <Trans>Couldn't update the skill.</Trans>
        </p>
      ) : null}
      {suggestions.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
          {suggestions.map((suggestion) => {
            const busy = pendingIds.has(suggestion.id);
            const editing = editingId === suggestion.id;
            return (
              <div
                key={suggestion.id}
                className="flex flex-col gap-2 border-b border-[var(--hairline)] px-3 py-2 last:border-b-0 sm:flex-row sm:items-start sm:gap-3"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1 space-y-1">
                    {editing ? (
                      <>
                        <input
                          data-overlay-escape-owner=""
                          aria-label={t`Name`}
                          className="w-full rounded-lg border border-[var(--hairline)] bg-transparent px-2 py-1 text-sm"
                          value={draft.name}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, name: event.target.value }))
                          }
                          onKeyDown={handleEditEscape}
                        />
                        <input
                          data-overlay-escape-owner=""
                          aria-label={t`Description`}
                          className="w-full rounded-lg border border-[var(--hairline)] bg-transparent px-2 py-1 text-xs"
                          value={draft.description}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, description: event.target.value }))
                          }
                          onKeyDown={handleEditEscape}
                        />
                        <textarea
                          data-overlay-escape-owner=""
                          aria-label={t`Skill instructions`}
                          className="max-h-40 w-full rounded-lg border border-[var(--hairline)] bg-transparent px-2 py-1 font-mono text-xs"
                          rows={6}
                          value={draft.body}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, body: event.target.value }))
                          }
                          onKeyDown={handleEditEscape}
                        />
                      </>
                    ) : (
                      <>
                        <p className="break-words text-sm font-medium text-foreground">
                          {suggestion.name}
                        </p>
                        <p className="break-words text-xs text-muted">{suggestion.description}</p>
                      </>
                    )}
                    <p className="break-words text-xs text-muted">{suggestion.why}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {editing ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={busy}
                      onPress={() => setEditingId(null)}
                    >
                      {t`Cancel`}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={busy}
                      onPress={() => beginEdit(suggestion)}
                    >
                      {t`Edit`}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={busy || (editing && !isValidSkillName(draft.name.trim()))}
                    onPress={() => void decide(suggestion, "approve")}
                  >
                    {t`Approve`}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={busy}
                    onPress={() => void decide(suggestion, "dismiss")}
                  >
                    {t`Dismiss`}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
