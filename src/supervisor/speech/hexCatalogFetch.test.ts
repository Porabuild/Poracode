import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Hex from "@kitlangton/hex";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hexCatalogFetch } from "./hexCatalogFetch";

function entry(id: string, name: string) {
  return {
    id,
    name,
    installed: false,
    verified: false,
    managed: false,
    downloadBytes: 739_508_576,
    languages: ["en"],
    supportsLanguageDetection: false,
  };
}

// The catalog the Hex 3.1.1 Windows engine returns for `GET /models?language=en`.
const HEX_3_1_1_CATALOG = [
  entry("parakeet_unified_en", "Parakeet Unified English"),
  entry("parakeet_v2", "Parakeet v2"),
  entry("parakeet_v3", "Parakeet v3"),
  entry("whisper_large_v3_turbo", "Whisper large-v3-turbo"),
  entry("qwen3_asr06_b", "Qwen3-ASR 0.6B"),
  entry("qwencleo_asr_1_7b", "QwenCleo-ASR 1.7B"),
  entry("sense_voice_small", "SenseVoice Small"),
  entry("cohere_transcribe", "Cohere Transcribe"),
  entry("underdog_bark_3_pro", "Underdog Bark 3.0 Pro"),
  entry("underdog_bark_3_clean", "Underdog Bark 3.0 Clean"),
];
const SDK_KNOWN_IDS = [
  "parakeet_unified_en",
  "parakeet_v2",
  "parakeet_v3",
  "whisper_large_v3_turbo",
  "qwen3_asr06_b",
  "sense_voice_small",
  "cohere_transcribe",
];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function engineTransport(catalog: unknown) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/health") return jsonResponse({ version: "3.1.1", apiVersion: "2" });
    if (url.pathname === "/models") return jsonResponse(catalog);
    return new Response("not found", { status: 404 });
  });
}

const directories: string[] = [];

async function connect(transport: typeof fetch) {
  const directory = await mkdtemp(join(tmpdir(), "hex-catalog-"));
  directories.push(directory);
  const discoveryPath = join(directory, "local-api.json");
  await writeFile(
    discoveryPath,
    JSON.stringify({ port: 49999, token: "t".repeat(32), apiVersion: "2", pid: 4242 }),
  );
  return Hex.connect({ discoveryPath, fetch: transport });
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("hexCatalogFetch", () => {
  it("lets the pinned SDK read a Hex 3.1.1 catalog that lists models it does not know", async () => {
    const unwrapped = await connect(engineTransport(HEX_3_1_1_CATALOG));
    await expect(unwrapped.models.list({ language: "en" })).rejects.toMatchObject({
      code: "invalid-response",
    });

    const client = await connect(hexCatalogFetch(engineTransport(HEX_3_1_1_CATALOG)));
    const models = await client.models.list({ language: "en" });
    expect(models.map((model) => model.id)).toEqual(SDK_KNOWN_IDS);
  });

  it("still lets the SDK reject a malformed catalog entry", async () => {
    const client = await connect(
      hexCatalogFetch(engineTransport([entry("parakeet_v3", "Parakeet v3"), { name: "broken" }])),
    );
    await expect(client.models.list({ language: "en" })).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  it("passes other requests and failed catalog responses through untouched", async () => {
    const failed = new Response("busy", { status: 503 });
    const health = jsonResponse({ version: "3.1.1", apiVersion: "2" });
    const prepare = jsonResponse({ ok: true });
    const transport = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/health") return health;
      if (init?.method === "POST") return prepare;
      return failed;
    });
    const wrapped = hexCatalogFetch(transport);

    await expect(wrapped("http://127.0.0.1:1/health")).resolves.toBe(health);
    await expect(
      wrapped("http://127.0.0.1:1/models/parakeet_v3/prepare?language=en", { method: "POST" }),
    ).resolves.toBe(prepare);
    await expect(wrapped("http://127.0.0.1:1/models?language=en")).resolves.toBe(failed);
  });
});
