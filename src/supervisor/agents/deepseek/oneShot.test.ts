import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEEPSEEK_OFFICIAL_FLASH_MODEL_ID } from "@/shared/agents/deepseekModels";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareOneShot } from "@/supervisor/oneShotSpawn";
import * as binaryResolver from "../binaryResolver";
import { deepSeekOneShotSelection, runDeepSeekOneShot } from "./oneShot";
import { DEEPSEEK_GENERATION_POLICY } from "./oneShotPolicy";

vi.mock("@/supervisor/oneShotSpawn", () => ({ prepareOneShot: vi.fn<typeof prepareOneShot>() }));

afterEach(() => vi.restoreAllMocks());

const location = { kind: "posix", path: process.cwd() } as const;
const input = {
  location,
  selection: { model: DEEPSEEK_OFFICIAL_FLASH_MODEL_ID, effort: "low", fast: false },
  prompt: "Generate a title",
  readOnlyWorkspace: true,
};

describe("DeepSeek headless generation", () => {
  it("decodes only the native route tuple and preserves provider-owned values", () => {
    expect(
      deepSeekOneShotSelection('["custom-route","model/with space"]', "custom-effort"),
    ).toEqual({
      provider: "custom-route",
      model: "model/with space",
      reasoningEffort: "custom-effort",
    });
    expect(deepSeekOneShotSelection(DEEPSEEK_OFFICIAL_FLASH_MODEL_ID, "")).toEqual({
      provider: "deepseek-official",
      model: "deepseek-flash",
    });
  });

  it.each(["", "plain-model", "{}", '["provider"]', '["provider",""]', '["provider",123]'])(
    "rejects an invalid route before staging or spawning (%s)",
    async (model) => {
      await expect(runDeepSeekOneShot({ ...input, selection: { model } })).rejects.toThrow(
        "provider/model route",
      );
      expect(prepareOneShot).not.toHaveBeenCalled();
    },
  );

  it("refuses unsupported selection controls before performing effects", async () => {
    await expect(
      runDeepSeekOneShot({ ...input, selection: { ...input.selection, fast: true } }),
    ).rejects.toMatchObject({ name: "UnsupportedOneShotControlError" });
    expect(prepareOneShot).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "uses stdin, saved credentials, read-only execution, and removes the overlay (spawn failure: %s)",
    async (fails) => {
      vi.spyOn(binaryResolver, "resolveAgentBinaryPath").mockReturnValue("/tools/dsh");
      let patchPath = "";
      let policyPath = "";
      const spawn = vi
        .fn<Awaited<ReturnType<typeof prepareOneShot>>["spawn"]>()
        .mockImplementation(async (_spec, prompt) => {
          expect(prompt).toBe(input.prompt);
          const patch = JSON.parse(readFileSync(patchPath, "utf8")) as Array<{
            insert?: Array<{ name: string }>;
          }>;
          const policyName = patch.find((entry) => entry.insert)?.insert?.[0]?.name ?? "";
          expect(policyName).toBe("./policy.mjs");
          policyPath = resolve(dirname(patchPath), policyName);
          expect(readFileSync(policyPath, "utf8")).toBe(DEEPSEEK_GENERATION_POLICY);
          expect(patch).toEqual([
            {
              id: "agent-default-model",
              config: {
                provider: "deepseek-official",
                model: "deepseek-flash",
                reasoningEffort: "low",
              },
            },
            { id: "session-title-llm", disabled: true },
            { id: "headless-runner", inject: ["headlessStartup", "poracodeGenerationPolicy"] },
            { id: "credentials", disabled: false },
            { id: "authorization", disabled: false },
            { id: "deepseek-account", disabled: false },
            {
              insert: [
                {
                  id: "poracode-generation-policy",
                  name: "./policy.mjs",
                  config: { readOnlyWorkspace: true },
                },
              ],
            },
          ]);
          if (fails) throw new Error("headless fixture failed");
          return "Generated title";
        });
      vi.mocked(prepareOneShot).mockImplementation(async (_location, command) => {
        expect(command.command).toBe("/tools/dsh");
        expect(command.env).toEqual({ DSH_PERMISSION_MODE: "read-only" });
        expect(command.args).toEqual(["--profile", "headless", "--patch", expect.any(String), "-"]);
        patchPath = command.args[3]!;
        return { spec: { command: command.command, args: command.args }, spawn };
      });
      const result = await runDeepSeekOneShot(input).then(
        (text) => ({ text }),
        (error: Error) => ({ error: error.message }),
      );
      expect(result).toEqual(
        fails ? { error: "headless fixture failed" } : { text: "Generated title" },
      );
      expect(spawn).toHaveBeenCalledOnce();
      expect(existsSync(patchPath)).toBe(false);
      expect(existsSync(policyPath)).toBe(false);
    },
  );

  it("honors an already cancelled invocation before staging", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runDeepSeekOneShot({ ...input, signal: controller.signal })).rejects.toBeDefined();
    expect(prepareOneShot).not.toHaveBeenCalled();
  });

  const catalogLog =
    "[llm-deepseek-account] model listing from https://api.deepseek.com/models loaded 2 model(s), skipped 0 row(s)";
  it.each([
    ["ordinary output", "Generated title", "Generated title"],
    ["account startup", `${catalogLog}\nGenerated title`, "Generated title"],
    ["Windows line endings", `${catalogLog}\r\nGenerated title\r\n`, "Generated title"],
    ["repeated catalogs", `${catalogLog}\n${catalogLog}\nGenerated title`, "Generated title"],
    ["diagnostic without a reply", catalogLog, ""],
    ["quoted body text", `Generated title\n${catalogLog}`, `Generated title\n${catalogLog}`],
    ["other output", "[other] startup\nGenerated title", "[other] startup\nGenerated title"],
  ])("keeps only the generated text after %s", async (_label, stdout, expected) => {
    vi.mocked(prepareOneShot).mockResolvedValue({
      spec: { command: "dsh", args: [] },
      spawn: vi.fn<Awaited<ReturnType<typeof prepareOneShot>>["spawn"]>().mockResolvedValue(stdout),
    });
    expect(await runDeepSeekOneShot(input)).toBe(expected);
  });
});
