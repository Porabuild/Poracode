import { afterEach, expect, it } from "vitest";
import { useAppStore } from "./appStore";
import { protectedThreadRowIds } from "./protectedThreadRows";
import { __resetThreadLaunchIntentsForTest, pinThreadRow } from "./threadLaunchIntents";

const original = useAppStore.getState();

afterEach(() => {
  __resetThreadLaunchIntentsForTest();
  useAppStore.setState(original, true);
});

it("protects every shown, provisioning, launching and pinned row, whichever host owns it", () => {
  const paired = "remote:pc:thread:shown";
  useAppStore.setState({
    view: { kind: "thread", panes: ["local-shown", paired] },
    provisioningWorktreeThreadIds: { provisioning: true },
    pendingThreadLaunches: { launching: "prompt" },
  });
  const release = pinThreadRow("pinned");

  expect([...protectedThreadRowIds()].sort()).toEqual(
    ["launching", "local-shown", "pinned", "provisioning", paired].sort(),
  );
  release();
  expect(protectedThreadRowIds().has("pinned")).toBe(false);
});
