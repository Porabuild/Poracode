import {
  BookOpen,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Workflow,
} from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { usePrCheckoutMenu } from "../detail/header/PrCheckoutMenu";
import { usePrLinkActions } from "../detail/header/usePrLinkActions";
import { usePrStateChange } from "../detail/header/usePrStateChange";
import { usePrDetailNav } from "../detail/prDetailNav";
import { usePrDetailScope } from "../detail/prDetailScope";
import { usePrTitleEditable } from "../detail/usePrTitleEditable";
import { PrResponsiveMenu, type PrMenuSection } from "../parts/PrResponsiveMenu";

const ICON = "size-4";

/**
 * The compact header's one "more" button: a bottom sheet (the app's compact menu
 * convention) holding every review action the desktop header spreads over its state
 * pill, checkout button and icons, grouped as state, check out, share and other.
 */
export function PrCompactMenu(props: { onOpenAutomation?: (() => void) | undefined }) {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const nav = usePrDetailNav();
  const change = usePrStateChange();
  const checkout = usePrCheckoutMenu();
  const links = usePrLinkActions();
  const canEditTitle = usePrTitleEditable();

  const sections: PrMenuSection[] = [
    {
      id: "state",
      title: t`State`,
      items: change.canChange
        ? change.items.map((item) => ({
            id: `state:${item.id}`,
            label: item.label,
            danger: item.danger === true,
            disabled: change.busy,
            onSelect: () => change.run(item.id),
          }))
        : [],
    },
    {
      id: "checkout",
      title: t`Check out`,
      items: checkout.available
        ? checkout.items.map((item) => ({
            id: item.id,
            label: item.label,
            icon: item.icon,
            reason: item.reason,
            disabled: checkout.busy,
            onSelect: () => checkout.run(item.id),
          }))
        : [],
    },
    {
      id: "share",
      title: t`Share`,
      items: [
        {
          id: "copy-link",
          label: t`Copy link`,
          icon: <Copy className={ICON} />,
          disabled: !links.url,
          onSelect: links.copyLink,
        },
        { id: "copy-number", label: t`Copy number`, onSelect: links.copyNumber },
        {
          id: "open-external",
          label: t`Open on source host`,
          icon: <ExternalLink className={ICON} />,
          disabled: !links.url,
          onSelect: links.openExternal,
        },
      ],
    },
    {
      id: "other",
      title: t`Other`,
      items: [
        ...(canEditTitle
          ? [
              {
                id: "edit-title",
                label: t`Edit title`,
                icon: <Pencil className={ICON} />,
                onSelect: () => nav.setTitleEditing(true),
              },
            ]
          : []),
        {
          id: "refresh",
          label: t`Refresh`,
          icon: <RefreshCw className={`${ICON} ${scope.loading ? "animate-spin" : ""}`} />,
          onSelect: scope.reload,
        },
        ...(scope.scoped?.capabilities.reviewGuides
          ? [
              {
                id: "guide",
                label: t`Review guide`,
                icon: <BookOpen className={ICON} />,
                onSelect: () => nav.setTab("guide"),
              },
            ]
          : []),
        ...(props.onOpenAutomation
          ? [
              {
                id: "automation",
                label: t`PR automation`,
                icon: <Workflow className={ICON} />,
                onSelect: () => props.onOpenAutomation?.(),
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <PrResponsiveMenu
      label={t`More actions`}
      sections={sections}
      trigger={
        <MobileCircleButton aria-label={t`More actions`}>
          <MoreHorizontal className={ICON} />
        </MobileCircleButton>
      }
    />
  );
}
