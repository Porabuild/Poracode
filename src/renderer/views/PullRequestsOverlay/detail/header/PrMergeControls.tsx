import { useState } from "react";
import { ChevronDown, GitMerge } from "lucide-react";
import { Button, Dropdown, Label, Popover } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PrMergeMethod } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common";
import { MergeMethodLabel, PrMergeConfirm } from "./PrMergeConfirm";
import { MERGE_METHODS, usePrMergeFlow } from "./usePrMergeFlow";

/**
 * Merge as a menu button, built like "Check out": choosing a method (the
 * preferred one first) asks for confirmation, because merging is not undoable.
 * A blocked review stays disabled unless the host offers an admin bypass and it
 * is switched on.
 */
export function PrMergeControls() {
  const { t } = useLingui();
  const flow = usePrMergeFlow();
  const [menuOpen, setMenuOpen] = useState(false);
  const { mergeMethods, preferredMethod } = flow.readiness;
  const ordered = [preferredMethod, ...MERGE_METHODS.filter((key) => key !== preferredMethod)];

  return (
    <Popover isOpen={flow.method !== null} onOpenChange={(open) => !open && flow.dismiss()}>
      <Popover.Trigger>
        <Dropdown isOpen={menuOpen} onOpenChange={setMenuOpen}>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted hover:text-foreground"
            isDisabled={flow.triggerDisabled}
            isPending={flow.merging}
            aria-label={t`Merge`}
          >
            {({ isPending }) => (
              <>
                {isPending ? <PixelLoader size="xs" /> : <GitMerge className="size-3.5" />}
                <Trans>Merge</Trans>
                <ChevronDown className="size-3" aria-hidden />
              </>
            )}
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              aria-label={t`Merge method`}
              disabledKeys={MERGE_METHODS.filter((key) => !mergeMethods.includes(key))}
              onAction={(key) => {
                // Close the menu so it doesn't linger over the confirmation.
                setMenuOpen(false);
                flow.ask(key as PrMergeMethod);
              }}
            >
              {ordered.map((key) => (
                <Dropdown.Item key={key} id={key} textValue={key}>
                  <Label>
                    <MergeMethodLabel method={key} />
                  </Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="w-72">
        <Popover.Dialog>
          <PrMergeConfirm flow={flow} heading={Popover.Heading} />
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
