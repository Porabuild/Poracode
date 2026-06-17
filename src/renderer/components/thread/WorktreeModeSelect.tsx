import { useState } from "react";
import { Check, ChevronDown, GitBranch, GitFork } from "lucide-react";
import { Label, ListBox, Popover } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common";

export type WorktreeMode = "none" | "new" | "new-with-changes";

interface WorktreeModeOption {
  id: WorktreeMode;
  label: string;
  description: string;
  icon: typeof GitFork;
}

export function WorktreeModeSelect(props: {
  mode: WorktreeMode;
  /** Whether to offer the "carry uncommitted changes" variant. */
  canBringChanges: boolean;
  onChange: (mode: WorktreeMode) => void;
  isDisabled?: boolean;
  /** Render a shorter trigger for secondary control rows. */
  compact?: boolean;
}) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const iconSize = props.compact ? "size-3" : "size-3.5";

  const options: WorktreeModeOption[] = [
    {
      id: "none",
      label: t`No worktree`,
      description: t`Work in the current checkout`,
      icon: GitBranch,
    },
    {
      id: "new",
      label: t`Worktree`,
      description: t`Run in a separate worktree`,
      icon: GitFork,
    },
    ...(props.canBringChanges
      ? [
          {
            id: "new-with-changes" as const,
            label: t`Worktree + changes`,
            description: t`Copy uncommitted changes here (keeps them on this branch)`,
            icon: GitFork,
          },
        ]
      : []),
  ];

  const selected = options.find((option) => option.id === props.mode) ?? options[0]!;
  const SelectedIcon = selected.icon;

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger className="flex min-w-0 items-center">
        <Button
          aria-label={t`Worktree mode`}
          isDisabled={props.isDisabled ?? false}
          size="sm"
          variant="ghost"
          className={`lightcode-composer-menu min-w-0 max-w-56 ${
            props.compact ? "lightcode-composer-menu--compact px-2" : "px-2.5"
          }`}
        >
          <SelectedIcon className={`${iconSize} text-muted`} />
          <span className="truncate">{selected.label}</span>
          <ChevronDown className={`${iconSize} text-muted`} />
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="top" className="w-64 p-0">
        <Popover.Dialog className="!p-0 !py-1">
          <ListBox
            aria-label={t`Worktree mode`}
            className="lightcode-menu"
            selectionMode="none"
            onAction={(key) => {
              props.onChange(key as WorktreeMode);
              setIsOpen(false);
            }}
          >
            {options.map((option) => {
              const OptionIcon = option.icon;
              return (
                <ListBox.Item
                  key={option.id}
                  id={option.id}
                  textValue={option.label}
                  className="focus-visible:outline-none"
                >
                  <OptionIcon className="size-3.5 shrink-0 text-muted" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Label className="truncate">{option.label}</Label>
                    <span className="truncate text-xs text-muted">{option.description}</span>
                  </div>
                  {option.id === props.mode ? (
                    <Check className="size-3.5 shrink-0 text-foreground" />
                  ) : null}
                </ListBox.Item>
              );
            })}
          </ListBox>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
