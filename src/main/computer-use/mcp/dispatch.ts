import { readNumber, readString, readWindow } from "../drivers/common";
import {
  readBoundedInteger,
  readClickCount,
  readElementAction,
  readMode,
  readMouseButton,
  readObserve,
  readPerformSteps,
  readVerify,
} from "./toolArgs";
import { isNativeWaylandTarget } from "./types";
import type {
  ComputerUseDriver,
  ComputerUseInteractiveResult,
  ComputerUseObservation,
  ComputerUseObservationMode,
  ComputerUsePerformStep,
  ComputerUseWindow,
} from "./types";

export interface ToolContext {
  driver: ComputerUseDriver;
  /**
   * Called once a tool's real input has been delivered and only the passive
   * `observe` capture remains. The ingress closes its activity window here so a
   * post-action observation cannot hold the takeover border up — or keep the
   * Escape abort suppressed — after the input itself has finished.
   */
  onInputSettled?: (result: unknown) => void;
  setSessionActive?: (active: boolean) => void;
  threadId?: string;
}

async function observeWindow(
  driver: ComputerUseDriver,
  window: ComputerUseWindow | null | undefined,
  mode: ComputerUseObservationMode,
): Promise<ComputerUseObservation | undefined> {
  if (!window || mode === "none") return undefined;
  try {
    return {
      ok: true,
      state: await driver.getWindowState({
        window,
        include_screenshot: mode === "screenshot" || mode === "both",
        include_text: mode === "text" || mode === "both",
      }),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function withObservation(
  result: ComputerUseInteractiveResult,
  ctx: ToolContext,
  mode: ComputerUseObservationMode,
): Promise<ComputerUseInteractiveResult> {
  ctx.onInputSettled?.(result);
  if (!result.ok) return result;
  const observation = await observeWindow(ctx.driver, result.window, mode);
  return observation ? { ...result, observation } : result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  // Reads `observe` before running the action so an invalid mode is rejected
  // without touching the desktop, then settles the activity window before the
  // observation capture.
  const interactive = async (
    run: () => Promise<ComputerUseInteractiveResult>,
  ): Promise<ComputerUseInteractiveResult> => {
    const observe = readObserve(args.observe);
    return await withObservation(await run(), ctx, observe);
  };

  switch (name) {
    case "api": {
      const status = await ctx.driver.describeStatus();
      return {
        platform: process.platform,
        ...status,
      };
    }
    case "enable":
      if (!ctx.setSessionActive) throw new Error("computer_use.enable requires a thread context");
      ctx.setSessionActive(true);
      return { enabled: true };
    case "disable":
      if (!ctx.setSessionActive) throw new Error("computer_use.disable requires a thread context");
      ctx.setSessionActive(false);
      return { enabled: false };
    case "list_apps": {
      const query = optionalString(args.query);
      return await ctx.driver.listApps(query ? { query } : undefined);
    }
    case "list_windows":
      return await ctx.driver.listWindows();
    case "launch_app": {
      const observe = readObserve(args.observe);
      const result = await ctx.driver.launchApp({ app: readString(args.app, "app") });
      ctx.onInputSettled?.(result);
      const observation = await observeWindow(ctx.driver, result.window, observe);
      return observation ? { ...result, observation } : result;
    }
    case "get_window":
      return await ctx.driver.getWindow({
        ...(typeof args.app === "string" ? { app: args.app } : {}),
        id: readNumber(args.id, "id"),
      });
    case "get_window_state": {
      const treeMaxNodes = readBoundedInteger(args.tree_max_nodes, "tree_max_nodes", 1, 20_000);
      return await ctx.driver.getWindowState({
        window: readWindow(args.window),
        ...(typeof args.include_screenshot === "boolean"
          ? { include_screenshot: args.include_screenshot }
          : {}),
        ...(typeof args.include_text === "boolean" ? { include_text: args.include_text } : {}),
        ...(typeof args.max_dimension === "number" && Number.isFinite(args.max_dimension)
          ? { max_dimension: args.max_dimension }
          : {}),
        ...(treeMaxNodes !== undefined ? { tree_max_nodes: treeMaxNodes } : {}),
        ...(args.format === "png" || args.format === "jpeg" ? { format: args.format } : {}),
      });
    }
    case "find_elements": {
      const maxResults = readBoundedInteger(args.max_results, "max_results", 1, 200);
      const role = optionalString(args.role);
      const elementName = optionalString(args.name);
      const text = optionalString(args.text);
      const automationId = optionalString(args.automation_id);
      const snapshotId = optionalString(args.snapshot_id);
      return await ctx.driver.findElements({
        window: readWindow(args.window),
        ...(role ? { role } : {}),
        ...(elementName ? { name: elementName } : {}),
        ...(text ? { text } : {}),
        ...(automationId ? { automation_id: automationId } : {}),
        ...(snapshotId ? { snapshot_id: snapshotId } : {}),
        ...(maxResults !== undefined ? { max_results: maxResults } : {}),
      });
    }
    case "invoke_element":
      return await interactive(() =>
        ctx.driver.invokeElement({
          window: readWindow(args.window),
          element_id: readString(args.element_id, "element_id"),
          action: readElementAction(args.action),
        }),
      );
    case "set_element_value":
      return await interactive(() => {
        if (typeof args.value !== "string") throw new Error("value is required");
        return ctx.driver.setElementValue({
          window: readWindow(args.window),
          element_id: readString(args.element_id, "element_id"),
          value: args.value,
        });
      });
    case "activate_window":
      return await interactive(() =>
        ctx.driver.activateWindow({ window: readWindow(args.window) }),
      );
    case "perform": {
      const observe = readObserve(args.observe);
      let window = readWindow(args.window);
      const steps = readPerformSteps(args.steps);
      // `readWindow` drops `source`, so the native-Wayland check has to read the
      // raw argument: batching key or text input there would deliver through the
      // consented portal as foreground without reporting it per action.
      if (
        isNativeWaylandTarget(args.window) &&
        steps.some((step) => step.action === "press_key" || step.action === "type_text")
      ) {
        throw new Error(
          "perform cannot batch key or text input for native Wayland targets; use individual tools so foreground portal delivery is reported before each action",
        );
      }
      const results: Array<{
        action: ComputerUsePerformStep["action"];
        index: number;
        result: ComputerUseInteractiveResult;
      }> = [];
      const finish = async (
        ok: boolean,
        failed?: Record<string, unknown>,
        observeAfterFailure = true,
      ) => {
        const batch = {
          ok,
          mode: "batch",
          window,
          steps: results,
          ...(failed ? { failed } : {}),
        };
        // Settle before observing so an unexpected foreground delivery raises
        // the takeover border immediately instead of behind a capture.
        ctx.onInputSettled?.(batch);
        const observation = observeAfterFailure
          ? await observeWindow(ctx.driver, window, observe)
          : undefined;
        return observation ? { ...batch, observation } : batch;
      };
      for (const [index, step] of steps.entries()) {
        let result: ComputerUseInteractiveResult;
        try {
          result =
            step.action === "invoke_element"
              ? await ctx.driver.invokeElement({
                  window,
                  element_id: step.element_id,
                  action: step.element_action,
                })
              : step.action === "set_element_value"
                ? await ctx.driver.setElementValue({
                    window,
                    element_id: step.element_id,
                    value: step.value,
                  })
                : step.action === "press_key"
                  ? await ctx.driver.pressKey({ window, key: step.key, mode: "background" })
                  : await ctx.driver.typeText({ window, text: step.text, mode: "background" });
        } catch (error) {
          return await finish(
            false,
            {
              index,
              action: step.action,
              effect: "unknown",
              error: error instanceof Error ? error.message : String(error),
            },
            false,
          );
        }
        window = result.window ?? window;
        results.push({ index, action: step.action, result });
        if (!result.ok) {
          return await finish(false, { index, action: step.action, effect: "refused" });
        }
        if (result.delivery.delivered === "foreground") {
          return await finish(false, {
            index,
            action: step.action,
            effect: "delivered_foreground",
            error: "perform stopped after an unexpected foreground delivery",
          });
        }
      }
      return await finish(true);
    }
    case "click":
      return await interactive(() => {
        const clickCount = readClickCount(args.click_count);
        const mouseButton = readMouseButton(args.mouse_button);
        return ctx.driver.click({
          window: readWindow(args.window),
          x: readNumber(args.x, "x"),
          y: readNumber(args.y, "y"),
          mode: readMode(args.mode),
          verify: readVerify(args.verify),
          ...(clickCount !== undefined ? { click_count: clickCount } : {}),
          ...(mouseButton !== undefined ? { mouse_button: mouseButton } : {}),
        });
      });
    case "press_key":
      return await interactive(() =>
        ctx.driver.pressKey({
          window: readWindow(args.window),
          key: readString(args.key, "key"),
          mode: readMode(args.mode),
          verify: readVerify(args.verify),
        }),
      );
    case "type_text":
      return await interactive(() =>
        ctx.driver.typeText({
          window: readWindow(args.window),
          text: readString(args.text, "text"),
          mode: readMode(args.mode),
          verify: readVerify(args.verify),
        }),
      );
    case "scroll":
      return await interactive(() =>
        ctx.driver.scroll({
          window: readWindow(args.window),
          x: readNumber(args.x, "x"),
          y: readNumber(args.y, "y"),
          scrollX: readNumber(args.scrollX, "scrollX"),
          scrollY: readNumber(args.scrollY, "scrollY"),
          mode: readMode(args.mode),
          verify: readVerify(args.verify),
        }),
      );
    case "drag":
      return await interactive(() => {
        const steps = readBoundedInteger(args.steps, "steps", 1, 200);
        return ctx.driver.drag({
          window: readWindow(args.window),
          from_x: readNumber(args.from_x, "from_x"),
          from_y: readNumber(args.from_y, "from_y"),
          to_x: readNumber(args.to_x, "to_x"),
          to_y: readNumber(args.to_y, "to_y"),
          mode: readMode(args.mode),
          verify: readVerify(args.verify),
          ...(steps !== undefined ? { steps } : {}),
        });
      });
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
