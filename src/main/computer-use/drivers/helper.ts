import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { z } from "zod";
import {
  COMPUTER_USE_HELPER_PROTOCOL_VERSION,
  computerUseHelperHelloSchema,
  type ComputerUseHelperHello,
} from "@/shared/contracts/computerUse";
import type {
  ComputerUseApp,
  ComputerUseDriver,
  ComputerUseDeliveryReport,
  ComputerUseDriverStatus,
  ComputerUseFindElementsResult,
  ComputerUseInvocableElementAction,
  ComputerUseInteractiveResult,
  ComputerUseRefusal,
  ComputerUseWindow,
  ComputerUseWindowState,
} from "../mcp/types";
import { COMPUTER_USE_REFUSAL_CODES } from "../mcp/types";
import { HostUnavailableError, JsonLineActionError, PersistentJsonLineHost } from "./jsonLineHost";

export type HelperUnavailableCode = "protocol_mismatch" | "handshake_failed";

export class HelperUnavailableError extends Error {
  readonly code: HelperUnavailableCode;

  constructor(code: HelperUnavailableCode, message: string) {
    super(message);
    this.name = "HelperUnavailableError";
    this.code = code;
  }
}

const windowSchema = z
  .object({
    app: z.string(),
    id: z.number(),
    title: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .passthrough();

const deliverySchema = z.object({
  delivered: z.enum(["background", "foreground"]),
  route: z.enum(["accessibility", "message", "event", "input"]),
  target: z
    .object({
      kind: z.string(),
      id: z.string(),
      role: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  verified: z.enum(["confirmed", "unverified", "unchanged"]),
  notes: z.array(z.string()).optional(),
});

const refusalSchema = z.object({
  code: z.enum(COMPUTER_USE_REFUSAL_CODES),
  reason: z.string(),
  hint: z.string(),
});

const interactiveResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    mode: z.literal("interactive"),
    window: windowSchema.optional(),
    delivery: deliverySchema,
  }),
  z.object({
    ok: z.literal(false),
    mode: z.literal("interactive"),
    window: windowSchema.optional(),
    refused: refusalSchema,
  }),
]);

export interface HelperComputerUseDriverOptions {
  binaryPath: string;
  requestTimeoutMs?: number;
  spawn?: () => ChildProcessWithoutNullStreams;
  stateDir: string;
}

export class HelperComputerUseDriver implements ComputerUseDriver {
  private readonly host: PersistentJsonLineHost;
  private helloPromise: Promise<ComputerUseHelperHello> | null = null;

  constructor(private readonly options: HelperComputerUseDriverOptions) {
    this.host = new PersistentJsonLineHost({
      label: "computer-use helper",
      maxStdoutBufferBytes: 64 * 1024 * 1024,
      ...(options.requestTimeoutMs !== undefined
        ? { requestTimeoutMs: options.requestTimeoutMs }
        : {}),
      spawn:
        options.spawn ??
        (() =>
          spawn(options.binaryPath, ["--state-dir", options.stateDir], {
            windowsHide: true,
          })),
      onTeardown: () => {
        this.helloPromise = null;
      },
    });
  }

  dispose(): void {
    this.host.dispose();
    this.helloPromise = null;
  }

  async describeStatus(): Promise<ComputerUseDriverStatus> {
    const helper = await this.ensureHello();
    return {
      backend: "helper",
      helper,
      capabilities: helper.capabilities,
      permissions: helper.permissions,
      notes: helper.notes,
    };
  }

  listApps(): Promise<ComputerUseApp[]> {
    return this.call("list_apps");
  }

  listWindows(): Promise<ComputerUseWindow[]> {
    return this.call("list_windows");
  }

  getWindow(input: { app?: string; id: number }): Promise<ComputerUseWindow> {
    return this.call("get_window", input);
  }

  getWindowState(
    input: Parameters<ComputerUseDriver["getWindowState"]>[0],
  ): Promise<ComputerUseWindowState> {
    return this.call("get_window_state", input);
  }

  activateWindow(
    input: Parameters<ComputerUseDriver["activateWindow"]>[0],
  ): Promise<ComputerUseInteractiveResult> {
    return this.callInteractive("activate_window", input);
  }

  click(input: Parameters<ComputerUseDriver["click"]>[0]): Promise<ComputerUseInteractiveResult> {
    return this.callInteractive("click", input);
  }

  typeText(
    input: Parameters<ComputerUseDriver["typeText"]>[0],
  ): Promise<ComputerUseInteractiveResult> {
    return this.callInteractive("type_text", input);
  }

  pressKey(
    input: Parameters<ComputerUseDriver["pressKey"]>[0],
  ): Promise<ComputerUseInteractiveResult> {
    return this.callInteractive("press_key", input);
  }

  scroll(input: Parameters<ComputerUseDriver["scroll"]>[0]): Promise<ComputerUseInteractiveResult> {
    return this.callInteractive("scroll", input);
  }

  drag(input: Parameters<ComputerUseDriver["drag"]>[0]): Promise<ComputerUseInteractiveResult> {
    return this.callInteractive("drag", input);
  }

  launchApp(
    input: Parameters<ComputerUseDriver["launchApp"]>[0],
  ): ReturnType<ComputerUseDriver["launchApp"]> {
    return this.call("launch_app", input);
  }

  findElements(
    input: Parameters<ComputerUseDriver["findElements"]>[0],
  ): Promise<ComputerUseFindElementsResult | ComputerUseInteractiveResult> {
    return this.call("find_elements", input);
  }

  invokeElement(input: {
    action: ComputerUseInvocableElementAction;
    element_id: string;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
    return this.callInteractive("invoke_element", input);
  }

  setElementValue(
    input: Parameters<ComputerUseDriver["setElementValue"]>[0],
  ): Promise<ComputerUseInteractiveResult> {
    return this.callInteractive("set_element_value", input);
  }

  private async ensureHello(): Promise<ComputerUseHelperHello> {
    this.helloPromise ??= this.host
      .request("hello", {
        protocolVersion: COMPUTER_USE_HELPER_PROTOCOL_VERSION,
        clientVersion: "poracode",
      })
      .then((value) => {
        const hello = computerUseHelperHelloSchema.safeParse(value);
        if (!hello.success) {
          throw new HelperUnavailableError(
            "handshake_failed",
            `computer-use helper returned an invalid handshake: ${hello.error.message}`,
          );
        }
        if (hello.data.protocolVersion !== COMPUTER_USE_HELPER_PROTOCOL_VERSION) {
          throw new HelperUnavailableError(
            "protocol_mismatch",
            `computer-use helper protocol ${hello.data.protocolVersion} does not match client protocol ${COMPUTER_USE_HELPER_PROTOCOL_VERSION}`,
          );
        }
        return hello.data;
      })
      .catch((error: unknown) => {
        this.helloPromise = null;
        if (error instanceof HelperUnavailableError) {
          throw error;
        }
        if (error instanceof HostUnavailableError) {
          throw new HelperUnavailableError("handshake_failed", error.message);
        }
        if (error instanceof JsonLineActionError && error.code === "protocol_mismatch") {
          throw new HelperUnavailableError("protocol_mismatch", error.message);
        }
        throw new HelperUnavailableError(
          "handshake_failed",
          error instanceof Error ? error.message : String(error),
        );
      });
    return await this.helloPromise;
  }

  private async call<T>(action: string, input?: unknown): Promise<T> {
    await this.ensureHello();
    return await this.host.request<T>(action, input);
  }

  private async callInteractive(
    action: string,
    input: unknown,
  ): Promise<ComputerUseInteractiveResult> {
    const result = interactiveResultSchema.parse(await this.call(action, input));
    if (result.ok) {
      return {
        ok: true,
        mode: "interactive",
        ...(result.window ? { window: result.window as ComputerUseWindow } : {}),
        delivery: result.delivery as ComputerUseDeliveryReport,
      };
    }
    return {
      ok: false,
      mode: "interactive",
      ...(result.window ? { window: result.window as ComputerUseWindow } : {}),
      refused: result.refused as ComputerUseRefusal,
    };
  }
}
