import { msg } from "@/shared/messages";
import { object, rows, str, type ApiObject } from "./types";

export interface ForgeHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface ForgeHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}
export type ForgeHttp = (request: ForgeHttpRequest) => Promise<ForgeHttpResponse>;

function parseResponse(body: string): unknown {
  try {
    return body.trim() ? (JSON.parse(body) as unknown) : null;
  } catch {
    throw new Error(msg("forge.responseInvalid"));
  }
}

export class ForgeHttpError extends Error {
  constructor(
    readonly status: number,
    host: string,
  ) {
    super(msg("forge.http", { host, status }));
  }
}

/** All authenticated links and redirects remain inside the selected API root. */
export class ForgeApi {
  constructor(
    readonly baseUrl: string,
    private readonly headers: Record<string, string>,
    private readonly send: ForgeHttp,
  ) {}
  private url(path: string): URL {
    const root = new URL(`${this.baseUrl.replace(/\/$/, "")}/`);
    const url = new URL(path, root);
    if (
      url.origin !== root.origin ||
      !url.pathname.startsWith(root.pathname) ||
      url.username ||
      url.password
    ) {
      throw new Error(msg("forge.outsideApi"));
    }
    return url;
  }
  private async response(path: string, method = "GET", body?: unknown): Promise<ForgeHttpResponse> {
    let url = this.url(path);
    for (let redirects = 0; redirects < 4; redirects++) {
      const result = await this.send({
        url: url.href,
        method,
        headers: {
          Accept: "application/json",
          ...this.headers,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (
        [301, 302, 307, 308].includes(result.status) &&
        method === "GET" &&
        result.headers.location
      ) {
        url = this.url(new URL(result.headers.location, url).href);
        continue;
      }
      if (result.status < 200 || result.status >= 300)
        throw new ForgeHttpError(result.status, url.host);
      return result;
    }
    throw new Error(msg("forge.responseInvalid"));
  }
  async json(path: string, method = "GET", body?: unknown): Promise<ApiObject> {
    return object(await this.value(path, method, body));
  }
  async value(path: string, method = "GET", body?: unknown): Promise<unknown> {
    const result = await this.response(path, method, body);
    return parseResponse(result.body);
  }
  async text(path: string): Promise<string> {
    return (await this.response(path)).body;
  }
  async list(path: string, field?: "items" | "values" | "value"): Promise<ApiObject[]> {
    const result: ApiObject[] = [];
    const visited = new Set<string>();
    let next: string | undefined = path;
    while (next) {
      const url = this.url(next);
      if (visited.has(url.href) || visited.size >= 100) throw new Error(msg("forge.pagination"));
      visited.add(url.href);
      const response = await this.response(url.href);
      const raw = parseResponse(response.body);
      result.push(...rows(field ? object(raw)[field] : raw));
      const link = /<([^>]+)>;\s*rel="?next"?/i.exec(response.headers.link ?? "")?.[1];
      const cursor = field === "items" ? str(object(raw).next) : "";
      const token = response.headers["x-ms-continuationtoken"];
      if (link) next = new URL(link, url).href;
      else if (field === "values" && str(object(raw).next))
        next = new URL(str(object(raw).next), url).href;
      else if (cursor) {
        url.searchParams.set("after", cursor);
        next = url.href;
      } else if (token) {
        url.searchParams.set("continuationToken", token);
        next = url.href;
      } else next = undefined;
    }
    return result;
  }
}
