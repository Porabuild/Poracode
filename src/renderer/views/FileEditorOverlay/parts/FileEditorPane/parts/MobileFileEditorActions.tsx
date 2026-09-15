import { Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Code, Eye, Save } from "lucide-react";
import { MobilePageBottomAction } from "@/renderer/components/layout/MobilePageBottomActions";
import { MobilePageHeaderActions } from "@/renderer/components/layout/MobilePageHeaderActions";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";

/** Compact editor controls hosted by the shared page header and bottom action bar. */
export function MobileFileEditorActions(props: {
  isDirty: boolean;
  isMarkdown: boolean;
  showPreview: boolean;
  onSave: () => void;
  onTogglePreview: () => void;
}) {
  const { t } = useLingui();

  return (
    <>
      <MobilePageHeaderActions>
        <Tooltip delay={200}>
          <Tooltip.Trigger>
            <MobileCircleButton
              aria-label={t`Save`}
              className="text-muted"
              isDisabled={!props.isDirty}
              onPress={props.onSave}
            >
              <Save className="size-4" />
            </MobileCircleButton>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">
            <Trans>Save</Trans>
          </Tooltip.Content>
        </Tooltip>
      </MobilePageHeaderActions>

      {props.isMarkdown ? (
        <MobilePageBottomAction side="left">
          <Tooltip delay={200}>
            <Tooltip.Trigger>
              <MobileCircleButton
                aria-label={props.showPreview ? t`Show source` : t`Show preview`}
                className="text-muted"
                onPress={props.onTogglePreview}
              >
                {props.showPreview ? <Code className="size-4" /> : <Eye className="size-4" />}
              </MobileCircleButton>
            </Tooltip.Trigger>
            <Tooltip.Content placement="top">
              {props.showPreview ? <Trans>Show source</Trans> : <Trans>Show preview</Trans>}
            </Tooltip.Content>
          </Tooltip>
        </MobilePageBottomAction>
      ) : null}
    </>
  );
}
