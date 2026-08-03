import { useState } from "react";
import { Button, Input, Popover, toast } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { CrossagentSelectionUsageEntry } from "@/shared/settings";
import {
  crossagentSelectionUsageEntryKey,
  normalizeCrossagentTags,
} from "@/shared/crossagentRanking";
import { formatReasoningLabel } from "@/shared/modelLabels";

function entryRowKey(entry: CrossagentSelectionUsageEntry): string {
  return JSON.stringify(crossagentSelectionUsageEntryKey(entry));
}

/**
 * The learned routing memory behind the ranked order: one row per tagged
 * Crossagents selection entry. Tags can be edited (add/remove) and entries
 * removed; both round-trip through the main process because
 * `crossagentSelectionUsage` is supervisor-managed.
 */
export function CrossagentMemorySection() {
  const { t } = useLingui();
  const entries = useSharedSettings((s) => s.crossagentSelectionUsage);
  const statuses = useAgentStatusesStore((s) => s.agentStatuses);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const learned = entries
    .filter((entry) => (entry.tags?.length ?? 0) > 0)
    .toSorted((left, right) => right.lastUsedAt - left.lastUsedAt);

  function providerLabel(kind: string): string {
    return statuses.find((status) => status.kind === kind)?.label ?? kind;
  }

  async function removeEntry(entry: CrossagentSelectionUsageEntry) {
    const key = entryRowKey(entry);
    setPendingKey(key);
    try {
      const next = await readBridge().removeCrossagentMemoryEntry({
        entry: crossagentSelectionUsageEntryKey(entry),
      });
      useSharedSettings.setState({ crossagentSelectionUsage: next });
    } catch {
      toast.danger(t`Unable to remove memory entry.`);
    } finally {
      setPendingKey(null);
    }
  }

  async function retagEntry(entry: CrossagentSelectionUsageEntry, tags: string[]) {
    const key = entryRowKey(entry);
    setPendingKey(key);
    try {
      const next = await readBridge().updateCrossagentMemoryEntryTags({
        entry: crossagentSelectionUsageEntryKey(entry),
        tags,
      });
      useSharedSettings.setState({ crossagentSelectionUsage: next });
    } catch {
      toast.danger(t`Unable to update learned tags.`);
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        <Trans>Learned selections</Trans>
      </p>
      <p className="text-xs text-muted">
        <Trans>
          Explicit selections recorded from past delegations — they feed the routing order above.
          Edit the tags or remove entries to reshape it.
        </Trans>
      </p>
      {learned.length === 0 ? (
        <p className="text-xs text-muted">
          <Trans>No learned selections yet.</Trans>
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {learned.map((entry) => {
            const key = entryRowKey(entry);
            const tags = normalizeCrossagentTags(entry.tags);
            const detail = [
              entry.modelId,
              ...(entry.effort ? [formatReasoningLabel(entry.effort)] : []),
              ...(entry.fast ? [t`Fast`] : []),
            ].join(" · ");
            const busy = pendingKey === key;
            return (
              <div
                key={key}
                className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {providerLabel(entry.agentKind)}
                  </p>
                  <p className="truncate text-xs text-muted">{detail}</p>
                  <p className="truncate text-xs text-muted">
                    {tags.map((tag) => `#${tag}`).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted">
                  <Plural value={entry.count} one="# use" other="# uses" />
                </div>
                {!isRemoteSession() ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <TagEditor
                      label={providerLabel(entry.agentKind)}
                      tags={tags}
                      busy={busy}
                      onRetag={(next) => void retagEntry(entry, next)}
                    />
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={t`Remove memory entry for ${providerLabel(entry.agentKind)}`}
                      isPending={busy}
                      onPress={() => void removeEntry(entry)}
                    >
                      <Trash2 className="size-3.5 text-danger" />
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TagEditor(props: {
  label: string;
  tags: string[];
  busy: boolean;
  onRetag: (tags: string[]) => void;
}) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { tags, busy, onRetag, label } = props;

  function addTag() {
    const next = normalizeCrossagentTags([...tags, draft]);
    setDraft("");
    if (next.join("\0") !== tags.join("\0")) onRetag(next);
  }

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t`Edit tags for ${label}`}
          isDisabled={busy}
        >
          <Pencil className="size-3.5" />
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="w-72 p-0">
        <Popover.Dialog className="space-y-2 p-3">
          <p className="text-xs font-medium text-foreground">
            <Trans>Task tags</Trans>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-md border border-border bg-overlay px-1.5 py-0.5 text-[11px] text-foreground"
              >
                #{tag}
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t`Remove tag ${tag}`}
                  className="size-5 min-w-0 p-0 text-muted hover:text-foreground"
                  isDisabled={busy}
                  onPress={() => onRetag(tags.filter((candidate) => candidate !== tag))}
                >
                  <X className="size-3" />
                </Button>
              </span>
            ))}
            {tags.length === 0 ? (
              <span className="text-xs text-muted">
                <Trans>No tags — the entry stops influencing tag affinity.</Trans>
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Input
              aria-label={t`Add tag`}
              className="flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted outline-none"
              placeholder={t`Add tag...`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter" && draft.trim()) addTag();
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              isIconOnly
              aria-label={t`Add tag`}
              isDisabled={!draft.trim() || busy}
              onPress={addTag}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
