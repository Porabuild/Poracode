export interface MuseChildState {
  sessionId?: string;
  status?: "inProgress" | "completed" | "failed" | "cancelled";
  result?: string;
}

export function museRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function museJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return museRecord(value);
  try {
    return museRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

export function museString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * 1.4.6 persists these links but omits the corresponding MSP `subagent` items.
 * Read only the owner records; transcript content still comes from MSP.
 */
export class MuseSubagentDiscovery {
  readonly children = new Map<string, MuseChildState>();
  private consumed = 0;

  ingest(text: string): void {
    if (text.length < this.consumed) this.consumed = 0;
    const unread = text.slice(this.consumed);
    const end = unread.lastIndexOf("\n") + 1;
    this.consumed += end;
    for (const line of unread.slice(0, end).split("\n")) {
      if (!line.includes('"subagent.control.')) continue;
      const frame = museJsonRecord(line);
      const record = museRecord(museRecord(frame["payload"])["record"]);
      const id = museString(record["subagent_id"]);
      if (!id) continue;
      const child = this.children.get(id) ?? {};
      switch (frame["payload_type"]) {
        case "subagent.control.child_session_bound": {
          const sessionId = museString(record["child_session_id"]);
          if (sessionId && sessionId !== child.sessionId) {
            child.sessionId = sessionId;
            child.status = "inProgress";
            delete child.result;
          }
          break;
        }
        case "subagent.control.status_updated":
          if (record["control_status"] === "running") {
            child.status = "inProgress";
            delete child.result;
          }
          break;
        case "subagent.control.result_ready": {
          child.status = museSubagentResultStatus(record["error_kind"]);
          const result = museString(record["summary"]);
          if (result) child.result = result;
          break;
        }
        default:
          continue;
      }
      this.children.set(id, child);
    }
  }
}
import { museSubagentResultStatus } from "./subagentMapping";
