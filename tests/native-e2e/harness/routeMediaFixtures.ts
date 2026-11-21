import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { LabHttpError } from "./labAuth.ts";
import { FIXTURE_MEDIA_TICKET } from "./schemaExamples.ts";

export const FIXTURE_ATTACHMENT_BYTES = Buffer.from(
  "Download from the paired transcript fixture.\n",
);

export type FixtureFileMedia = { bytes: Buffer; contentType: string; attachmentName?: string };

export class LabTranscriptMediaFixtures {
  private attachmentWait: Promise<void> | undefined;
  private finishAttachmentWait: (() => void) | undefined;
  private readonly fixtureMediaTickets = new Map<string, FixtureFileMedia>();
  private transcriptVideo: Buffer | undefined;
  private transcriptPdf: Buffer | undefined;
  private transcriptTextDownload: { path: string; name: string; bytes: Buffer } | undefined;

  fileMediaForTicket(ticket: unknown): FixtureFileMedia | undefined {
    return typeof ticket === "string" ? this.fixtureMediaTickets.get(ticket) : undefined;
  }

  prepareTranscriptVideo(): void {
    // A small generated AVC test pattern. No desktop file is read for these tickets.
    this.transcriptVideo = readFileSync(
      new URL("../fixtures/transcript-video.mp4", import.meta.url),
    );
  }

  prepareTranscriptPdf(): void {
    this.transcriptPdf = readFileSync(
      new URL("../fixtures/transcript-preview.pdf", import.meta.url),
    );
  }

  prepareTranscriptTextDownload(path: string, content: string): void {
    this.transcriptTextDownload = {
      path,
      name: path.slice(path.lastIndexOf("/") + 1),
      bytes: Buffer.from(content),
    };
  }

  holdAttachment(): void {
    this.releaseAttachment();
    this.attachmentWait = new Promise((resolve) => {
      this.finishAttachmentWait = resolve;
    });
  }

  releaseAttachment(): void {
    this.finishAttachmentWait?.();
    this.finishAttachmentWait = undefined;
    this.attachmentWait = undefined;
  }

  async waitForAttachment(): Promise<void> {
    await this.attachmentWait;
  }

  reset(): void {
    this.releaseAttachment();
    this.fixtureMediaTickets.clear();
    this.transcriptVideo = undefined;
    this.transcriptPdf = undefined;
    this.transcriptTextDownload = undefined;
  }

  issueTicket(body: Record<string, unknown>, fallbackBytes: Buffer): Record<string, unknown> {
    const fixturePath = "reports/transcript-video.mp4";
    const video =
      typeof body.path === "string" &&
      (body.path === fixturePath || body.path.endsWith(`/${fixturePath}`))
        ? this.transcriptVideo
        : undefined;
    const pdfPath = "reports/transcript-preview.pdf";
    const pdf =
      typeof body.path === "string" && (body.path === pdfPath || body.path.endsWith(`/${pdfPath}`))
        ? this.transcriptPdf
        : undefined;
    const attachment = body.disposition === "attachment";
    const text = attachment ? this.transcriptTextDownload : undefined;
    if (text && (body.path !== text.path || body.access !== "project")) {
      throw new LabHttpError("file_not_found", "The fixture attachment was not found.", 404);
    }
    if (video || pdf || attachment) {
      const ticket = `pc_media_${randomBytes(32).toString("base64url")}`;
      const media: FixtureFileMedia = {
        bytes: text?.bytes ?? video ?? pdf ?? FIXTURE_ATTACHMENT_BYTES,
        contentType: attachment
          ? "application/octet-stream"
          : pdf
            ? "application/pdf"
            : "video/mp4",
        ...(attachment
          ? {
              attachmentName:
                text?.name ??
                (video
                  ? "transcript-video.mp4"
                  : pdf
                    ? "transcript-preview.pdf"
                    : "transcript-test.txt"),
            }
          : {}),
      };
      this.fixtureMediaTickets.set(ticket, media);
      return {
        ticket,
        expiresAt:
          video || pdf ? new Date(Date.now() + 120_000).toISOString() : "2099-01-01T00:00:00.000Z",
        sizeBytes: media.bytes.length,
        modifiedAtMs: 1,
        contentType: media.contentType,
      };
    }
    return {
      ticket: FIXTURE_MEDIA_TICKET,
      expiresAt: "2099-01-01T00:00:00.000Z",
      sizeBytes: fallbackBytes.length,
      modifiedAtMs: 1,
      contentType: "image/png",
    };
  }

  releaseTicket(ticket: unknown): void {
    if (typeof ticket === "string") this.fixtureMediaTickets.delete(ticket);
  }
}
