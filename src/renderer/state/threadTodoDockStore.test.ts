import { describe, expect, it } from "vitest";
import { useThreadTodoDockStore } from "./threadTodoDockStore";

describe("threadTodoDockStore persistence", () => {
  it("migrates v2 state without the removed placement fields", async () => {
    const migrate = useThreadTodoDockStore.persist.getOptions().migrate!;
    const migrated = await migrate(
      {
        defaultCollapsed: true,
        defaultPlacement: "composer",
        byThreadId: {
          "thread-1": {
            collapsed: false,
            retiredSourceItemId: "todo-1",
            placement: "right",
          },
        },
      },
      2,
    );

    expect(migrated).toEqual({
      defaultCollapsed: true,
      byThreadId: {
        "thread-1": { collapsed: false, retiredSourceItemId: "todo-1" },
      },
    });
  });
});
