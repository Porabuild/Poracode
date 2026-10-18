import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareOneShot } from "@/supervisor/oneShotSpawn";
import type { ManageModelProvidersPayload } from "@/shared/contracts";
import { manageDeepSeekModelProviders } from "./modelProviders";
import { DEEPSEEK_MODEL_PROVIDERS_BRIDGE } from "./modelProvidersBridge";

vi.mock("@/supervisor/oneShotSpawn", () => ({ prepareOneShot: vi.fn<typeof prepareOneShot>() }));
afterEach(() => vi.restoreAllMocks());
const payload = {
  agentKind: "deepseek",
  env: { kind: "native" },
  action: "save",
  create: true,
  revision: "revision",
  provider: {
    id: "fixture-route",
    name: "Fixture",
    baseURL: "http://localhost:8000/v1",
    protocol: "openai-completions",
    modelIds: ["model"],
  },
  apiKey: "fixture-secret",
} satisfies ManageModelProvidersPayload;

describe("DeepSeek native model provider management", () => {
  it.each([false, true])(
    "stages only code, writes the ACP profile, sends keys through stdin and cleans up (failure %s)",
    async (failure) => {
      let patchPath = "";
      const spawn = vi
        .fn<Awaited<ReturnType<typeof prepareOneShot>>["spawn"]>()
        .mockImplementation(async (_spec, input) => {
          expect(JSON.parse(input)).toEqual(payload);
          const directory = dirname(patchPath);
          expect(readFileSync(resolve(directory, "bridge.mjs"), "utf8")).toBe(
            DEEPSEEK_MODEL_PROVIDERS_BRIDGE,
          );
          expect(readFileSync(patchPath, "utf8")).not.toContain(payload.apiKey);
          if (failure) throw new Error("Sensitive diagnostic fixture-secret");
          return 'native startup banner\nPORACODE_MODEL_PROVIDERS_V1={"ok":true,"revision":"next","catalog":[],"providers":[]}';
        });
      vi.mocked(prepareOneShot).mockImplementation(async (_location, command) => {
        expect(command.args.slice(0, 3)).toEqual(["--profile", "acp", "--patch"]);
        expect(JSON.stringify(command)).not.toContain(payload.apiKey);
        patchPath = command.args[3]!;
        return { spec: { command: "fixture", args: [] }, spawn };
      });
      const result = await manageDeepSeekModelProviders(payload);
      expect(result).toEqual(
        failure
          ? { ok: false, reason: "rejected" }
          : { ok: true, revision: "next", catalog: [], providers: [] },
      );
      expect(existsSync(dirname(patchPath))).toBe(false);
    },
  );
  it("refuses malformed native results", async () => {
    vi.mocked(prepareOneShot).mockResolvedValue({
      spec: { command: "fixture", args: [] },
      spawn: vi
        .fn<Awaited<ReturnType<typeof prepareOneShot>>["spawn"]>()
        .mockResolvedValue('PORACODE_MODEL_PROVIDERS_V1={"ok":true,"providers":"bad"}'),
    });
    expect(
      await manageDeepSeekModelProviders({
        agentKind: "deepseek",
        env: { kind: "native" },
        action: "list",
      }),
    ).toEqual({ ok: false, reason: "rejected" });
  });
});
