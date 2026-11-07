import type { ReactNode } from "react";
import { ChevronDown, FolderGit2, GitBranch, GitFork, MessageSquarePlus } from "lucide-react";
import { Button, Description, Dropdown, Label, Tooltip } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common";
import {
  usePrCheckout,
  type CheckoutAvailability,
  type CheckoutBlockReason,
} from "./usePrCheckout";

const BLOCK_REASON_MESSAGES: Record<CheckoutBlockReason, MessageDescriptor> = {
  "cross-repository": msg`Cross-repository pull requests cannot be checked out here`,
  "read-only": msg`Checkout is unavailable while this review is read-only`,
  unreachable: msg`The server hosting this project is unreachable`,
  "no-head-branch": msg`This pull request has no head branch to check out`,
  "worktree-exists": msg`A worktree for this branch already exists`,
  "checked-out-in-worktree": msg`This branch is already checked out in a worktree`,
  "already-current": msg`This branch is already checked out in the repository`,
  "status-unknown": msg`The repository status is not available yet`,
  dirty: msg`Commit or stash your uncommitted changes first`,
};

type Translate = (descriptor: MessageDescriptor) => string;

function reasonText(availability: CheckoutAvailability, translate: Translate): string | undefined {
  return availability.enabled ? undefined : translate(BLOCK_REASON_MESSAGES[availability.reason]);
}

/** One menu row; an unavailable row says why, in the row and in a tooltip. */
export interface CheckoutMenuItem {
  id: string;
  icon: ReactNode;
  label: string;
  reason: string | undefined;
}

function checkoutItem(props: CheckoutMenuItem) {
  const content = (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex items-center gap-2">
        {props.icon}
        <Label>{props.label}</Label>
      </div>
      {props.reason ? (
        <Description className="text-[11px] text-muted">{props.reason}</Description>
      ) : null}
    </div>
  );
  return (
    <Dropdown.Item
      key={props.id}
      id={props.id}
      textValue={props.label}
      isDisabled={props.reason !== undefined}
    >
      {props.reason ? (
        <Tooltip delay={300}>
          <Tooltip.Trigger className="block min-w-0">{content}</Tooltip.Trigger>
          <Tooltip.Content placement="left">{props.reason}</Tooltip.Content>
        </Tooltip>
      ) : (
        content
      )}
    </Dropdown.Item>
  );
}

/** What the checkout menu offers right now, shared by the desktop button and the compact menu. */
export function usePrCheckoutMenu() {
  const { t, i18n } = useLingui();
  const checkout = usePrCheckout();
  const { availability } = checkout;
  const icon = "size-3.5 shrink-0";
  const translate: Translate = (descriptor) => i18n._(descriptor);
  const items: CheckoutMenuItem[] = [
    ...(availability.existingWorktree
      ? [
          {
            id: "open-existing",
            icon: <FolderGit2 className={icon} aria-hidden />,
            label: t`Open existing worktree`,
            reason: reasonText(availability.openExisting, translate),
          },
        ]
      : []),
    {
      id: "new-worktree",
      icon: <GitFork className={icon} aria-hidden />,
      label: t`Check out in a new worktree`,
      reason: reasonText(availability.newWorktree, translate),
    },
    {
      id: "repository",
      icon: <GitBranch className={icon} aria-hidden />,
      label: t`Check out in this repository`,
      reason: reasonText(availability.inRepository, translate),
    },
    ...(checkout.canOpenInApp
      ? [
          {
            id: "open-app",
            icon: <MessageSquarePlus className={icon} aria-hidden />,
            label: t`Start a thread in this worktree`,
            reason: undefined,
          },
        ]
      : []),
  ];
  function run(key: string) {
    if (key === "open-existing") checkout.openExistingWorktree();
    else if (key === "new-worktree") void checkout.checkoutInNewWorktree();
    else if (key === "repository") void checkout.checkoutInRepository();
    else if (key === "open-app") checkout.openWorktreeInApp();
  }
  return {
    /** `false` when the review has no project to check out into. */
    available: checkout.project !== undefined,
    busy: checkout.busy !== null,
    items,
    run,
  };
}

/** The menu rows of `usePrCheckoutMenu`; an unavailable row says why. */
export function checkoutMenuItems(items: readonly CheckoutMenuItem[]) {
  return items.map((item) => checkoutItem(item));
}

/**
 * Where to work on the open review: an existing worktree, a fresh one, or the
 * project's own checkout. Everything is disabled for pull requests from a fork
 * and while the review is read-only.
 */
export function PrCheckoutMenu() {
  const { t } = useLingui();
  const menu = usePrCheckoutMenu();
  if (!menu.available) return null;

  return (
    <Dropdown>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted hover:text-foreground"
        isDisabled={menu.busy}
        isPending={menu.busy}
        aria-label={t`Check out`}
      >
        {({ isPending }) => (
          <>
            {isPending ? <PixelLoader size="xs" /> : <GitBranch className="size-3.5" />}
            {t`Check out`}
            <ChevronDown className="size-3" aria-hidden />
          </>
        )}
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu aria-label={t`Check out`} onAction={(key) => menu.run(String(key))}>
          {checkoutMenuItems(menu.items)}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
