import type {
  CloseThreadPayload,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  SendThreadInputPayload,
  StartThreadPayload,
  WriteTerminalPayload,
} from "../shared/contracts";
import type { SupervisorReply, SupervisorRequest } from "../shared/ipc";
import {
  closeThreadPayloadSchema,
  resizeTerminalPayloadSchema,
  resolveThreadServerRequestPayloadSchema,
  sendThreadInputPayloadSchema,
  startThreadPayloadSchema,
  writeTerminalPayloadSchema,
} from "../shared/contracts";
import { SupervisorRuntime } from "./runtime";

const runtime = new SupervisorRuntime((event) => {
  process.send?.(event);
});

async function handleRequest(request: SupervisorRequest): Promise<unknown> {
  switch (request.type) {
    case "listWslDistros":
      return runtime.listWslDistros();
    case "getAgentStatuses":
      return runtime.getAgentStatuses();
    case "getThreadSnapshots":
      return runtime.getThreadSnapshots();
    case "startThread":
      return runtime.startThread(
        startThreadPayloadSchema.parse(request.payload) as StartThreadPayload,
      );
    case "sendThreadInput":
      return runtime.sendThreadInput(
        sendThreadInputPayloadSchema.parse(request.payload) as SendThreadInputPayload,
      );
    case "writeTerminal":
      return runtime.writeTerminal(
        writeTerminalPayloadSchema.parse(request.payload) as WriteTerminalPayload,
      );
    case "resizeTerminal":
      return runtime.resizeTerminal(
        resizeTerminalPayloadSchema.parse(request.payload) as ResizeTerminalPayload,
      );
    case "getThreadHistory":
      return runtime.getThreadHistory(request.payload.threadId);
    case "resolveThreadServerRequest":
      return runtime.resolveThreadServerRequest(
        resolveThreadServerRequestPayloadSchema.parse(
          request.payload,
        ) as ResolveThreadServerRequestPayload,
      );
    case "closeThread":
      return runtime.closeThread(
        closeThreadPayloadSchema.parse(request.payload) as CloseThreadPayload,
      );
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}

process.on("message", async (message: SupervisorRequest) => {
  const reply = await handleRequest(message)
    .then(
      (data): SupervisorReply => ({
        replyTo: message.id,
        ok: true,
        data,
      }),
    )
    .catch(
      (error: unknown): SupervisorReply => ({
        replyTo: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );

  process.send?.(reply);
});

process.on("disconnect", () => {
  runtime.dispose();
  process.exit(0);
});
