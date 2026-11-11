import type { RuntimeEvent } from "@/shared/contracts";
import type { RuntimeWriteBatch } from "./runtimeWriteQueue";

export const DATABASE_WRITE_WORKER_PROTOCOL_VERSION = 1 as const;

export interface DatabaseWriteWorkerData {
  readonly version: typeof DATABASE_WRITE_WORKER_PROTOCOL_VERSION;
  readonly dbPath: string;
}

export type DatabaseWriteWorkerRequest =
  | {
      readonly v: typeof DATABASE_WRITE_WORKER_PROTOCOL_VERSION;
      readonly id: number;
      readonly kind: "write-batches";
      readonly batches: readonly RuntimeWriteBatch[];
    }
  | {
      readonly v: typeof DATABASE_WRITE_WORKER_PROTOCOL_VERSION;
      readonly id: number;
      readonly kind: "write-single";
      readonly threadId: string;
      readonly events: readonly RuntimeEvent[];
    }
  | {
      readonly v: typeof DATABASE_WRITE_WORKER_PROTOCOL_VERSION;
      readonly id: number;
      readonly kind: "close";
    };

export interface SerializedStorageError {
  readonly message: string;
  readonly name?: string;
  readonly code?: string;
}

export type DatabaseWriteWorkerResponse =
  | {
      readonly v: typeof DATABASE_WRITE_WORKER_PROTOCOL_VERSION;
      readonly kind: "ready";
    }
  | {
      readonly v: typeof DATABASE_WRITE_WORKER_PROTOCOL_VERSION;
      readonly id: number;
      readonly kind: "batches-result";
      readonly outcome:
        | { readonly kind: "committed" }
        | { readonly kind: "rolled-back"; readonly error: SerializedStorageError }
        | { readonly kind: "thrown"; readonly error: SerializedStorageError };
    }
  | {
      readonly v: typeof DATABASE_WRITE_WORKER_PROTOCOL_VERSION;
      readonly id: number;
      readonly kind: "single-result";
      readonly outcome:
        | { readonly kind: "committed" }
        | { readonly kind: "failed"; readonly error: SerializedStorageError };
    }
  | {
      readonly v: typeof DATABASE_WRITE_WORKER_PROTOCOL_VERSION;
      readonly id: number;
      readonly kind: "closed";
    };
