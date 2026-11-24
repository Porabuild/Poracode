import { describe, expect, it } from "vitest";
import { lastTurnModelFromItems, type TurnModelItem } from "./modelSwitch";

function item(type: string, payload?: unknown): TurnModelItem {
  return { type, payload };
}

describe("lastTurnModelFromItems", () => {
  it("returns the model recorded on the latest user message", () => {
    expect(
      lastTurnModelFromItems([
        item("user_message", { content: [], model: "model-a" }),
        item("assistant_message", { content: [] }),
        item("user_message", { content: [], model: "model-b" }),
        item("assistant_message", { content: [] }),
      ]),
    ).toBe("model-b");
  });

  it("prefers the latest model_switch target over older user messages", () => {
    expect(
      lastTurnModelFromItems([
        item("user_message", { content: [], model: "model-a" }),
        item("model_switch", { fromModel: "model-a", toModel: "model-b", at: "t" }),
      ]),
    ).toBe("model-b");
  });

  it("stops at a provider handoff instead of borrowing the previous provider's model", () => {
    expect(
      lastTurnModelFromItems([
        item("user_message", { content: [], model: "other-provider-model" }),
        item("provider_handoff", { fromAgentKind: "a", toAgentKind: "b", at: "t" }),
        item("assistant_message", { content: [] }),
      ]),
    ).toBeUndefined();
  });

  it("returns undefined for transcripts without a recorded turn model", () => {
    expect(
      lastTurnModelFromItems([
        item("user_message", { content: [] }),
        item("assistant_message", { content: [] }),
      ]),
    ).toBeUndefined();
    expect(lastTurnModelFromItems([])).toBeUndefined();
  });
});
