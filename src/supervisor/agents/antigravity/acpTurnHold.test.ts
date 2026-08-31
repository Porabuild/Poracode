import { describe, expect, it } from "vitest";
import { parseAntigravityAcpTurnSignal } from "./acpTurnHold";

// Lines captured verbatim from agy_acp_server_20260818_01_RC01 stderr.
const WAITING_LINE =
  'I0831 14:08:16.659332 51136 local_connection.py:521] RAW WS MSG: {"trajectoryStateUpdate":{"trajectoryId":"82dd91b2-63cc-41cf-8cf7-11c5cdf5036f", "state":"STATE_WAITING_FOR_TASKS"}, "seqNum":"17", "timestampMicros":"1788210496658811"}';
const RUNNING_LINE =
  'I0831 14:08:31.996059 51136 local_connection.py:521] RAW WS MSG: {"trajectoryStateUpdate":{"trajectoryId":"82dd91b2-63cc-41cf-8cf7-11c5cdf5036f", "state":"STATE_RUNNING"}, "seqNum":"20", "timestampMicros":"1788210511996059"}';
const FULLY_IDLE_LINE =
  'I0831 14:08:33.250897 51136 local_connection.py:521] RAW WS MSG: {"trajectoryStateUpdate":{"trajectoryId":"82dd91b2-63cc-41cf-8cf7-11c5cdf5036f", "state":"STATE_FULLY_IDLE"}, "seqNum":"27", "timestampMicros":"1788210513250897"}';

describe("parseAntigravityAcpTurnSignal", () => {
  it("signals background-wait on the trajectory WAITING_FOR_TASKS diagnostic", () => {
    expect(parseAntigravityAcpTurnSignal(WAITING_LINE)).toBe("background-wait");
  });

  it("ignores other trajectory states", () => {
    expect(parseAntigravityAcpTurnSignal(RUNNING_LINE)).toBeUndefined();
    expect(parseAntigravityAcpTurnSignal(FULLY_IDLE_LINE)).toBeUndefined();
  });

  it("ignores the state name outside a trajectoryStateUpdate payload", () => {
    // Model output echoed to stderr (or any prose mentioning the state) must
    // not complete a turn.
    expect(
      parseAntigravityAcpTurnSignal("the harness may report STATE_WAITING_FOR_TASKS here"),
    ).toBeUndefined();
    expect(
      parseAntigravityAcpTurnSignal(
        '{"stepUpdate":{"text":"STATE_WAITING_FOR_TASKS is a state"}, "seqNum":"3"}',
      ),
    ).toBeUndefined();
  });

  it("ignores unrelated diagnostics", () => {
    expect(
      parseAntigravityAcpTurnSignal(
        "I0831 14:08:05.818595 51136 main.py:80] Starting AGY ACP Server...",
      ),
    ).toBeUndefined();
    expect(parseAntigravityAcpTurnSignal("")).toBeUndefined();
  });
});
