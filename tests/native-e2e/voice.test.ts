import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { controlRequest, pairAndAuth, startLab } from "./helpers/testClient.ts";

let lab: Awaited<ReturnType<typeof startLab>> | undefined;
afterEach(async () => {
  await lab?.stop();
  lab = undefined;
});

it("qualifies native host-voice setup, model preparation and bounded WAV upload through the existing contract", async () => {
  lab = await startLab();
  expect(
    (await controlRequest(lab, "/v1/checkpoints/voice-ready", { method: "POST" })).status,
  ).toBe(200);
  const { accessToken } = await pairAndAuth(lab);
  const call = async (payload: Record<string, unknown>) => {
    const response = await fetch(new URL("api/git/call", lab!.httpBaseUrl), {
      method: "POST",
      headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
      body: JSON.stringify({ procedure: "hexVoice", payload }),
    });
    expect(response.status).toBe(200);
    return (await response.json()).result;
  };
  expect((await call({ action: "setup" })).setup.engine.state).toBe("missing");
  expect((await call({ action: "install" })).setup.engine.state).toBe("installed");
  expect((await call({ action: "list", language: "en" })).models[0].verified).toBe(false);
  const preparation = randomUUID();
  expect(
    (await call({ action: "prepare", id: preparation, model: "parakeet_v3", language: "en" })).job
      .id,
  ).toBe(preparation);
  expect((await call({ action: "list", language: "en" })).models[0].verified).toBe(true);
  const id = randomUUID();
  expect(
    (await call({ action: "begin", id, model: "parakeet_v3", language: "en" })).job.phase,
  ).toBe("uploading");
  const wav = Buffer.from([
    82, 73, 70, 70, 38, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 128,
    62, 0, 0, 0, 125, 0, 0, 2, 0, 16, 0, 100, 97, 116, 97, 2, 0, 0, 0, 0, 0,
  ]);
  expect(
    (await call({ action: "append", id, offset: 0, audioBase64: wav.toString("base64") })).job.id,
  ).toBe(id);
  expect(
    (await call({ action: "append", id, offset: 0, audioBase64: wav.toString("base64") })).code,
  ).toBe("invalid_request");
  expect((await call({ action: "finish", id })).job.transcript).toBe("Fixture host transcript");
  expect((await call({ action: "cancel", id })).kind).toBe("cancelled");
  expect((await call({ action: "remove_engine" })).setup.engine.state).toBe("missing");
  expect((await call({ action: "list", language: "en" })).models[0].installed).toBe(true);
});
