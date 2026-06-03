export interface ComputerUseWindow {
  app: string;
  id: number;
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ComputerUseApp {
  displayName?: string;
  id: string;
  isRunning?: boolean;
  lastUsedDate?: string;
  useCount?: number;
  windows: ComputerUseWindow[];
}

export interface ComputerUseAccessibilityState {
  document_text?: string;
  focused_element?: string;
  selected_elements?: string[];
  selected_text?: string;
  tree: string;
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
}

export interface ComputerUseWindowState {
  accessibility: ComputerUseAccessibilityState | null;
  mode: "passive" | "interactive";
  notes?: string[];
  screenshots: ComputerUseScreenshot[];
  window: ComputerUseWindow;
}

export interface ComputerUseDriver {
  activateWindow(input: { window: ComputerUseWindow }): Promise<{ ok: true; mode: "interactive" }>;
  click(input: {
    click_count?: number;
    mouse_button?: string;
    window: ComputerUseWindow;
    x?: number;
    y?: number;
  }): Promise<{ ok: true; mode: "interactive" }>;
  drag(input: {
    from_x: number;
    from_y: number;
    to_x: number;
    to_y: number;
    window: ComputerUseWindow;
  }): Promise<{ ok: true; mode: "interactive" }>;
  getWindow(input: { app?: string; id: number }): Promise<ComputerUseWindow>;
  getWindowState(input: {
    include_screenshot?: boolean;
    include_text?: boolean;
    window: ComputerUseWindow;
  }): Promise<ComputerUseWindowState>;
  launchApp(input: { app: string }): Promise<{ ok: true }>;
  listApps(): Promise<ComputerUseApp[]>;
  listWindows(): Promise<ComputerUseWindow[]>;
  performSecondaryAction(input: {
    action: string;
    element_index: number;
    window: ComputerUseWindow;
  }): Promise<{ ok: true; mode: "interactive" }>;
  pressKey(input: { key: string; window: ComputerUseWindow }): Promise<{
    ok: true;
    mode: "interactive";
  }>;
  scroll(input: {
    scrollX: number;
    scrollY: number;
    window: ComputerUseWindow;
    x: number;
    y: number;
  }): Promise<{ ok: true; mode: "interactive" }>;
  setValue(input: {
    element_index: number;
    value: string;
    window: ComputerUseWindow;
  }): Promise<{ ok: true; mode: "interactive" }>;
  typeText(input: { text: string; window: ComputerUseWindow }): Promise<{
    ok: true;
    mode: "interactive";
  }>;
}
