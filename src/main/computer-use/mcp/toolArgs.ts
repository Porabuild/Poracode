import { readNumber } from "../drivers/common";
import type {
  ComputerUseDeliveryMode,
  ComputerUseInvocableElementAction,
  ComputerUseObservationMode,
  ComputerUsePerformStep,
  ComputerUseVerification,
} from "./types";
import { COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS } from "./types";

const ELEMENT_ACTIONS = new Set<ComputerUseInvocableElementAction>(
  COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS,
);

export function readMode(value: unknown): ComputerUseDeliveryMode {
  if (value === undefined) return "background";
  if (value === "background" || value === "foreground") return value;
  throw new Error('mode must be "background" or "foreground"');
}

export function readVerify(value: unknown): ComputerUseVerification {
  if (value === undefined) return "fast";
  if (value === "none" || value === "fast" || value === "effect") return value;
  throw new Error('verify must be "none", "fast", or "effect"');
}

export function readObserve(value: unknown): ComputerUseObservationMode {
  if (value === undefined || value === "none") return "none";
  if (value === "text" || value === "screenshot" || value === "both") return value;
  throw new Error('observe must be "none", "text", "screenshot", or "both"');
}

export function readPerformSteps(value: unknown): ComputerUsePerformStep[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    throw new Error("steps must contain 1 to 32 actions");
  }
  return value.map((step, index) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      throw new Error(`steps[${index}] must be an object`);
    }
    const record = step as Record<string, unknown>;
    switch (record.action) {
      case "invoke_element":
        return {
          action: "invoke_element",
          element_id: readRequiredStepString(record.element_id, index, "element_id"),
          element_action: readElementAction(record.element_action),
        };
      case "set_element_value":
        return {
          action: "set_element_value",
          element_id: readRequiredStepString(record.element_id, index, "element_id"),
          value: readRequiredStepString(record.value, index, "value", true),
        };
      case "press_key":
        return {
          action: "press_key",
          key: readRequiredStepString(record.key, index, "key"),
        };
      case "type_text":
        return {
          action: "type_text",
          text: readRequiredStepString(record.text, index, "text", true),
        };
      default:
        throw new Error(`steps[${index}].action is not supported`);
    }
  });
}

function readRequiredStepString(
  value: unknown,
  index: number,
  name: string,
  allowEmpty = false,
): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`steps[${index}].${name} must be a string`);
  }
  return value;
}

export function readElementAction(value: unknown): ComputerUseInvocableElementAction {
  if (
    typeof value === "string" &&
    ELEMENT_ACTIONS.has(value as ComputerUseInvocableElementAction)
  ) {
    return value as ComputerUseInvocableElementAction;
  }
  throw new Error("action is not a supported accessibility element action");
}

export function readBoundedInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  const number = readNumber(value, name);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return number;
}

export function readClickCount(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const count = readNumber(value, "click_count");
  if (!Number.isInteger(count) || count < 1 || count > 2) {
    throw new Error("click_count must be 1 or 2");
  }
  return count;
}

export function readMouseButton(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !["left", "right", "middle", "l", "r", "m"].includes(value)) {
    throw new Error("mouse_button must be left, right, or middle");
  }
  return value;
}
