import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { FolderPlus, Wifi } from "lucide-react";
import { EmptyState } from "./components";

export type MobileSetupKind = "desktop" | "project";

export function MobileSetupEmptyState(props: {
  readonly kind: MobileSetupKind;
  readonly onAction?: (kind: MobileSetupKind) => void;
}) {
  const { t } = useLingui();
  const isDesktop = props.kind === "desktop";
  return (
    <EmptyState
      icon={isDesktop ? <Wifi className="size-5" /> : <FolderPlus className="size-5" />}
      title={isDesktop ? t`Connect desktop` : t`Add a project`}
      hint={
        isDesktop
          ? t`Connect Poracode on your desktop before starting a thread.`
          : t`Projects live on the connected desktop. Add one before starting a thread.`
      }
      {...(props.onAction
        ? {
            action: (
              <Button size="sm" variant="ghost" onPress={() => props.onAction?.(props.kind)}>
                {isDesktop ? t`Connect` : t`Add project`}
              </Button>
            ),
          }
        : {})}
    />
  );
}
