import { useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Sparkles } from "lucide-react";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common";
import { isValidSkillName } from "@/shared/contracts/skill";
import type { MemorySkillSuggestion } from "@/shared/memory";

export function MemorySkillSuggestions(props: { projectId?: string }) {
  const { t } = useLingui();
  const remote = isRemoteSession();
  const [suggestions, setSuggestions] = useState<MemorySkillSuggestion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "", body: "" });

  useEffect(() => {
    if (remote) return;
    let active = true;
    void readBridge()
      .memoryCommand({
        action: "suggestions",
        ...(props.projectId ? { projectId: props.projectId } : {}),
      })
      .then((next) => {
        if (active) setSuggestions(next as MemorySkillSuggestion[]);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [props.projectId, remote]);

  if (remote || suggestions.length === 0) return null;

  function beginEdit(suggestion: MemorySkillSuggestion) {
    setEditingId(suggestion.id);
    setDraft({
      name: suggestion.name,
      description: suggestion.description,
      body: suggestion.body,
    });
  }

  async function decide(suggestion: MemorySkillSuggestion, decision: "approve" | "dismiss") {
    const editing = editingId === suggestion.id;
    const name = editing ? draft.name.trim() : suggestion.name;
    if (decision === "approve" && !isValidSkillName(name)) return;
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
    } catch {
      return;
    }
  }

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium text-muted">
        <Trans>Suggestions</Trans>
      </p>
      <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="flex items-start gap-3 border-b border-[var(--hairline)] px-3 py-2 last:border-b-0"
          >
            <Sparkles className="size-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1 space-y-1">
              {editingId === suggestion.id ? (
                <>
                  <input
                    aria-label={t`Name`}
                    className="w-full rounded-lg border border-[var(--hairline)] bg-transparent px-2 py-1 text-sm"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                  <input
                    aria-label={t`Description`}
                    className="w-full rounded-lg border border-[var(--hairline)] bg-transparent px-2 py-1 text-xs"
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                  <textarea
                    aria-label={suggestion.name}
                    className="max-h-40 w-full rounded-lg border border-[var(--hairline)] bg-transparent px-2 py-1 font-mono text-xs"
                    rows={6}
                    value={draft.body}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, body: event.target.value }))
                    }
                  />
                </>
              ) : (
                <>
                  <p className="truncate text-sm font-medium text-foreground">{suggestion.name}</p>
                  <p className="truncate text-xs text-muted">{suggestion.description}</p>
                </>
              )}
              <p className="truncate text-xs text-muted">{suggestion.why}</p>
            </div>
            <Button size="sm" variant="ghost" onPress={() => beginEdit(suggestion)}>
              {t`Edit`}
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              isDisabled={editingId === suggestion.id && !isValidSkillName(draft.name.trim())}
              onPress={() => void decide(suggestion, "approve")}
            >
              {t`Approve`}
            </Button>
            <Button size="sm" variant="ghost" onPress={() => void decide(suggestion, "dismiss")}>
              {t`Dismiss`}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
