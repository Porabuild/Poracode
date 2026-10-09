import type { ComponentType, ReactNode } from "react";
import type { Thread, ThreadPresentationMode } from "@/shared/contracts";
import { lookupProviderRegistration } from "./providerRegistry";

export interface ProviderSessionControlProps {
  thread: Thread;
  presentationMode: ThreadPresentationMode;
  isDisabled: boolean;
  /** Render inventory-backed actions in the composer's existing add menu. */
  children?: (actions: readonly ProviderSessionMenuAction[]) => ReactNode;
}

export interface ProviderSessionMenuAction {
  id: string;
  label: string;
  /** Optional explanation, including a retryable inventory failure. */
  detail?: string;
  icon: ComponentType<{ className?: string }>;
  isDisabled: boolean;
  onAction: () => void;
}

const controls = new Map<string, ComponentType<ProviderSessionControlProps>>();

export function registerProviderSessionControls(
  kind: string,
  component: ComponentType<ProviderSessionControlProps>,
): void {
  controls.set(kind, component);
}

/** Provider UI declarations render only on the active structured surface. */
export function ProviderSessionControls(props: ProviderSessionControlProps) {
  if (props.presentationMode !== "gui") return props.children?.([]) ?? null;
  const Controls = lookupProviderRegistration(controls, props.thread.agentKind);
  // Registrations are stable module-level component types, never created during render.
  // oxlint-disable-next-line react/static-components
  return Controls ? <Controls {...props} /> : (props.children?.([]) ?? null);
}
