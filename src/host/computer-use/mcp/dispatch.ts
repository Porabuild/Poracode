import { readNumber, readString, readWindow } from "../drivers/common";
import { COMPUTER_USE_CORE_SKILL } from "./instructions";
import {
  omitLaneMode,
  trimInteractiveResult,
  trimObservation,
  trimPerformResult,
  type PerformStepRecord,
} from "./resultTrim";
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
import type {
  ComputerUseDriver,
  ComputerUseInteractiveResult,
  ComputerUseObservation,
  ComputerUseObservationMode,
  ComputerUseWindow,
} from "./types";

/**
 * Pause before an `observe` capture so the observation shows the action's
 * result instead of the state before it.
 *
 * An accessibility tree is the app's own asynchronous report, not a live read.
 * Measured on macOS 25.6 with Brave: `invoke_element` returns in 2 ms while the
 * tree keeps answering with the pre-action values for another 350-460 ms.
 * 500 ms covers that tail; 400 ms sat inside the measured range and could
 * still hand the agent the pre-action tree. An
 * agent that reads straight back sees "nothing happened" on an action that did
 * work, decides background control is broken, and escalates to a takeover — the
 * failure this whole path exists to avoid. The wait is only paid when the
 * caller asked for an observation, where it replaces a whole round trip.
 */
export const OBSERVATION_SETTLE_MS = 500;

export interface ToolContext {
  driver: ComputerUseDriver;
  /**
   * Overrides {@link OBSERVATION_SETTLE_MS}. Tests set 0; the ingress leaves it
   * unset.
   */
  observationSettleMs?: number;
  /**
   * True once computer use has been ended (Escape, the badge's exit button, or
   * host teardown) after this context was built.
   *
   * Ending computer use revokes the desktop itself, not just whatever capture
   * happened to be pending, so this gates two places. {@link dispatchTool}
   * refuses every tool outside {@link POST_EXIT_ALLOWED_TOOLS} up front, and
   * {@link observeWindow} re-checks around its settle sleep to catch an exit
   * that lands mid-call. Either way the point is that `driver` lazily respawns
   * the helper the exit just killed, so any call that reaches it drives or
   * reads a desktop the user has taken back.
   */
  interrupted?: () => boolean;
  /**
   * Called once a tool's real input has been delivered and only the passive
   * `observe` capture remains. The ingress closes its activity window here so a
   * post-action observation cannot hold the takeover border up — or keep the
   * Escape abort suppressed — after the input itself has finished.
   */
  onInputSettled?: (result: unknown) => void;
  setSessionActive?: (active: boolean) => void;
  /**
   * Whether the host is keeping the display awake for the active session.
   * Queried after `setSessionActive(true)` so `enable` can tell the agent that
   * the desktop will not idle-lock out from under it.
   */
  isDisplayKeptAwake?: () => boolean;
  threadId?: string;
}

async function observeWindow(
  ctx: ToolContext,
  window: ComputerUseWindow | null | undefined,
  mode: ComputerUseObservationMode,
): Promise<ComputerUseObservation | undefined> {
  if (!window || mode === "none") return undefined;
  if (ctx.interrupted?.()) return undefined;
  const settleMs = ctx.observationSettleMs ?? OBSERVATION_SETTLE_MS;
  if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
  // The settle window is exactly where an exit lands, so re-check before the
  // capture: `driver.getWindowState` would lazily respawn the helper the exit
  // just killed.
  if (ctx.interrupted?.()) return undefined;
  const driver = ctx.driver;
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
  const observation = await observeWindow(ctx, result.window, mode);
  return observation ? { ...result, observation } : result;
}

/**
 * Reads the caller-supplied window without failing: result trimming only needs
 * it as a baseline, and argument validation belongs to the action itself.
 */
function readOptionalWindow(value: unknown): ComputerUseWindow | undefined {
  try {
    return readWindow(value);
  } catch {
    return undefined;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The only tools that stay callable after the user ends computer use.
 *
 * `enable` is the re-arm path — it clears the thread's exited mark, so refusing
 * it would make the end permanent for the rest of the app's life. `disable` is
 * the teardown every agent is instructed to finish with; refusing it would
 * strand the agent on its own cleanup for no benefit, since it touches nothing
 * but session state.
 */
const POST_EXIT_ALLOWED_TOOLS: ReadonlySet<string> = new Set(["enable", "disable"]);

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  // The user's exit revokes the desktop, so nothing that would touch it may run
  // afterwards — not an input, and not a read either: `get_window_state` and
  // `find_elements` are `readOnlyHint`, so they raise no badge and no overlay
  // while capturing a screen and accessibility tree the user just took back.
  //
  // This throws rather than returning a refusal for two reasons. A refusal code
  // is part of the helper wire contract (mirrored in Rust and pinned by a
  // fixture), and this is a host-side revocation the helper knows nothing
  // about. And an error is what actually reaches the agent: staying silent is
  // how it ends up acting on a desktop it can no longer observe.
  if (!POST_EXIT_ALLOWED_TOOLS.has(name) && ctx.interrupted?.()) {
    throw new Error(
      "Computer use was ended by the user. Call computer_use.enable to start a new session before acting on the desktop again.",
    );
  }
  // Reads `observe` before running the action so an invalid mode is rejected
  // without touching the desktop, then settles the activity window before the
  // observation capture.
  const interactive = async (
    run: () => Promise<ComputerUseInteractiveResult>,
    options: { alwaysEchoWindow?: boolean } = {},
  ): Promise<Record<string, unknown>> => {
    const observe = readObserve(args.observe);
    const result = await withObservation(await run(), ctx, observe);
    // The caller's own `window` argument is the baseline for what it already
    // knows, so an unchanged window is never echoed back to it.
    const requestedWindow = readOptionalWindow(args.window);
    return trimInteractiveResult(result, {
      ...(requestedWindow ? { requestedWindow } : {}),
      ...(options.alwaysEchoWindow === true ? { alwaysEchoWindow: true } : {}),
    });
  };

  switch (name) {
    case "api": {
      const status = await ctx.driver.describeStatus();
      return {
        platform: process.platform,
        ...status,
        skill: COMPUTER_USE_CORE_SKILL,
      };
    }
    case "enable":
      if (!ctx.setSessionActive) throw new Error("computer_use.enable requires a thread context");
      ctx.setSessionActive(true);
      return { enabled: true, ...(ctx.isDisplayKeptAwake?.() ? { keepAwake: true } : {}) };
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
      const result = await ctx.driver.launchApp({
        app: readString(args.app, "app"),
        mode: readMode(args.mode),
      });
      ctx.onInputSettled?.(result);
      const observation = await observeWindow(ctx, result.window, observe);
      return observation
        ? { ...result, observation: trimObservation(observation, result.window) }
        : result;
    }
    case "get_window":
      return await ctx.driver.getWindow({
        ...(typeof args.app === "string" ? { app: args.app } : {}),
        // A window the app recreated keeps its exact title but not its id, so
        // passing the title back is what makes that recovery resolvable.
        ...(typeof args.title === "string" ? { title: args.title } : {}),
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
      const found = await ctx.driver.findElements({
        window: readWindow(args.window),
        ...(role ? { role } : {}),
        ...(elementName ? { name: elementName } : {}),
        ...(text ? { text } : {}),
        ...(automationId ? { automation_id: automationId } : {}),
        ...(snapshotId ? { snapshot_id: snapshotId } : {}),
        ...(maxResults !== undefined ? { max_results: maxResults } : {}),
      });
      // A stale snapshot is an interactive refusal. Strip only the lane
      // label — the window still identifies which snapshot died.
      if (found && typeof found === "object" && "refused" in found && "mode" in found) {
        return omitLaneMode(found);
      }
      return found;
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
      // A takeover response is the caller's source of truth for the window's
      // new state, so it echoes the window even when nothing changed.
      return await interactive(
        () => ctx.driver.activateWindow({ window: readWindow(args.window) }),
        { alwaysEchoWindow: true },
      );
    case "perform": {
      const observe = readObserve(args.observe);
      let window = readWindow(args.window);
      const steps = readPerformSteps(args.steps);
      const results: PerformStepRecord[] = [];
      const finish = async (
        ok: boolean,
        failed?: Record<string, unknown>,
        observeAfterFailure = true,
      ) => {
        const batch = {
          ok,
          mode: "batch" as const,
          window,
          steps: results,
          ...(failed ? { failed } : {}),
        };
        // Settle before observing so an unexpected foreground delivery raises
        // the takeover border immediately instead of behind a capture.
        ctx.onInputSettled?.(batch);
        const observation = observeAfterFailure
          ? await observeWindow(ctx, window, observe)
          : undefined;
        // The batch states its window once; step entries carry only what
        // differs between steps.
        return trimPerformResult(observation ? { ...batch, observation } : batch);
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
