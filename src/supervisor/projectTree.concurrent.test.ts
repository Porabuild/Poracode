import { linkSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { ProjectTreeService } from "./projectTree";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it.each(["project", "external", "hardlink"] as const)(
  "allows only one concurrent save against the same baseline through %s editing",
  async (secondEditor) => {
    const directory = mkdtempSync(join(tmpdir(), "poracode-concurrent-save-"));
    directories.push(directory);
    const file = join(directory, "shared.txt");
    writeFileSync(file, "original\n");
    // Separate the baseline from current time so this case tests the async
    // check/write race independently of filesystem timestamp granularity.
    utimesSync(file, new Date(2000, 0, 1), new Date(2000, 0, 1));
    const projectLocation: ProjectLocation =
      process.platform === "win32"
        ? { kind: "windows", path: directory }
        : { kind: "posix", path: directory };
    const service = new ProjectTreeService();
    const secondService = new ProjectTreeService();
    if (secondEditor === "hardlink") linkSync(file, join(directory, "alias.txt"));
    const baseline = await service.readProjectFile({ projectLocation, path: "shared.txt" });
    const edits = ["client A\n", "client B\n"];
    const secondPayload = {
      projectLocation,
      content: edits[1]!,
      baseModifiedAtMs: baseline.modifiedAtMs,
    };
    const outcomes = await Promise.allSettled([
      service.writeProjectFile({
        projectLocation,
        path: "shared.txt",
        content: edits[0]!,
        baseModifiedAtMs: baseline.modifiedAtMs,
      }),
      secondEditor === "external"
        ? secondService.writeExternalFile({ ...secondPayload, absolutePath: file })
        : secondService.writeProjectFile({
            ...secondPayload,
            path: secondEditor === "hardlink" ? "alias.txt" : "shared.txt",
          }),
    ]);
    const winners = outcomes.flatMap((outcome, index) =>
      outcome.status === "fulfilled" ? [index] : [],
    );
    expect(winners).toHaveLength(1);
    expect(readFileSync(file, "utf8")).toBe(edits[winners[0]!]);
    const loser = outcomes.find((outcome) => outcome.status === "rejected");
    expect(loser?.status === "rejected" ? String(loser.reason) : "").toContain("changed on disk");
    const refreshed = await secondService.readProjectFile({ projectLocation, path: "shared.txt" });
    await secondService.writeProjectFile({
      projectLocation,
      path: "shared.txt",
      content: "retry after reload\n",
      baseModifiedAtMs: refreshed.modifiedAtMs,
    });
    expect(readFileSync(file, "utf8")).toBe("retry after reload\n");
  },
);
