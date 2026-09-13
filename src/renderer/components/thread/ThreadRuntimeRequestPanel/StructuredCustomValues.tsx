import { useState } from "react";
import { Button, Input } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";

export function StructuredCustomValues(props: {
  values: string[];
  isDisabled: boolean;
  /** True when the parent field already has maxItems selected (enum + custom). */
  atLimit?: boolean;
  onChange: (values: string[]) => void;
}) {
  const { values, isDisabled, atLimit = false, onChange } = props;
  const { t } = useLingui();
  const [draft, setDraft] = useState("");
  function add() {
    const value = draft.trim();
    if (isDisabled || atLimit || !value) return;
    if (!values.includes(value)) onChange([...values, value]);
    setDraft("");
  }
  return (
    <div className="space-y-1">
      {values.map((value) => (
        <div key={value} className="flex min-w-0 items-center justify-between gap-2 text-xs">
          <span className="min-w-0 flex-1 break-all">{value}</span>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={isDisabled}
            aria-label={t`Remove ${value}`}
            onPress={() => onChange(values.filter((entry) => entry !== value))}
          >
            <Trans>Remove</Trans>
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <Input
          aria-label={t`Other`}
          placeholder={t`Other`}
          value={draft}
          disabled={isDisabled || atLimit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              add();
            }
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          isDisabled={isDisabled || atLimit || !draft.trim()}
          onPress={add}
        >
          <Trans>Add</Trans>
        </Button>
      </div>
    </div>
  );
}
