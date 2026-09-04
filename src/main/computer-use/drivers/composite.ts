import type {
  ComputerUseDriver,
  ComputerUseDriverStatus,
  ComputerUseFindElementsResult,
  ComputerUseInteractiveResult,
  ComputerUseRefusal,
  ComputerUseWindow,
} from "../mcp/types";
import { HelperUnavailableError } from "./helper";

const BACKGROUND_HINT =
  'Retry with mode:"foreground" (takes over the real mouse/keyboard and shows the takeover border).';

function refusal(
  window: ComputerUseWindow,
  code: ComputerUseRefusal["code"],
  reason: string,
  hint = BACKGROUND_HINT,
): ComputerUseInteractiveResult {
  return { ok: false, mode: "interactive", window, refused: { code, reason, hint } };
}

function canDegrade(error: unknown): boolean {
  return error instanceof HelperUnavailableError;
}

export interface CompositeComputerUseDriverOptions {
  fallback: ComputerUseDriver | null;
  primary: ComputerUseDriver | null;
  warn?: (message: string) => void;
}

type PrimaryResult<T> = { available: true; value: T } | { available: false };

export class CompositeComputerUseDriver implements ComputerUseDriver {
  private degradedReason: string | null = null;
  private warned = false;

  constructor(private readonly options: CompositeComputerUseDriverOptions) {}

  dispose(): void {
    this.options.primary?.dispose();
    this.options.fallback?.dispose();
  }

  async describeStatus(): Promise<ComputerUseDriverStatus> {
    const primary = await this.tryPrimary((driver) => driver.describeStatus());
    if (primary.available) return primary.value;
    if (this.options.fallback) {
      const status = await this.options.fallback.describeStatus();
      return {
        ...status,
        notes: [...status.notes, this.degradedNote()],
      };
    }
    return {
      backend: "unavailable",
      helper: null,
      capabilities: {
        backgroundPointer: false,
        backgroundKeyboard: false,
        backgroundChords: false,
        accessibilityTree: false,
        elementActions: false,
        occludedCapture: false,
        foregroundInput: false,
        launchApp: false,
        stableWindowIds: false,
      },
      permissions: { accessibility: "unknown", screenRecording: "unknown" },
      notes: [this.degradedNote()],
    };
  }

  listApps(): ReturnType<ComputerUseDriver["listApps"]> {
    return this.passive((driver) => driver.listApps());
  }

  listWindows(): ReturnType<ComputerUseDriver["listWindows"]> {
    return this.passive((driver) => driver.listWindows());
  }

  getWindow(
    input: Parameters<ComputerUseDriver["getWindow"]>[0],
  ): ReturnType<ComputerUseDriver["getWindow"]> {
    return this.passive((driver) => driver.getWindow(input));
  }

  getWindowState(
    input: Parameters<ComputerUseDriver["getWindowState"]>[0],
  ): ReturnType<ComputerUseDriver["getWindowState"]> {
    return this.passive((driver) => driver.getWindowState(input));
  }

  activateWindow(
    input: Parameters<ComputerUseDriver["activateWindow"]>[0],
  ): ReturnType<ComputerUseDriver["activateWindow"]> {
    return this.passive((driver) => driver.activateWindow(input));
  }

  launchApp(
    input: Parameters<ComputerUseDriver["launchApp"]>[0],
  ): ReturnType<ComputerUseDriver["launchApp"]> {
    return this.passive((driver) => driver.launchApp(input));
  }

  click(input: Parameters<ComputerUseDriver["click"]>[0]): ReturnType<ComputerUseDriver["click"]> {
    return this.input(input.window, input.mode, (driver) => driver.click(input));
  }

  pressKey(
    input: Parameters<ComputerUseDriver["pressKey"]>[0],
  ): ReturnType<ComputerUseDriver["pressKey"]> {
    return this.input(input.window, input.mode, (driver) => driver.pressKey(input));
  }

  typeText(
    input: Parameters<ComputerUseDriver["typeText"]>[0],
  ): ReturnType<ComputerUseDriver["typeText"]> {
    return this.input(input.window, input.mode, (driver) => driver.typeText(input));
  }

  scroll(
    input: Parameters<ComputerUseDriver["scroll"]>[0],
  ): ReturnType<ComputerUseDriver["scroll"]> {
    return this.input(input.window, input.mode, (driver) => driver.scroll(input));
  }

  drag(input: Parameters<ComputerUseDriver["drag"]>[0]): ReturnType<ComputerUseDriver["drag"]> {
    return this.input(input.window, input.mode, (driver) => driver.drag(input));
  }

  findElements(
    input: Parameters<ComputerUseDriver["findElements"]>[0],
  ): Promise<ComputerUseFindElementsResult | ComputerUseInteractiveResult> {
    return this.findElementQuery(input.window, (driver) => driver.findElements(input));
  }

  invokeElement(
    input: Parameters<ComputerUseDriver["invokeElement"]>[0],
  ): ReturnType<ComputerUseDriver["invokeElement"]> {
    return this.elementTool(input.window, (driver) => driver.invokeElement(input));
  }

  setElementValue(
    input: Parameters<ComputerUseDriver["setElementValue"]>[0],
  ): ReturnType<ComputerUseDriver["setElementValue"]> {
    return this.elementTool(input.window, (driver) => driver.setElementValue(input));
  }

  private async passive<T>(call: (driver: ComputerUseDriver) => Promise<T>): Promise<T> {
    const primary = await this.tryPrimary(call);
    if (primary.available) return primary.value;
    if (!this.options.fallback) throw new Error(this.degradedNote());
    return await call(this.options.fallback);
  }

  private async input(
    window: ComputerUseWindow,
    mode: "background" | "foreground" | undefined,
    call: (driver: ComputerUseDriver) => Promise<ComputerUseInteractiveResult>,
  ): Promise<ComputerUseInteractiveResult> {
    const primary = await this.tryPrimary(call);
    if (primary.available) return primary.value;
    if ((mode ?? "background") !== "foreground") {
      return refusal(
        window,
        "background_unavailable",
        "Background input is unavailable because the bundled native helper could not start.",
      );
    }
    if (!this.options.fallback) {
      return refusal(window, "capability_unavailable", this.degradedNote());
    }
    return await call(this.options.fallback);
  }

  private async findElementQuery(
    window: ComputerUseWindow,
    call: (
      driver: ComputerUseDriver,
    ) => Promise<ComputerUseFindElementsResult | ComputerUseInteractiveResult>,
  ): Promise<ComputerUseFindElementsResult | ComputerUseInteractiveResult> {
    const primary = await this.tryPrimary(call);
    return primary.available ? primary.value : this.elementUnavailable(window);
  }

  private async elementTool(
    window: ComputerUseWindow,
    call: (driver: ComputerUseDriver) => Promise<ComputerUseInteractiveResult>,
  ): Promise<ComputerUseInteractiveResult> {
    const primary = await this.tryPrimary(call);
    return primary.available ? primary.value : this.elementUnavailable(window);
  }

  private async tryPrimary<T>(
    call: (driver: ComputerUseDriver) => Promise<T>,
  ): Promise<PrimaryResult<T>> {
    if (!this.degradedReason && this.options.primary) {
      try {
        return { available: true, value: await call(this.options.primary) };
      } catch (error) {
        if (!canDegrade(error)) throw error;
        this.degrade(error);
      }
    } else if (!this.options.primary) {
      this.degrade(new Error("The bundled computer-use helper is missing."));
    }
    return { available: false };
  }

  private elementUnavailable(window: ComputerUseWindow): ComputerUseInteractiveResult {
    return refusal(
      window,
      "capability_unavailable",
      "Accessibility element actions require the bundled native helper.",
      "Use get_window_state and coordinate input, or restore the bundled helper.",
    );
  }

  private degrade(error: unknown): void {
    const firstFailure = this.degradedReason === null;
    this.degradedReason = error instanceof Error ? error.message : String(error);
    if (firstFailure) this.options.primary?.dispose();
    if (this.warned) return;
    this.warned = true;
    this.options.warn?.(
      `Computer Use native helper unavailable${this.options.fallback ? "; using legacy fallback." : "."} ${this.degradedReason}`,
    );
  }

  private degradedNote(): string {
    return `Computer Use native helper unavailable${this.degradedReason ? `: ${this.degradedReason}` : "."}`;
  }
}
