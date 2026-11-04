import { expect, it } from "vitest";
import { remoteWebSocketUrl } from "@/shared/remote/clientApiWorkspace";
import { declareEventSocketCapabilities } from "./eventSocketUpgrade";

const params = (url: string) => new URL(url).searchParams;

it("declares notices on every upgrade and catalogChanges only when advertised", () => {
  const base = remoteWebSocketUrl("http://127.0.0.1:1/", "t", undefined, {
    threadItemInterests: [],
  });
  expect(
    params(declareEventSocketCapabilities(base, { boundedCatalogChanges: false })).get("notices"),
  ).toBe("v1");
  expect(
    params(declareEventSocketCapabilities(base, { boundedCatalogChanges: false })).has(
      "catalogChanges",
    ),
  ).toBe(false);
  expect(
    params(declareEventSocketCapabilities(base, { boundedCatalogChanges: true })).get(
      "catalogChanges",
    ),
  ).toBe("bounded-v1");
});

it("binds the resume cursor to its event epoch only for a resuming connection", () => {
  const resumed = remoteWebSocketUrl("https://host.test/api/x/", "t", 7, {
    threadItemInterests: ["a"],
  });
  const withEpoch = params(
    declareEventSocketCapabilities(resumed, {
      boundedCatalogChanges: false,
      resume: { lastSeenEpoch: "epoch-1" },
    }),
  );
  expect(withEpoch.get("lastSeenSeq")).toBe("7");
  expect(withEpoch.get("lastSeenEpoch")).toBe("epoch-1");
  expect(withEpoch.get("eventEpoch")).toBe("v1");
  expect(JSON.parse(withEpoch.get("threadItemInterests")!)).toEqual(["a"]);

  const liveOnly = params(
    declareEventSocketCapabilities(remoteWebSocketUrl("http://127.0.0.1:1/", "t", undefined), {
      boundedCatalogChanges: false,
    }),
  );
  expect(liveOnly.has("eventEpoch")).toBe(false);
  expect(liveOnly.has("lastSeenSeq")).toBe(false);
});

it("keeps an endpoint's path prefix and wss for https", () => {
  const url = new URL(remoteWebSocketUrl("https://host.test/api/environments/x/proxy", "t", 0));
  expect(url.protocol).toBe("wss:");
  expect(url.pathname).toBe("/api/environments/x/proxy/ws");
  expect(url.searchParams.get("lastSeenSeq")).toBe("0");
});
