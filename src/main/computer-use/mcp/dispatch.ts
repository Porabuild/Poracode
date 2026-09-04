import { readNumber, readString, readWindow } from "../drivers/common";
import { COMPUTER_USE_MCP_INSTRUCTIONS } from "./instructions";
import {
  readBoundedInteger,
  readClickCount,
  readElementAction,
  readMode,
  readMouseButton,
  readVerify,
} from "./toolArgs";
import { TOOLS } from "./toolSpecs";
import type { ComputerUseDriver } from "./types";

export interface ToolContext {
  driver: ComputerUseDriver;
  setSessionActive?: (active: boolean) => void;
  threadId?: string;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "api": {
      const status = await ctx.driver.describeStatus();
      return {
        instructions: COMPUTER_USE_MCP_INSTRUCTIONS,
        platform: process.platform,
        ...status,
        tools: TOOLS.map((entry) => ({
          name: `computer_use.${entry.name}`,
          description: entry.description,
        })),
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
    case "list_apps":
      return await ctx.driver.listApps();
    case "list_windows":
      return await ctx.driver.listWindows();
    case "launch_app":
      return await ctx.driver.launchApp({ app: readString(args.app, "app") });
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
      return await ctx.driver.invokeElement({
        window: readWindow(args.window),
        element_id: readString(args.element_id, "element_id"),
        action: readElementAction(args.action),
      });
    case "set_element_value":
      if (typeof args.value !== "string") throw new Error("value is required");
      return await ctx.driver.setElementValue({
        window: readWindow(args.window),
        element_id: readString(args.element_id, "element_id"),
        value: args.value,
      });
    case "activate_window":
      return await ctx.driver.activateWindow({ window: readWindow(args.window) });
    case "click": {
      const clickCount = readClickCount(args.click_count);
      const mouseButton = readMouseButton(args.mouse_button);
      return await ctx.driver.click({
        window: readWindow(args.window),
        x: readNumber(args.x, "x"),
        y: readNumber(args.y, "y"),
        mode: readMode(args.mode),
        verify: readVerify(args.verify),
        ...(clickCount !== undefined ? { click_count: clickCount } : {}),
        ...(mouseButton !== undefined ? { mouse_button: mouseButton } : {}),
      });
    }
    case "press_key":
      return await ctx.driver.pressKey({
        window: readWindow(args.window),
        key: readString(args.key, "key"),
        mode: readMode(args.mode),
        verify: readVerify(args.verify),
      });
    case "type_text":
      return await ctx.driver.typeText({
        window: readWindow(args.window),
        text: readString(args.text, "text"),
        mode: readMode(args.mode),
        verify: readVerify(args.verify),
      });
    case "scroll":
      return await ctx.driver.scroll({
        window: readWindow(args.window),
        x: readNumber(args.x, "x"),
        y: readNumber(args.y, "y"),
        scrollX: readNumber(args.scrollX, "scrollX"),
        scrollY: readNumber(args.scrollY, "scrollY"),
        mode: readMode(args.mode),
        verify: readVerify(args.verify),
      });
    case "drag": {
      const steps = readBoundedInteger(args.steps, "steps", 1, 200);
      return await ctx.driver.drag({
        window: readWindow(args.window),
        from_x: readNumber(args.from_x, "from_x"),
        from_y: readNumber(args.from_y, "from_y"),
        to_x: readNumber(args.to_x, "to_x"),
        to_y: readNumber(args.to_y, "to_y"),
        mode: readMode(args.mode),
        verify: readVerify(args.verify),
        ...(steps !== undefined ? { steps } : {}),
      });
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
