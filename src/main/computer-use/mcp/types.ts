import type {
  ComputerUseHelperCapabilities,
  ComputerUseHelperHello,
} from "@/shared/contracts/computerUse";

export interface ComputerUseWindow {
  app: string;
  id: number;
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  pid?: number;
  displayName?: string;
  minimized?: boolean;
  source?: "win32" | "cg" | "x11" | "atspi";
}

export interface ComputerUseApp {
  displayName?: string;
  id: string;
  isRunning?: boolean;
  lastUsedDate?: string;
  useCount?: number;
  windows: ComputerUseWindow[];
}

export interface ComputerUseListAppsInput {
  query?: string;
}

export const COMPUTER_USE_ELEMENT_ACTIONS = [
  "invoke",
  "toggle",
  "select",
  "expand",
  "collapse",
  "set_value",
  "scroll",
  "context_menu",
  "click",
] as const;

export type ComputerUseElementAction = (typeof COMPUTER_USE_ELEMENT_ACTIONS)[number];

export const COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS = [
  "invoke",
  "toggle",
  "select",
  "expand",
  "collapse",
  "scroll",
  "context_menu",
  "click",
] as const satisfies readonly ComputerUseElementAction[];

export type ComputerUseInvocableElementAction =
  (typeof COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS)[number];

export interface ComputerUseElement {
  id: string;
  role: string;
  name?: string;
  value?: string;
  automationId?: string;
  bounds: { x: number; y: number; width: number; height: number };
  enabled: boolean;
  focused: boolean;
  offscreen: boolean;
  actions: ComputerUseElementAction[];
  depth: number;
}

export interface ComputerUseAccessibilityState {
  source?: "uia" | "ax" | "atspi";
  tree: string;
  snapshotId?: string;
  elementCount?: number;
  elements?: ComputerUseElement[];
  truncated?: boolean;
}

export interface ComputerUseScreenshot {
  data: string;
  height?: number;
  id: string;
  mimeType: string;
  originX?: number;
  originY?: number;
  width?: number;
  zIndex: number;
  scale?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  captureMethod?: string;
}

export interface ComputerUseWindowState {
  accessibility: ComputerUseAccessibilityState | null;
  mode: "passive" | "interactive";
  notes?: string[];
  screenshots: ComputerUseScreenshot[];
  window: ComputerUseWindow;
}

/**
 * Native Wayland is the documented exception to background delivery: coordinate
 * and key input there goes through the consented desktop portal and is reported
 * as foreground. Such targets come from AT-SPI, which marks them `source:"atspi"`
 * and always assigns a negative synthetic id. Pass the *raw* window argument --
 * `readWindow()` normalizes ids but drops `source`.
 */
export function isNativeWaylandTarget(window: unknown): boolean {
  if (!window || typeof window !== "object") return false;
  const { source, id } = window as { id?: unknown; source?: unknown };
  if (source === "atspi") return true;
  const numericId = typeof id === "number" || typeof id === "string" ? Number(id) : Number.NaN;
  return Number.isFinite(numericId) && numericId < 0;
}

export type ComputerUseDeliveryMode = "background" | "foreground";
export type ComputerUseObservationMode = "none" | "text" | "screenshot" | "both";
export type ComputerUseVerification = "none" | "fast" | "effect";

export type ComputerUsePerformStep =
  | {
      action: "invoke_element";
      element_action: ComputerUseInvocableElementAction;
      element_id: string;
    }
  | { action: "set_element_value"; element_id: string; value: string }
  | { action: "press_key"; key: string }
  | { action: "type_text"; text: string };

export interface ComputerUseDeliveryReport {
  delivered: ComputerUseDeliveryMode;
  route: "accessibility" | "message" | "event" | "input";
  target?: { kind: string; id: string; role?: string; name?: string };
  verified: "confirmed" | "unverified" | "unchanged";
  notes?: string[];
}

export const COMPUTER_USE_REFUSAL_CODES = [
  "background_unavailable",
  "background_occluded_unsupported",
  "wayland_raw_input_unsupported",
  "window_minimized",
  "elevated_target",
  "secure_desktop",
  "target_not_responding",
  "decoration_target",
  "permission_denied",
  "stale_snapshot",
  "element_action_unsupported",
  "unsupported_button",
  "capability_unavailable",
] as const;

export interface ComputerUseRefusal {
  code: (typeof COMPUTER_USE_REFUSAL_CODES)[number];
  reason: string;
  hint: string;
}

export type ComputerUseObservation =
  | { ok: true; state: ComputerUseWindowState }
  | { ok: false; error: string };

export type ComputerUseInteractiveResult =
  | {
      ok: true;
      mode: "interactive";
      window?: ComputerUseWindow;
      delivery: ComputerUseDeliveryReport;
      observation?: ComputerUseObservation;
    }
  | {
      ok: false;
      mode: "interactive";
      window?: ComputerUseWindow;
      refused: ComputerUseRefusal;
    };

export interface ComputerUseFindElementsResult {
  snapshotId: string;
  truncated: boolean;
  elements: ComputerUseElement[];
}

export interface ComputerUseDriverStatus {
  backend: "helper" | "legacy" | "unavailable";
  helper: ComputerUseHelperHello | null;
  capabilities: ComputerUseHelperCapabilities;
  permissions: ComputerUseHelperHello["permissions"];
  notes: string[];
}

export interface ComputerUseDriver {
  activateWindow(input: { window: ComputerUseWindow }): Promise<ComputerUseInteractiveResult>;
  click(input: {
    click_count?: number;
    mode?: ComputerUseDeliveryMode;
    mouse_button?: string;
    verify?: ComputerUseVerification;
    window: ComputerUseWindow;
    x: number;
    y: number;
  }): Promise<ComputerUseInteractiveResult>;
  describeStatus(): Promise<ComputerUseDriverStatus>;
  dispose(): void;
  drag(input: {
    from_x: number;
    from_y: number;
    mode?: ComputerUseDeliveryMode;
    steps?: number;
    to_x: number;
    to_y: number;
    verify?: ComputerUseVerification;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult>;
  findElements(input: {
    automation_id?: string;
    max_results?: number;
    name?: string;
    role?: string;
    snapshot_id?: string;
    text?: string;
    window: ComputerUseWindow;
  }): Promise<ComputerUseFindElementsResult | ComputerUseInteractiveResult>;
  getWindow(input: { app?: string; id: number }): Promise<ComputerUseWindow>;
  getWindowState(input: {
    format?: "jpeg" | "png";
    include_screenshot?: boolean;
    include_text?: boolean;
    max_dimension?: number;
    tree_max_nodes?: number;
    window: ComputerUseWindow;
  }): Promise<ComputerUseWindowState>;
  invokeElement(input: {
    action: ComputerUseInvocableElementAction;
    element_id: string;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult>;
  launchApp(input: { app: string }): Promise<{
    ok: true;
    window?: ComputerUseWindow | null;
    note?: string;
  }>;
  listApps(input?: ComputerUseListAppsInput): Promise<ComputerUseApp[]>;
  listWindows(): Promise<ComputerUseWindow[]>;
  pressKey(input: {
    key: string;
    mode?: ComputerUseDeliveryMode;
    verify?: ComputerUseVerification;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult>;
  scroll(input: {
    mode?: ComputerUseDeliveryMode;
    scrollX: number;
    scrollY: number;
    verify?: ComputerUseVerification;
    window: ComputerUseWindow;
    x: number;
    y: number;
  }): Promise<ComputerUseInteractiveResult>;
  setElementValue(input: {
    element_id: string;
    value: string;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult>;
  typeText(input: {
    mode?: ComputerUseDeliveryMode;
    text: string;
    verify?: ComputerUseVerification;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult>;
}
