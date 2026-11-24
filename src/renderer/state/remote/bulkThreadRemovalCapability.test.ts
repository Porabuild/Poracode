import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetBulkThreadRemovalCapabilityForTest,
  environmentAdvertisesBulkThreadRemoval,
  forgetBulkThreadRemovalCapability,
  hostSupportsBulkThreadRemovalForConnection,
  noteBulkThreadRemovalCapability,
} from "./bulkThreadRemovalCapability";

describe("bulkThreadRemovalCapability", () => {
  beforeEach(() => {
    __resetBulkThreadRemovalCapabilityForTest();
  });

  it("recognizes bulkThreadRemoval v1 only when version 1 is advertised", () => {
    expect(environmentAdvertisesBulkThreadRemoval({})).toBe(false);
    expect(
      environmentAdvertisesBulkThreadRemoval({
        capabilities: { bulkThreadRemoval: { versions: [] } },
      }),
    ).toBe(false);
    expect(
      environmentAdvertisesBulkThreadRemoval({
        capabilities: { bulkThreadRemoval: { versions: [2] } },
      }),
    ).toBe(false);
    expect(
      environmentAdvertisesBulkThreadRemoval({
        capabilities: { bulkThreadRemoval: { versions: [1] } },
      }),
    ).toBe(true);
  });

  it("tracks per-connection support and forgets on removal", () => {
    expect(hostSupportsBulkThreadRemovalForConnection("conn-a")).toBe(false);
    noteBulkThreadRemovalCapability("conn-a", true);
    noteBulkThreadRemovalCapability("conn-b", false);

    expect(hostSupportsBulkThreadRemovalForConnection("conn-a")).toBe(true);
    expect(hostSupportsBulkThreadRemovalForConnection("conn-b")).toBe(false);

    forgetBulkThreadRemovalCapability("conn-a");
    expect(hostSupportsBulkThreadRemovalForConnection("conn-a")).toBe(false);
  });
});
