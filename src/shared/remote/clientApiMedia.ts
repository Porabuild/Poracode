import { RemoteClientThreadsApi } from "./clientApiThreads";
import { endpointUrl } from "./clientTypes";
import { parseResponse } from "./clientParse";
import { readBoundedResponseBody } from "../http";
import { RemoteClientError } from "./clientErrors";
import {
  mediaTicketResultSchema,
  environmentMediaTicketResultSchema,
  type MediaFileRequest,
  type MediaSource,
  type EnvironmentMediaTicketResult,
} from "./media";

export abstract class RemoteClientMediaApi extends RemoteClientThreadsApi {
  /** Image actions reuse the issuing client's TLS pin and capped image-byte transport. */
  async fetchMediaImageBytes(
    source: MediaSource,
    signal?: AbortSignal,
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (!source.contentType.startsWith("image/"))
      throw new RemoteClientError("Not an image preview.", 415, "unsupported_media_type");
    const url = new URL(source.url);
    const expected = endpointUrl(this.endpoint, "/api/files/media");
    if (url.origin !== expected.origin || url.pathname !== expected.pathname)
      throw new RemoteClientError("Media owner mismatch.", 403, "invalid_media_owner");
    const response = await this.fetchImpl(url, {
      method: "GET",
      certFingerprint: this.pinnedCertFingerprint ?? null,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new RemoteClientError("Media image read failed.", response.status, "request_failed");
    }
    return new Uint8Array(await readBoundedResponseBody(response, this.maxResponseBodyBytes));
  }
  async releaseEnvironmentMediaTicket(environmentId: string, ticket: string): Promise<void> {
    await this.requestJson(`/api/environments/${encodeURIComponent(environmentId)}/media-release`, {
      method: "POST",
      body: { ticket },
    });
  }
  async createMediaSource(file: MediaFileRequest, signal?: AbortSignal): Promise<MediaSource> {
    const result = parseResponse(
      mediaTicketResultSchema,
      await this.requestJson("/api/files/media-ticket", {
        method: "POST",
        body: file,
        ...(signal ? { signal } : {}),
      }),
      "media ticket",
    );
    const url = endpointUrl(this.endpoint, "/api/files/media");
    url.searchParams.set("ticket", result.ticket);
    return { ...result, url: url.toString() };
  }

  async releaseMediaSource(ticket: string): Promise<void> {
    await this.requestJson("/api/files/media-release", { method: "POST", body: { ticket } });
  }

  async environmentMediaTicket(
    environmentId: string,
    childTicket: string,
  ): Promise<EnvironmentMediaTicketResult> {
    return parseResponse(
      environmentMediaTicketResultSchema,
      await this.requestJson(
        `/api/environments/${encodeURIComponent(environmentId)}/media-ticket`,
        { method: "POST", body: { childTicket } },
      ),
      "environment media ticket",
    );
  }
}
