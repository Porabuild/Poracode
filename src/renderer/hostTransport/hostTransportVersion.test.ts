import { afterEach, describe, expect, it } from "vitest";
import { UNKNOWN_HOST_SERVICE_CAPABILITIES } from "@/shared/hostControlProtocol";
import {
  HOST_TRANSPORT_VERSION,
  PREVIOUS_HOST_TRANSPORT_VERSION,
  activateHostTransport,
  assertHostTransportVersion,
  resetActiveHostTransportForTest,
  type HostTransport,
} from "./index";

function transportWithVersion(version: number): HostTransport {
  return {
    version: version as typeof HOST_TRANSPORT_VERSION,
    identity: { kind: "managed" },
    capabilities: UNKNOWN_HOST_SERVICE_CAPABILITIES,
    request: async () => null,
    subscribeEvents: () => () => {},
  };
}

describe("HOST_TRANSPORT_VERSION old-reader (V6 B.5)", () => {
  afterEach(() => {
    resetActiveHostTransportForTest();
  });

  it("accepts the current interface stamp", () => {
    expect(() => assertHostTransportVersion(HOST_TRANSPORT_VERSION)).not.toThrow();
    expect(() => activateHostTransport(transportWithVersion(HOST_TRANSPORT_VERSION))).not.toThrow();
  });

  it("rejects a previous interface stamp from a current reader", () => {
    expect(() => assertHostTransportVersion(PREVIOUS_HOST_TRANSPORT_VERSION)).toThrow(
      /Unsupported host transport version/,
    );
    expect(() =>
      activateHostTransport(transportWithVersion(PREVIOUS_HOST_TRANSPORT_VERSION)),
    ).toThrow(/Unsupported host transport version/);
  });

  it("rejects a future interface stamp from this reader", () => {
    const future = HOST_TRANSPORT_VERSION + 1;
    expect(() => assertHostTransportVersion(future)).toThrow(/Unsupported host transport version/);
    expect(() => activateHostTransport(transportWithVersion(future))).toThrow(
      /Unsupported host transport version/,
    );
  });

  it("an old reader (stamped on the previous version) fails closed on the current stamp", () => {
    // The previous bundle shipped the same assert pinned to
    // PREVIOUS_HOST_TRANSPORT_VERSION. Meeting this bundle's current stamp
    // must refuse deterministically — never accepted with guessed semantics.
    const oldAssertHostTransportVersion = (version: unknown): void => {
      if (version !== PREVIOUS_HOST_TRANSPORT_VERSION) {
        throw new Error(`Unsupported host transport version: ${String(version)}`);
      }
    };
    expect(() => oldAssertHostTransportVersion(HOST_TRANSPORT_VERSION)).toThrow(
      /Unsupported host transport version/,
    );
    expect(() => oldAssertHostTransportVersion(undefined)).toThrow(
      /Unsupported host transport version/,
    );
  });
});
