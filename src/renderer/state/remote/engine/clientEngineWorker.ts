import {
  CLIENT_ENGINE_MAX_PENDING,
  CLIENT_ENGINE_PROTOCOL_VERSION,
  type ClientEngineRequest,
  type ClientEngineResponse,
  type ClientEngineWorkRequest,
} from "./protocol";
import {
  decodeBackendRendererFrame,
  decodeRemoteSocketFrame,
  parseJsonValue,
  stringifyJsonValue,
} from "./decode";

let generation = 0;
const unanswered = new Set<number>();

self.onmessage = (event: MessageEvent<ClientEngineRequest>) => {
  const request = event.data;
  if (!request || request.v !== CLIENT_ENGINE_PROTOCOL_VERSION) return;
  if (request.type === "reset") {
    unanswered.clear();
    generation = request.generation;
    return;
  }
  if (request.generation !== generation) return;
  if (request.type === "ack") {
    unanswered.delete(request.id);
    return;
  }
  if (unanswered.size >= CLIENT_ENGINE_MAX_PENDING) {
    post({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation,
      type: "overflow",
    });
    return;
  }
  unanswered.add(request.id);
  post(handleWork(request));
};

function handleWork(request: ClientEngineWorkRequest): ClientEngineResponse {
  const base = {
    v: CLIENT_ENGINE_PROTOCOL_VERSION,
    generation: request.generation,
    id: request.id,
  } as const;
  if (request.type === "decode-backend") {
    const result = decodeBackendRendererFrame(request.raw);
    return result.ok
      ? { ...base, type: "decode-backend", ok: true, message: result.message }
      : { ...base, type: "decode-backend", ok: false, error: "invalid" };
  }
  if (request.type === "decode-remote") {
    const result = decodeRemoteSocketFrame(request.raw);
    return result.ok
      ? { ...base, type: "decode-remote", ok: true, message: result.message }
      : { ...base, type: "decode-remote", ok: false, error: "invalid" };
  }
  if (request.type === "parse-json") {
    const result = parseJsonValue(request.raw);
    return result.ok
      ? { ...base, type: "parse-json", ok: true, value: result.value }
      : { ...base, type: "parse-json", ok: false, error: "invalid" };
  }
  const result = stringifyJsonValue(request.value);
  return result.ok
    ? { ...base, type: "stringify-json", ok: true, json: result.json }
    : { ...base, type: "stringify-json", ok: false, error: "invalid" };
}

function post(response: ClientEngineResponse): void {
  self.postMessage(response);
}
