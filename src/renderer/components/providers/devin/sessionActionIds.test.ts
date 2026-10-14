// @vitest-environment node
import { describe, expect, it } from "vitest";
// The renderer ids must stay in lockstep with the supervisor's registered
// neutral action ids — the inventory gates visibility, but a typo here would
// silently render no controls even when the session declares the action.
import { DEVIN_ACP_SESSION_ACTION_IDS } from "@/supervisor/agents/devin/acp/sessionActions";
import { DEVIN_ACP_CONFIG_ACTION_IDS } from "@/supervisor/agents/devin/acp/sessionConfiguration";
import {
  DEVIN_NATIVE_PERSONAS_ACTION_ID,
  DEVIN_SESSION_ACTION_IDS,
  DEVIN_SESSION_CONFIG_ACTION_IDS,
} from "./sessionActionIds";

describe("Devin session action id parity with the supervisor seam", () => {
  it("mirrors DEVIN_ACP_SESSION_ACTION_IDS exactly", () => {
    expect(DEVIN_SESSION_ACTION_IDS).toEqual(DEVIN_ACP_SESSION_ACTION_IDS);
  });

  it("mirrors the live config pair exactly", () => {
    expect(DEVIN_SESSION_CONFIG_ACTION_IDS).toEqual(DEVIN_ACP_CONFIG_ACTION_IDS);
    expect(Object.values(DEVIN_SESSION_CONFIG_ACTION_IDS)).toEqual([
      "devin.config.list",
      "devin.config.set",
    ]);
    // The pair lives in its own map: the vendor-RPC parity above stays exact.
    expect(DEVIN_SESSION_ACTION_IDS).not.toContain(DEVIN_SESSION_CONFIG_ACTION_IDS.list);
    expect(DEVIN_SESSION_ACTION_IDS).not.toContain(DEVIN_SESSION_CONFIG_ACTION_IDS.set);
  });

  it("keeps the native personas descriptor id stable for native clients", () => {
    // The cross-platform contract id (`native-personas.list`): the iOS/Android
    // native clients mirror this exact string, so it must never drift.
    expect(DEVIN_NATIVE_PERSONAS_ACTION_ID).toBe("native-personas.list");
    expect(DEVIN_SESSION_ACTION_IDS).not.toContain(DEVIN_NATIVE_PERSONAS_ACTION_ID);
  });
});
