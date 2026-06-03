import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Push-driven async queue feeding the Claude Agent SDK's streaming-input mode:
 * callers `push()` user turns as they arrive and `close()` when the stream
 * ends. Shared by the live session runtime and the capabilities probe (which
 * pushes a single throwaway turn to read fast-mode availability).
 */
export class AsyncPromptQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private waiters: Array<(result: IteratorResult<SDKUserMessage>) => void> = [];
  private closed = false;

  push(message: SDKUserMessage): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ done: false, value: message });
      return;
    }
    this.items.push(message);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const value = this.items.shift();
        if (value) return Promise.resolve({ done: false, value });
        if (this.closed) return Promise.resolve({ done: true, value: undefined });
        return new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}
