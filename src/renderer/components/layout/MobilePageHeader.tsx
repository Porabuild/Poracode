import type { ReactNode } from "react";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChevronLeft } from "lucide-react";
import { expandSidebar } from "@/renderer/state/sidebarOverlayStore";
import { MobilePageHeaderActionsSlot } from "./MobilePageHeaderActions";

type MobilePageHeaderProps = {
  title: string;
  titleNode?: ReactNode | undefined;
  children?: ReactNode;
  trailing?: ReactNode;
  onTitleClick?: () => void;
  onBack?: (() => void) | undefined;
  backLabel?: string | undefined;
  variant: "home" | "page";
};

/** Shared compact PWA header content for both the home and inner-page shells. */
export function MobilePageHeader(props: MobilePageHeaderProps) {
  const { t } = useLingui();

  if (props.variant === "home") {
    const title = props.titleNode ?? props.title;
    return (
      <div className="poracode-mobile-header" data-variant="home">
        {props.onTitleClick ? (
          <button
            type="button"
            aria-label={props.title}
            className="poracode-mobile-header__home-title leading-none"
            onClick={props.onTitleClick}
          >
            {title}
          </button>
        ) : (
          <div className="poracode-mobile-header__home-title leading-none">{title}</div>
        )}
        <div className="poracode-mobile-header__trailing">{props.trailing}</div>
      </div>
    );
  }

  const backIncludesTitle = !props.children && !props.onTitleClick;

  return (
    <div className="poracode-mobile-header" data-variant="page">
      <Button
        isIconOnly={!backIncludesTitle}
        size="sm"
        variant="ghost"
        aria-label={props.backLabel ?? (props.onBack ? t`Return to app` : t`Back`)}
        className={`m-back min-w-0 ${
          backIncludesTitle ? "m-back--with-title shrink overflow-hidden" : "shrink-0"
        }`}
        onPress={props.onBack ?? expandSidebar}
      >
        <ChevronLeft className="size-5" />
        {backIncludesTitle ? (
          <span className="min-w-0 truncate text-left text-sm font-semibold">
            {props.titleNode ?? props.title}
          </span>
        ) : null}
      </Button>
      {props.children ? (
        props.children
      ) : props.onTitleClick ? (
        <button
          type="button"
          className="min-w-0 truncate text-left text-sm font-semibold"
          onClick={props.onTitleClick}
        >
          {props.titleNode ?? props.title}
        </button>
      ) : null}
      <MobilePageHeaderActionsSlot />
    </div>
  );
}
