import { describe, expect, it } from "vitest";
import {
  AcpConfigApplicationRetiredError,
  captureAcpConfigApplicationOwner,
} from "./sessionConfigOwnership";

describe("configuration application owner", () => {
  const liveOwner = () => ({
    sessionId: "session",
    generation: 1,
    disposed: false,
    transportClosed: false,
  });

  it.each([
    { sessionId: "successor" },
    { generation: 2 },
    { disposed: true },
    { transportClosed: true },
  ])("rejects an owner change even when the native id is reused: %j", (change) => {
    let owner = liveOwner();
    const assertCurrent = captureAcpConfigApplicationOwner(() => owner);
    expect(assertCurrent).not.toThrow();
    owner = { ...owner, ...change };
    expect(assertCurrent).toThrow(AcpConfigApplicationRetiredError);
  });

  it("copies the captured owner instead of following a mutated probe object", () => {
    const owner = liveOwner();
    const assertCurrent = captureAcpConfigApplicationOwner(() => owner);
    owner.generation += 1;
    expect(assertCurrent).toThrow(AcpConfigApplicationRetiredError);
  });
});
