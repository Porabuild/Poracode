import { afterEach, expect, it } from "vitest";
import { canonicalToolPresentationCatalog } from "../../src/shared/canonicalToolPresentation.ts";
import { runtimePresentationDigest } from "../../src/host/remote/server/runtimeItemPresentationProjection.ts";
import { runtimeItemPresentationResponseSchema } from "../../src/shared/contracts/runtimeItemPresentation.ts";
import { controlRequest, pairAndAuth, startLab } from "./helpers/testClient.ts";
import {
  TOOL_PRESENTATION_FULL_RESULT,
  TOOL_PRESENTATION_LIVE_RESULT,
  TOOL_PRESENTATION_OUTPUT,
} from "./harness/toolPresentationFixtures.ts";

let lab: Awaited<ReturnType<typeof startLab>> | undefined;
afterEach(async () => {
  await lab?.stop();
  lab = undefined;
});

it("permits only an explicitly configured PWA origin on the disposable data peer", async () => {
  lab = await startLab({ browserOrigins: ["https://app-nightly.poracode.com"] });
  const url = new URL("oauth/token", lab.httpBaseUrl);
  const allowed = await fetch(url, {
    method: "OPTIONS",
    headers: {
      origin: "https://app-nightly.poracode.com",
      "access-control-request-headers": "authorization,content-type",
    },
  });
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get("access-control-allow-origin")).toBe(
    "https://app-nightly.poracode.com",
  );
  const other = await fetch(url, {
    method: "OPTIONS",
    headers: { origin: "https://unrelated.example" },
  });
  expect(other.headers.get("access-control-allow-origin")).toBeNull();
});

it("advertises the host catalog and retains complete canonical tool data across live/reopen reads", async () => {
  lab = await startLab();
  const environmentURL = new URL(".well-known/poracode/environment", lab.httpBaseUrl);
  expect((await (await fetch(environmentURL)).json()).toolPresentation).toBeUndefined();
  expect(
    (await controlRequest(lab, "/v1/checkpoints/tool-presentation-ready", { method: "POST" }))
      .status,
  ).toBe(200);
  expect((await (await fetch(environmentURL)).json()).toolPresentation).toEqual(
    canonicalToolPresentationCatalog(),
  );
  const { accessToken } = await pairAndAuth(lab);
  const headers = { authorization: "Bearer " + accessToken };
  const historyURL = new URL("api/threads/thread-fixture-001/history", lab.httpBaseUrl);
  const initial = await fetch(historyURL, { headers });
  expect(initial.status).toBe(200);
  const before = await initial.json();
  const items = before.runtimeItems as Array<Record<string, any>>;
  expect(items.find((item) => item.id === "tool-command")?.streams.command_output).toContain(
    TOOL_PRESENTATION_OUTPUT,
  );
  expect(items.find((item) => item.id === "tool-result")?.payload.result.detailedContent).toBe(
    TOOL_PRESENTATION_FULL_RESULT,
  );
  const command = items.find((item) => item.id === "tool-command")!;
  const inputDigest = runtimePresentationDigest(
    String(command.type),
    String(command.state),
    command.payload,
  );
  const headingsURL = new URL(
    "api/threads/thread-fixture-001/item-presentations?notices=v1",
    lab.httpBaseUrl,
  );
  const headings = await fetch(headingsURL, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, items: [{ itemId: command.id, inputDigest }] }),
  });
  expect(headings.status).toBe(200);
  expect(runtimeItemPresentationResponseSchema.parse(await headings.json()).items[0]).toMatchObject(
    {
      status: "ready",
      header: {
        command: { kind: "view", title: { kind: "view", text: "src/App.tsx", lines: "5-12" } },
      },
    },
  );
  const mcp = items.find((item) => item.id === "tool-result")!;
  const mcpHeadings = await fetch(headingsURL, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      version: 2,
      items: [
        {
          itemId: mcp.id,
          inputDigest: runtimePresentationDigest(
            String(mcp.type),
            String(mcp.state),
            mcp.payload,
            2,
          ),
        },
      ],
    }),
  });
  expect(mcpHeadings.status).toBe(200);
  expect(runtimeItemPresentationResponseSchema.parse(await mcpHeadings.json())).toMatchObject({
    version: 2,
    items: [{ header: { tool: { kind: "mcp", title: "workspace docs: search" } } }],
  });
  expect(
    (await controlRequest(lab, "/v1/checkpoints/tool-presentation-live", { method: "POST" }))
      .status,
  ).toBe(200);
  const after = await (await fetch(historyURL, { headers })).json();
  expect(
    after.runtimeItems.find((item: { id: string }) => item.id === "tool-result").payload.result
      .detailedContent,
  ).toBe(TOOL_PRESENTATION_LIVE_RESULT);
  expect(after.runtimeItems.find((item: { id: string }) => item.id === "tool-command")).toEqual(
    items.find((item) => item.id === "tool-command"),
  );
});
