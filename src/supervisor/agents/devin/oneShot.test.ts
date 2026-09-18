import type { DevinModelFamily } from "./models";
import type { loadDevinModels } from "./modelCatalog";
import type { prepareOneShot, spawnAgent } from "../../oneShotSpawn";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  cached: vi.fn<() => DevinModelFamily[]>(() => []),
  load: vi.fn<typeof loadDevinModels>(),
  spawn: vi.fn<typeof spawnAgent>().mockResolvedValue("OK"),
  prepare: vi.fn<typeof prepareOneShot>(),
}));
vi.mock("./modelCatalog", () => ({ cachedDevinModels: mocks.cached, loadDevinModels: mocks.load }));
vi.mock("../../oneShotSpawn", () => ({ prepareOneShot: mocks.prepare }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/bin/devin" }));
import { runDevinOneShot } from "./oneShot";
it("loads a cold catalog before resolving utility effort and Fast", async () => {
  mocks.load.mockResolvedValue([
    {
      id: "representative",
      label: "Family",
      variants: [
        {
          id: "representative",
          effort: "medium",
          fast: false,
          thinking: false,
          context: "default",
        },
        { id: "opaque-priority", effort: "high", fast: true, thinking: false, context: "default" },
      ],
    },
  ]);
  mocks.prepare.mockReturnValue({
    spec: { command: "devin", args: [], cwd: "/tmp" },
    spawn: mocks.spawn,
  });
  const location = { kind: "posix" as const, path: "/project" };
  await expect(
    runDevinOneShot({
      location,
      model: "representative",
      effort: "high",
      fast: true,
      prompt: "title",
    }),
  ).resolves.toBe("OK");
  expect(mocks.load).toHaveBeenCalledWith(location, "/bin/devin", undefined);
  expect(mocks.prepare).toHaveBeenCalledWith(
    location,
    expect.objectContaining({
      args: expect.arrayContaining(["--model", "opaque-priority"]),
      isolateCwd: true,
    }),
  );
});
