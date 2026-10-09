import { Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";
import type { ProviderSessionMenuAction } from "../providers/providerSessionControls";

/** The provider supplies the inventory and behavior; this surface only lays out menu rows. */
export function ComposerSessionActionsMenu(props: {
  actions: readonly ProviderSessionMenuAction[];
  mobile?: boolean;
  onBack?: () => void;
  onSelected: () => void;
}) {
  const { t } = useLingui();
  const select = (action: ProviderSessionMenuAction) => {
    props.onSelected();
    action.onAction();
  };
  if (props.mobile) {
    return (
      <div className="m-sheet-list">
        <button
          type="button"
          className="m-sheet-action"
          aria-label={t`Back`}
          onClick={props.onBack}
        >
          <ChevronLeft className="size-4 text-muted" />
          <span className="flex-1 truncate font-medium">
            <Trans>Session actions</Trans>
          </span>
        </button>
        {props.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="m-sheet-action"
            disabled={action.isDisabled}
            onClick={() => select(action)}
          >
            <action.icon className="size-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{action.label}</span>
              {action.detail ? (
                <span className="block text-xs text-muted">{action.detail}</span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <Dropdown.SubmenuTrigger>
      <Dropdown.Item id="session-actions" textValue={t`Session actions`}>
        <SlidersHorizontal className="size-4 text-muted" />
        <Label className="flex-1 truncate">
          <Trans>Session actions</Trans>
        </Label>
        <Dropdown.SubmenuIndicator />
      </Dropdown.Item>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label={t`Session actions`}
          className="poracode-menu min-w-52"
          selectionMode="none"
        >
          {props.actions.map((action) => (
            <Dropdown.Item
              key={action.id}
              id={action.id}
              textValue={action.label}
              isDisabled={action.isDisabled}
              onAction={() => select(action)}
            >
              <action.icon className="size-4 shrink-0 text-muted" />
              <Label className="min-w-0 flex-1">
                <span className="block truncate">{action.label}</span>
                {action.detail ? (
                  <span className="block max-w-64 whitespace-normal text-xs text-muted">
                    {action.detail}
                  </span>
                ) : null}
              </Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.SubmenuTrigger>
  );
}
