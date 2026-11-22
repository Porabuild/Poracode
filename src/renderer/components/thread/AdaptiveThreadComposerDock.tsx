import type { ReactNode } from "react";
import { FloatingComposerDock } from "@/renderer/components/mobileComposer/FloatingComposerDock";

export function AdaptiveThreadComposerDock(props: {
  compact: boolean;
  collapsed: boolean;
  keyboardKey: string;
  scrimLabel: string;
  collapsedTapLabel: string;
  children: ReactNode;
  aboveBubble?: ReactNode;
  summary?: ReactNode;
  inputHasContent?: boolean;
  working?: boolean;
  expansionLocked?: boolean;
  onDockHeightChange?: (height: number, dock: HTMLElement) => void;
  onExpandedChange: (expanded: boolean) => void;
}) {
  if (!props.compact) return props.children;
  return (
    <FloatingComposerDock
      dockClassName="m-thread-compose-dock"
      keyboardKey={props.keyboardKey}
      scrimLabel={props.scrimLabel}
      collapsedTapLabel={props.collapsedTapLabel}
      expanded={!props.collapsed}
      focusOnExpand
      collapseContentSwapMs={60}
      inputHasContent={props.inputHasContent}
      working={props.working}
      aboveBubble={props.aboveBubble}
      expansionLocked={props.expansionLocked}
      onDockHeightChange={props.onDockHeightChange}
      onExpandedChange={props.onExpandedChange}
    >
      {props.children}
      {props.summary}
    </FloatingComposerDock>
  );
}

export function ComposerAfterControls({
  renderExtras,
  renderVoiceInput,
}: {
  renderExtras: () => ReactNode;
  renderVoiceInput: () => ReactNode;
}) {
  return (
    <>
      {renderExtras()}
      {renderVoiceInput()}
    </>
  );
}
