import { useState } from "react";
import { Button } from "@heroui/react";
import { Pencil } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { TextArea } from "@/renderer/components/common";
import { ItemMarkdown } from "@/renderer/components/thread/ChatPane/parts/items/ItemMarkdown";
import { useGitStore } from "@/renderer/state/gitStore";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { usePrDetailScope } from "../detail/prDetailScope";
import { PrEditSheet } from "../parts/PrEditSheet";
import { PrReactionAdd, PrReactionChips } from "../parts/PrReactions";
import { useSubjectReactions } from "./SubjectReactions";

/**
 * The review description with its reactions. The body alone is edited here; the
 * title has its own editor in the title block. A save sends only the body, with the
 * text the editor started from so a newer description on the host is never overwritten.
 */
export function DescriptionCard() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const compact = useCompactLayout();
  const body = useGitStore((s) => s.prDetails[scope.cacheKey]?.body);
  const reactions = useGitStore((s) => s.prDetails[scope.cacheKey]?.reactions);
  const subject = useSubjectReactions({ reactions });
  const hasReactions = reactions?.some((reaction) => reaction.count > 0) === true;
  const [draft, setDraft] = useState<string | null>(null);
  /** The description the open editor started from; the host refuses the save if it moved. */
  const [startedFrom, setStartedFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = scope.scoped?.capabilities.edit === true && !scope.readOnly;
  const saved = body?.trim() ?? "";

  async function save() {
    if (draft === null || body === undefined || scope.readOnly || saving) return;
    setSaving(true);
    try {
      if (await scope.actions.handleEditPr({ body: draft, expectedBody: startedFrom }))
        setDraft(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={t`Description`}
      className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-surface-tertiary/30"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)] bg-foreground/[0.03] px-3 py-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          <Trans>Description</Trans>
        </h3>
        <span className="ml-auto flex items-center gap-1">
          {draft === null || compact ? <PrReactionAdd {...subject} /> : null}
          {canEdit && draft === null ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-h-0 gap-1 px-2 text-[11px] font-medium text-muted hover:text-foreground"
              aria-label={t`Edit description`}
              onPress={() => {
                setStartedFrom(body ?? "");
                setDraft(body ?? "");
              }}
            >
              <Pencil className="size-3" />
              <Trans>Edit</Trans>
            </Button>
          ) : null}
        </span>
      </div>
      <div className="px-4 py-3 text-xs">
        {draft !== null && !compact ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <TextArea
              aria-label={t`Description`}
              value={draft}
              disabled={saving || scope.readOnly}
              onChange={(event) => setDraft(event.target.value)}
              autoSize
              maxRows={20}
              className="min-h-24 text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" isDisabled={saving} onPress={() => setDraft(null)}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                size="sm"
                variant="primary"
                type="submit"
                isDisabled={saving || scope.readOnly || body === undefined}
                isPending={saving}
              >
                <Trans>Save</Trans>
              </Button>
            </div>
          </form>
        ) : saved ? (
          <ItemMarkdown text={saved} />
        ) : (
          <p className="text-muted">
            <Trans>No description provided</Trans>
          </p>
        )}
      </div>
      {(draft === null || compact) && hasReactions ? (
        <div className="px-4 pb-3">
          <PrReactionChips {...subject} />
        </div>
      ) : null}
      {compact && draft !== null ? (
        <PrEditSheet
          isOpen
          label={t`Edit description`}
          fieldLabel={t`Description`}
          value={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => void save()}
          saving={saving}
          saveDisabled={saving || scope.readOnly || body === undefined}
          maxRows={14}
        />
      ) : null}
    </section>
  );
}
