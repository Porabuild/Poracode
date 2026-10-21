import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button, Input, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { TextArea } from "@/renderer/components/common/TextArea";
import { useGitStore } from "@/renderer/state/gitStore";
import { ItemMarkdown } from "@/renderer/components/thread/ChatPane/parts/items/ItemMarkdown";

/** Centred tab pill + collapsible review description, editable where the host allows it. */
export function PrHeaderCard(props: {
  cacheKey: string;
  /** Tab pill rendered centred above the description. */
  tabsPill?: ReactNode;
  canEdit?: boolean;
  saving?: boolean;
  onSave?: (title: string, body: string) => Promise<boolean>;
}) {
  const { cacheKey, tabsPill, canEdit = false, saving = false, onSave } = props;
  const { t } = useLingui();
  const details = useGitStore((state) => state.prDetails[cacheKey]);
  const [bodyExpanded, setBodyExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const savedBody = details?.body?.trim() ?? "";
  const hasBody = savedBody.length > 0;
  if (!tabsPill && !hasBody && !canEdit && !editing) return null;

  function beginEdit() {
    setTitle(details?.title ?? "");
    setBody(details?.body ?? "");
    setEditing(true);
    setBodyExpanded(true);
  }

  return (
    <div className="flex flex-col gap-2 px-6 py-2">
      {tabsPill && <div className="flex justify-center">{tabsPill}</div>}
      {(hasBody || canEdit || editing) && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex w-fit cursor-default items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-foreground"
              onClick={() => setBodyExpanded((value) => !value)}
            >
              {bodyExpanded ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              <Trans>Description</Trans>
            </button>
            {canEdit && !editing && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 min-h-0 px-2 text-[11px] font-medium text-muted hover:text-foreground"
                onPress={beginEdit}
              >
                <Trans>Edit</Trans>
              </Button>
            )}
          </div>
          {bodyExpanded && editing && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!title.trim() || !onSave) return;
                void onSave(title, body).then((saved) => {
                  if (saved) setEditing(false);
                });
              }}
            >
              <TextField aria-label={t`Title`} value={title} onChange={setTitle} isRequired>
                <Input placeholder={t`Title`} className="text-xs" />
              </TextField>
              <TextArea
                aria-label={t`Description`}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={6}
                className="text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={saving}
                  onPress={() => setEditing(false)}
                >
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  type="submit"
                  isDisabled={saving || !title.trim()}
                  isPending={saving}
                >
                  <Trans>Save</Trans>
                </Button>
              </div>
            </form>
          )}
          {bodyExpanded && !editing && (
            <div className="max-h-60 overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-surface-tertiary/30 px-4 py-3 text-xs">
              {hasBody ? <ItemMarkdown text={savedBody} /> : <Trans>No description</Trans>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
