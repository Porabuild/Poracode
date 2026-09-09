import { afterEach, describe, expect, it } from "vitest";
import { useAppStore } from "./appStore";
import { threadSchema } from "@/shared/contracts";

afterEach(() => useAppStore.setState({ threads: [], view: { kind: "home" } }));

describe("thread creation without text", () => {
  it.each(["", "   "])("creates a persistable title for prompt %j", (prompt) => {
    const thread = useAppStore.getState().createThread({
      projectId: "project",
      agentKind: "example",
      config: { model: "example" },
      prompt,
      presentationMode: "gui",
    });
    expect(thread.title).toBe("New thread");
    expect(threadSchema.safeParse(thread).success).toBe(true);
  });
});
