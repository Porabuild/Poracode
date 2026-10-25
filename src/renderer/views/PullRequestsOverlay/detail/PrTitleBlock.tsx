import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button, Input, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { usePrTitle } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { PrEditSheet } from "../parts/PrEditSheet";
import { usePrDetailNav } from "./prDetailNav";
import { usePrDetailScope } from "./prDetailScope";
import { PrMetaLine } from "./PrMetaLine";
import { PrReadOnlyNotice } from "./PrReadOnlyNotice";
import { usePrBehindBase } from "./usePrBehindBase";
import { usePrTitleEditable } from "./usePrTitleEditable";

/**
 * Title, authorship line (author, age, head → base, size) and the behind-base
 * warning. On the compact page the title lives in the page header (the more menu
 * starts renaming, which shows the field here), the block scrolls with the review,
 * its action is a small text control (not a 44px pill), and the read-only note is
 * a quiet line under the authorship instead of a row of its own.
 */
export function PrTitleBlock() {
  const { t } = useLingui();
  const compact = useCompactLayout();
  const scope = usePrDetailScope();
  const details = useGitStore((s) => s.prDetails[scope.cacheKey]);
  const rowTitle = usePrTitle(scope.prKey);
  const behind = usePrBehindBase();
  const nav = usePrDetailNav();
  const editing = nav.titleEditing;
  const setEditing = nav.setTitleEditing;
  const [draftTitle, setDraftTitle] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  const title = details?.title || rowTitle || "";
  // Editing can start from outside (the compact menu): seed the field once, then focus it.
  const [seededFor, setSeededFor] = useState(false);
  if (editing && !seededFor) {
    setSeededFor(true);
    setDraftTitle(title);
  } else if (!editing && seededFor) {
    setSeededFor(false);
  }
  useEffect(() => {
    if (editing) titleInput.current?.focus();
  }, [editing]);
  const canEdit = usePrTitleEditable();
  const saving = scope.actions.pendingAction === "edit";

  function save() {
    const next = draftTitle.trim();
    if (!next || !details || scope.readOnly || !canEdit) return;
    if (next === title) {
      setEditing(false);
      return;
    }
    void scope.actions.handleEditPr({ title: next }).then((saved) => {
      if (saved) setEditing(false);
    });
  }
  function startEditing() {
    setEditing(true);
  }

  return (
    <div
      className={`flex flex-col gap-2 ${
        compact ? "px-[var(--m-page-inline)] pb-3 pt-1" : "px-6 pb-3 pt-4"
      }`}
    >
      {editing && compact ? (
        <PrEditSheet
          isOpen
          label={t`Edit title`}
          fieldLabel={t`Title`}
          value={draftTitle}
          onChange={setDraftTitle}
          onCancel={() => setEditing(false)}
          onSave={save}
          saving={saving}
          saveDisabled={saving || scope.readOnly || !draftTitle.trim()}
          singleLine
          maxRows={6}
        />
      ) : editing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <TextField
            aria-label={t`Title`}
            value={draftTitle}
            onChange={setDraftTitle}
            className="min-w-0 flex-1"
          >
            <Input ref={titleInput} className="text-base font-semibold" />
          </TextField>
          <Button size="sm" variant="ghost" isDisabled={saving} onPress={() => setEditing(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            size="sm"
            variant="primary"
            type="submit"
            isPending={saving}
            isDisabled={saving || scope.readOnly || !draftTitle.trim()}
          >
            <Trans>Save</Trans>
          </Button>
        </form>
      ) : compact ? null : (
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-balance text-xl font-semibold leading-snug text-foreground">
            {title || <span className="text-muted">#{scope.prNumber}</span>}
            <span className="ml-2 font-mono text-base font-normal text-muted">
              #{scope.prNumber}
            </span>
          </h1>
          {canEdit ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t`Edit title`}
              onPress={startEditing}
            >
              <Pencil className="size-3.5" />
            </Button>
          ) : null}
        </div>
      )}
      {details ? <PrMetaLine details={details} /> : null}
      {compact ? <PrReadOnlyNotice className="text-[11px] text-muted/70" /> : null}
      {behind.behind ? (
        <div role="status" className="flex flex-wrap items-center gap-x-2 text-xs text-warning">
          <span>
            <Trans>This branch is behind {behind.baseBranch}.</Trans>
          </span>
          {behind.canUpdate ? (
            compact ? (
              <button
                type="button"
                className="-my-1.5 min-h-9 px-1 font-medium underline underline-offset-2 disabled:opacity-50"
                disabled={behind.disabled || behind.pending}
                onClick={behind.update}
              >
                <Trans>Update branch</Trans>
              </button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 min-h-6 px-2 text-xs"
                isDisabled={behind.disabled}
                isPending={behind.pending}
                onPress={behind.update}
              >
                <Trans>Update branch</Trans>
              </Button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
