import { useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { TextArea } from "@/renderer/components/common/TextArea";
import { ItemMarkdown } from "@/renderer/components/thread/ChatPane/parts/items/ItemMarkdown";

export type SavePrComment = (body: string, expectedBody: string) => Promise<boolean>;

export function PrCommentBody(props: { body: string; disabled: boolean; onSave?: SavePrComment }) {
  const { body, disabled, onSave } = props;
  const { t } = useLingui();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [expectedBody, setExpectedBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!onSave || disabled || saving || !draft.trim()) return;
    setSaving(true);
    try {
      if (await onSave(draft, expectedBody)) setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-3 py-2 text-xs">
      {editing && onSave ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <TextArea
            aria-label={t`Edit comment`}
            value={draft}
            disabled={disabled || saving}
            onChange={(event) => setDraft(event.target.value)}
            autoSize
            maxRows={12}
            className="text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" isDisabled={saving} onPress={() => setEditing(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              size="sm"
              variant="primary"
              type="submit"
              isDisabled={disabled || saving || !draft.trim()}
              isPending={saving}
            >
              <Trans>Save</Trans>
            </Button>
          </div>
        </form>
      ) : (
        <>
          <ItemMarkdown text={body} />
          {onSave && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 min-h-0 px-2 text-[11px] font-medium text-muted hover:text-foreground"
                aria-label={t`Edit comment`}
                isDisabled={disabled}
                onPress={() => {
                  setDraft(body);
                  setExpectedBody(body);
                  setEditing(true);
                }}
              >
                <Trans>Edit</Trans>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
