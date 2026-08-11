import { Switch } from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";

type ToggleSwitchBaseProps = Omit<
  ComponentProps<typeof Switch>,
  "aria-label" | "children" | "className"
>;

export type ToggleSwitchProps = ToggleSwitchBaseProps &
  (
    | { "aria-label": string; "aria-labelledby"?: never; children?: never }
    | { "aria-label"?: never; "aria-labelledby": string; children?: never }
    | { "aria-label"?: string; "aria-labelledby"?: string; children: ReactNode }
  );

/**
 * App switch with the interactive HeroUI anatomy included.
 *
 * Keeping the content primitive here prevents visual-only tracks from being
 * introduced at individual call sites. Callers provide either an explicit
 * accessible name or visible label content.
 */
export function ToggleSwitch(props: ToggleSwitchProps) {
  return (
    <Switch {...props} className="cursor-default">
      <Switch.Content>
        <Switch.Control
          onClick={(event) => {
            // React Aria cancels the label's native click default. Forward the
            // visual track activation to its hidden input so Electron mouse
            // clicks reliably reach the controlled onChange handler.
            event.preventDefault();
            event.stopPropagation();
            if (props.isDisabled || props.isReadOnly) return;
            event.currentTarget
              .closest("label")
              ?.querySelector<HTMLInputElement>('input[role="switch"]')
              ?.click();
          }}
        >
          <Switch.Thumb />
        </Switch.Control>
        {props.children}
      </Switch.Content>
    </Switch>
  );
}
