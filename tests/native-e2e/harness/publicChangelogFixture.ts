import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { changelogDocumentSchema } from "../../../src/shared/changelog.ts";
import { writeJson } from "./httpIo.ts";
import { assertSecretFree } from "./secrets.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../protocol/remote/v3/fixtures/client-changelog.json", import.meta.url),
    "utf8",
  ),
) as { document: unknown };
const document = changelogDocumentSchema.parse(fixture.document);
const updated = {
  releases: [
    {
      version: "1.11.0",
      date: "2026-04-01",
      title: "Updated release notes",
      summary: "Keep saved notes available after relaunch.",
      changes: [{ kind: "improved", text: "Refresh without losing existing notes." }],
    },
    ...document.releases,
  ],
};

type Mode = "good" | "updated" | "error" | "invalid" | "hold" | "trickle";

/** Public publisher data, isolated from paired-host state and authenticated controls. */
export class PublicChangelogFixture {
  private mode: Mode = "good";
  private readonly pending = new Set<ServerResponse>();
  private readonly streaming = new Set<ServerResponse>();

  state(): { heldReads: number; streamingReads: number } {
    return { heldReads: this.pending.size, streamingReads: this.streaming.size };
  }

  applyCheckpoint(id: string): boolean {
    const mode = id.replace(/^changelog-/, "");
    if (!id.startsWith("changelog-") || !isMode(mode)) return false;
    this.mode = mode;
    if (mode !== "hold") {
      for (const response of this.pending) this.respond(response);
      this.pending.clear();
    }
    return true;
  }

  respond(response: ServerResponse): void {
    if (this.mode === "hold") {
      this.pending.add(response);
      response.once("close", () => this.pending.delete(response));
      return;
    }
    if (this.mode === "trickle") {
      this.streaming.add(response);
      response.writeHead(200, { "content-type": "application/json" });
      response.write(" ");
      const timer = setInterval(() => response.write(" "), 200);
      response.once("close", () => {
        clearInterval(timer);
        this.streaming.delete(response);
      });
      return;
    }
    const body =
      this.mode === "updated" ? updated : this.mode === "invalid" ? { releases: null } : document;
    assertSecretFree(body, "public-changelog-fixture");
    writeJson(response, this.mode === "error" ? 503 : 200, body);
  }

  reset(): void {
    this.mode = "good";
    for (const response of this.pending) response.destroy();
    this.pending.clear();
    for (const response of this.streaming) response.destroy();
    this.streaming.clear();
  }
}

function isMode(value: string): value is Mode {
  return ["good", "updated", "error", "invalid", "hold", "trickle"].includes(value);
}
