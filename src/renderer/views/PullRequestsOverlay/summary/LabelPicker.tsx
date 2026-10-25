import { useState } from "react";
import { Button, Input, TextField, toast } from "@heroui/react";
import { Check, Pencil } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PrLabel } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { PixelLoader } from "@/renderer/components/common";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { scopedReviewClient } from "@/renderer/utils/forgeReviews";
import { usePrDetailScope } from "../detail/prDetailScope";
import { PrLabelChip } from "../parts/PrLabelChip";
import { mergeLabelOptions, netLabelChange } from "./labelModel";

interface Loaded {
  labels: PrLabel[];
  truncated: boolean;
}

/**
 * A multi-select popover over the host's labels. The selection is a draft seeded
 * from the labels the review had when the popover opened. Closing the popover hands
 * `onApply` the names to add and remove relative to that starting point, so a label
 * the host changed meanwhile is not reverted. While the review cannot be written
 * (refreshing or another change in flight) the popover stays open with the draft
 * instead of discarding it, until the viewer discards it explicitly.
 */
export function LabelPicker(props: {
  current: readonly PrLabel[];
  disabled: boolean;
  onApply: (change: { add: string[]; remove: string[] }) => void;
}) {
  const { current, disabled, onApply } = props;
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const scope = usePrDetailScope();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [startedWith, setStartedWith] = useState<readonly PrLabel[]>([]);
  const [refused, setRefused] = useState(false);
  const [filter, setFilter] = useState("");

  function begin() {
    setStartedWith(current);
    setSelected(new Set(current.map((label) => label.name)));
    setRefused(false);
    setFilter("");
    setFailed(false);
    setLoaded(null);
    if (!scope.scoped) return;
    scopedReviewClient(scope.scoped)
      .labelCandidates({ projectLocation: scope.location, prNumber: scope.prNumber })
      .then((found) =>
        setLoaded({
          truncated: found.truncated,
          labels: found.labels.map((label) => ({
            name: label.name,
            ...(label.color ? { color: label.color } : {}),
            ...(label.description ? { description: label.description } : {}),
          })),
        }),
      )
      .catch((error: unknown) => {
        setFailed(true);
        toast.danger(friendlyError(error));
      });
  }

  function onOpenChange(next: boolean) {
    if (next) {
      begin();
      setOpen(true);
      return;
    }
    const change = netLabelChange(startedWith, selected);
    if (change.add.length > 0 || change.remove.length > 0) {
      if (disabled) {
        setRefused(true);
        return;
      }
      onApply(change);
    }
    setOpen(false);
  }

  function toggle(name: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  const options = mergeLabelOptions(loaded?.labels ?? [], current).filter((label) =>
    label.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <ResponsiveMenuSurface
      isOpen={open}
      onOpenChange={onOpenChange}
      label={t`Edit labels`}
      placement="bottom end"
      contentClassName="w-64 max-w-[calc(100vw-2rem)]"
      dialogClassName="p-2"
      trigger={
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t`Edit labels`}
          isDisabled={disabled}
          className="size-6 min-h-0 min-w-0 text-muted hover:text-foreground"
          onPress={() => {
            if (mobile) onOpenChange(true);
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
      }
    >
      <div className={mobile ? "px-3 pb-3" : ""}>
        {refused ? (
          <div role="alert" className="mb-2 flex flex-col gap-1.5 text-xs text-warning">
            <p>
              <Trans>
                Labels cannot be saved while the review is busy. Close this panel again to retry.
              </Trans>
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              onPress={() => {
                setRefused(false);
                setOpen(false);
              }}
            >
              <Trans>Discard changes</Trans>
            </Button>
          </div>
        ) : null}
        <TextField aria-label={t`Filter labels`} value={filter} onChange={setFilter}>
          <Input placeholder={t`Filter labels…`} className={mobile ? "text-base" : "text-xs"} />
        </TextField>
        <div className={`mt-2 overflow-y-auto ${mobile ? "max-h-[45dvh]" : "max-h-60"}`}>
          {!loaded && !failed ? (
            <div className="flex justify-center py-3">
              <PixelLoader size="xs" />
            </div>
          ) : options.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted">
              <Trans>No matching labels.</Trans>
            </p>
          ) : (
            <ul aria-label={t`Labels`} className="flex flex-col">
              {options.map((label) => {
                const checked = selected.has(label.name);
                return (
                  <li key={label.name}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left hover:bg-default-100 ${
                        mobile ? "min-h-11 text-sm" : "py-1.5 text-xs"
                      }`}
                      onClick={() => toggle(label.name)}
                    >
                      <span className="size-4 shrink-0" aria-hidden>
                        {checked ? <Check className="size-4" /> : null}
                      </span>
                      <PrLabelChip label={label} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {loaded?.truncated ? (
            <p className="px-2 pt-1 text-[11px] text-muted">
              <Trans>The host has more labels than are listed here.</Trans>
            </p>
          ) : null}
        </div>
        {mobile ? (
          <Button variant="primary" className="mt-3 w-full" onPress={() => onOpenChange(false)}>
            <Trans>Done</Trans>
          </Button>
        ) : null}
      </div>
    </ResponsiveMenuSurface>
  );
}
