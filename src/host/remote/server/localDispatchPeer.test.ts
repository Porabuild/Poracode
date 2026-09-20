import { expect, it } from "vitest";
import { isLocalDispatchPeer } from "./localDispatchPeer";

it.each([
  ["127.0.0.1", "127.0.0.1", true],
  ["127.0.0.2", "127.0.0.1", true],
  ["::1", "::1", true],
  ["::ffff:127.0.0.1", "::ffff:127.0.0.1", true],
  ["192.0.2.10", "192.0.2.10", true],
  ["::ffff:192.0.2.10", "192.0.2.10", true],
  ["2001:db8::1", "2001:db8::1", true],
  ["192.0.2.11", "192.0.2.10", false],
  ["2001:db8::2", "2001:db8::1", false],
  [undefined, undefined, false],
  ["192.0.2.10", undefined, false],
] as const)("classifies kernel peer %s on local address %s", (remote, local, expected) => {
  expect(isLocalDispatchPeer(remote, local)).toBe(expected);
});
