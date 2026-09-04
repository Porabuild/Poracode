import { describe, expect, it } from "vitest";
import {
  readBoundedInteger,
  readClickCount,
  readElementAction,
  readMode,
  readMouseButton,
  readVerify,
} from "./toolArgs";

describe("computer-use tool arguments", () => {
  it("defaults delivery and verification without accepting unknown values", () => {
    expect(readMode(undefined)).toBe("background");
    expect(readMode("foreground")).toBe("foreground");
    expect(() => readMode("automatic")).toThrow('mode must be "background" or "foreground"');

    expect(readVerify(undefined)).toBe("fast");
    expect(readVerify("effect")).toBe("effect");
    expect(() => readVerify("full")).toThrow('verify must be "none", "fast", or "effect"');
  });

  it("accepts only supported accessibility actions", () => {
    expect(readElementAction("invoke")).toBe("invoke");
    expect(() => readElementAction("set_value")).toThrow(
      "action is not a supported accessibility element action",
    );
    expect(() => readElementAction("perform_secondary_action")).toThrow(
      "action is not a supported accessibility element action",
    );
  });

  it("enforces integer bounds", () => {
    expect(readBoundedInteger(undefined, "steps", 1, 200)).toBeUndefined();
    expect(readBoundedInteger(1, "steps", 1, 200)).toBe(1);
    expect(readBoundedInteger(200, "steps", 1, 200)).toBe(200);
    expect(() => readBoundedInteger(0, "steps", 1, 200)).toThrow(
      "steps must be an integer from 1 to 200",
    );
    expect(() => readBoundedInteger(1.5, "steps", 1, 200)).toThrow(
      "steps must be an integer from 1 to 200",
    );
  });

  it("validates click count and mouse button aliases", () => {
    expect(readClickCount(undefined)).toBeUndefined();
    expect(readClickCount(2)).toBe(2);
    expect(() => readClickCount(3)).toThrow("click_count must be 1 or 2");

    expect(readMouseButton(undefined)).toBeUndefined();
    expect(readMouseButton("right")).toBe("right");
    expect(readMouseButton("m")).toBe("m");
    expect(() => readMouseButton("primary")).toThrow("mouse_button must be left, right, or middle");
  });
});
