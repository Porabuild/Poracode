import { describe, expect, it, vi } from "vitest";

import { ARG_ALIASES, dispatchTool, TOOLS } from "./toolRegistry";
import type { ComputerUseDriver } from "./types";

const window = { app: "Brave Browser", id: 7 };

function createDriver() {
  return {
    scroll: vi.fn<() => Promise<unknown>>(async () => ({
      ok: true as const,
      mode: "interactive" as const,
      window,
    })),
    invokeElement: vi.fn<() => Promise<unknown>>(async () => ({
      ok: true as const,
      mode: "interactive" as const,
      window,
      delivery: {
        delivered: "background" as const,
        route: "accessibility" as const,
        verified: "unverified" as const,
      },
    })),
    click: vi.fn<() => Promise<unknown>>(async () => ({
      ok: true as const,
      mode: "interactive" as const,
      window,
      delivery: {
        delivered: "background" as const,
        route: "event" as const,
        verified: "unverified" as const,
      },
    })),
  } as unknown as ComputerUseDriver & {
    scroll: ReturnType<typeof vi.fn>;
    invokeElement: ReturnType<typeof vi.fn>;
    click: ReturnType<typeof vi.fn>;
  };
}

describe("unknown arguments", () => {
  // Dropping them silently reads as "wrong name, try again": a blind evaluation
  // watched an agent send direction, amount, delta_y and dy on one call, get no
  // complaint each time, and keep guessing while the effect never happened.
  it("rejects an argument the tool does not take and names the ones it does", async () => {
    const driver = createDriver();

    await expect(
      dispatchTool(
        "scroll",
        { window, x: 1, y: 2, scrollX: 0, scrollY: 100, direction: "down" },
        { driver },
      ),
    ).rejects.toThrow(/scroll does not take direction\. It accepts: .*scrollY/);
    expect(driver.scroll).not.toHaveBeenCalled();
  });

  it("rejects unknown keys inside a perform step", async () => {
    const driver = createDriver();

    await expect(
      dispatchTool(
        "perform",
        {
          window,
          steps: [
            { action: "invoke_element", element_id: "s1:2", element_action: "invoke", dy: 1 },
          ],
        },
        { driver },
      ),
    ).rejects.toThrow(/steps\[0\] does not take dy/);
  });

  it("rewrites invoke element_action onto action", async () => {
    const driver = createDriver();

    await expect(
      dispatchTool(
        "invoke_element",
        { window, element_id: "s1:2", element_action: "scroll" },
        { driver, observationSettleMs: 0 },
      ),
    ).resolves.toBeDefined();
    expect(driver.invokeElement).toHaveBeenCalledWith(
      expect.objectContaining({ element_id: "s1:2", action: "scroll" }),
    );
  });

  it("names a colliding alias instead of dropping it", async () => {
    const driver = createDriver();

    await expect(
      dispatchTool(
        "click",
        { window, x: 1, y: 2, button: "right", mouse_button: "left" },
        { driver, observationSettleMs: 0 },
      ),
    ).rejects.toThrow("takes mouse_button, not both mouse_button and button");
    expect(driver.click).not.toHaveBeenCalled();
  });

  it("names the window object when the caller inlined app and id", async () => {
    const driver = createDriver();

    await expect(
      dispatchTool("get_window_state", { app: "Brave", id: 7 }, { driver, observationSettleMs: 0 }),
    ).rejects.toThrow(/whole window object/);
  });

  it("rewrites button onto mouse_button instead of rejecting it as unknown", async () => {
    const driver = createDriver();

    await expect(
      dispatchTool(
        "click",
        { window, x: 1, y: 2, button: "right" },
        { driver, observationSettleMs: 0 },
      ),
    ).resolves.toBeDefined();
    expect(driver.click).toHaveBeenCalledWith(expect.objectContaining({ mouse_button: "right" }));
  });

  it("tolerates an underscore-prefixed metadata key", async () => {
    const driver = createDriver();

    await expect(
      dispatchTool(
        "invoke_element",
        { window, element_id: "s1:2", action: "invoke", _meta: { trace: "abc" } },
        { driver, observationSettleMs: 0 },
      ),
    ).resolves.toBeDefined();
    expect(driver.invokeElement).toHaveBeenCalledOnce();
  });

  it("guards every tool schema with properties and additionalProperties:false", async () => {
    const driver = createDriver();

    await expect(
      dispatchTool(
        "invoke_element",
        { window, element_id: "s1:2", action: "invoke", observe: "none" },
        { driver, observationSettleMs: 0 },
      ),
    ).resolves.toBeDefined();

    // Guards the check itself: it reads the published schema, so a tool whose
    // schema lost its properties would silently stop validating.
    for (const tool of TOOLS) {
      expect({ tool: tool.name, properties: tool.inputSchema.properties }).toEqual({
        tool: tool.name,
        properties: expect.any(Object),
      });
      expect({ tool: tool.name, strict: tool.inputSchema.additionalProperties }).toEqual({
        tool: tool.name,
        strict: false,
      });
    }
  });

  // An alias pointing at a name the schema does not accept would be rewritten
  // and then rejected as unknown — or worse, shadow a canonical key — so the
  // table is validated against the schemas it feeds.
  it("maps every alias onto a canonical schema property", () => {
    for (const [tool, aliases] of Object.entries(ARG_ALIASES)) {
      const spec = TOOLS.find((entry) => entry.name === tool);
      const properties = spec?.inputSchema.properties as Record<string, unknown> | undefined;
      expect(properties, `${tool} has a schema`).toBeTruthy();
      for (const [alias, canonical] of Object.entries(aliases)) {
        expect(properties, `${tool} accepts ${canonical}`).toHaveProperty(canonical);
        expect(properties, `${tool} alias ${alias} shadows its target`).not.toHaveProperty(alias);
      }
    }
  });
});
