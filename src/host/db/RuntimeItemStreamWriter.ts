import type Database from "better-sqlite3";
import type { RuntimeEvent } from "@/shared/contracts";
import { safeParse } from "./rowMappers";
import {
  appendRuntimeStreamHead,
  prepareRuntimeStreamHead,
  resetRuntimeStreamHead,
} from "./runtimeStreamHeadStore";
import { appendFrozenStreamDelta, appendStreamDelta, clearItemStream } from "./runtimeStreamStore";

export interface RuntimeItemStreamStatements {
  updateItemStreams: Database.Statement;
  setItemState: Database.Statement;
}

type CachedStreamItem = { itemId: string; state: string; stream: string } & (
  | { kind: "indexed"; headId: number | undefined }
  | { kind: "legacy"; head: Record<string, string> }
);

/** One consecutive stream's identity, owned by this transaction prefix only. */
export class RuntimeItemStreamWriter {
  private cached: CachedStreamItem | undefined;

  constructor(
    private readonly sqlite: InstanceType<typeof Database>,
    private readonly threadId: string,
    private readonly statements: RuntimeItemStreamStatements,
  ) {}

  invalidate(): void {
    this.cached = undefined;
  }

  append(event: Extract<RuntimeEvent, { type: "content.delta" }>): void {
    if (event.replace) this.invalidate();
    let row = this.cached;
    const createStream = !!event.replace || event.delta.length > 0;
    if (
      row?.itemId !== event.itemId ||
      row.stream !== event.stream ||
      (row.kind === "indexed" && row.headId === undefined && createStream)
    ) {
      const prepared = prepareRuntimeStreamHead(this.sqlite, {
        threadId: this.threadId,
        itemId: event.itemId,
        stream: event.stream,
        createStream,
      });
      if (prepared.kind === "missing") {
        this.invalidate();
        return;
      }
      const identity = { itemId: event.itemId, stream: event.stream, state: prepared.state };
      row =
        prepared.kind === "ready"
          ? { ...identity, kind: "indexed", headId: prepared.head?.head_id }
          : {
              ...identity,
              kind: "legacy",
              // Malformed rows retain the legacy path's result or refusal. For
              // indexed exceptional keys, preparation captures effective siblings.
              head: prepared.streams ? (safeParse(prepared.streams) as Record<string, string>) : {},
            };
      this.cached = row;
    }
    const input = {
      threadId: this.threadId,
      itemId: event.itemId,
      stream: event.stream,
      delta: event.delta,
    };
    const nextState = row.state === "completed" ? "completed" : "updated";
    if (row.kind === "indexed") {
      if (event.replace) {
        clearItemStream(this.sqlite, this.threadId, event.itemId, event.stream);
        resetRuntimeStreamHead(this.sqlite, row.headId!);
      }
      if (row.headId !== undefined && event.delta.length > 0) {
        const { remainder } = appendRuntimeStreamHead(this.sqlite, row.headId, event.delta);
        appendFrozenStreamDelta(this.sqlite, { ...input, delta: remainder });
      }
      if (row.state !== nextState) {
        this.statements.setItemState.run(nextState, this.threadId, event.itemId);
      }
    } else {
      if (event.replace) {
        clearItemStream(this.sqlite, this.threadId, event.itemId, event.stream);
        row.head[event.stream] = "";
      }
      const appended = appendStreamDelta(this.sqlite, {
        ...input,
        head: row.head[event.stream] ?? "",
      });
      if (appended.head === undefined && !event.replace) {
        if (row.state !== nextState) {
          this.statements.setItemState.run(nextState, this.threadId, event.itemId);
        }
      } else {
        row.head = { ...row.head, [event.stream]: appended.head ?? "" };
        this.statements.updateItemStreams.run(
          nextState,
          JSON.stringify(row.head),
          this.threadId,
          event.itemId,
        );
      }
    }
    row.state = nextState;
  }
}
