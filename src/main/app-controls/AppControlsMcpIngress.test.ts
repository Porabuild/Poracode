import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScheduledTask, ScheduledTaskInput, Thread } from "@/shared/contracts";
import type { ScheduleService } from "../schedules/ScheduleService";
import { AppControlsMcpIngress } from "./AppControlsMcpIngress";

let ingress: AppControlsMcpIngress | null = null;

afterEach(() => {
  ingress?.dispose();
  ingress = null;
});

describe("AppControlsMcpIngress", () => {
  it("serves schedule tools and applies calling-thread defaults over Streamable HTTP", async () => {
    const create = vi.fn<(input: ScheduledTaskInput) => ScheduledTask>(
      (input) => ({ id: "created", ...input }) as ScheduledTask,
    );
    const service = {
      list: vi.fn<() => ScheduledTask[]>(() => []),
      create,
    } as unknown as ScheduleService;
    const thread = {
      id: "thread-1",
      agentKind: "codex",
      config: { model: "gpt-5.6", effort: "high" },
    } as Thread;
    ingress = new AppControlsMcpIngress(service, (id) => (id === thread.id ? thread : null));
    const info = await ingress.start();

    const response = await fetch(`${info.url}/mcp?thread=thread-1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${info.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "create_schedule",
          arguments: {
            name: "Daily brief",
            prompt: "Summarize priorities",
            recurrence: { kind: "hourly", minute: 15 },
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { result?: { isError?: boolean } };
    expect(body.result?.isError).not.toBe(true);
    expect(create).toHaveBeenCalledWith({
      name: "Daily brief",
      prompt: "Summarize priorities",
      recurrence: { kind: "hourly", minute: 15 },
      enabled: true,
      agentKind: "codex",
      config: { model: "gpt-5.6", effort: "high" },
    });
  });
});
