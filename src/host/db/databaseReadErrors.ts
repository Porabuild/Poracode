import { CatalogCursorError } from "@/shared/remote/catalogReadContract";
import { HistoryCursorError } from "@/shared/remote/historyReadContract";
import { RemoteHttpError } from "../remote/auth";
import { CatalogItemTooLargeError } from "../remote/server/catalogPageBudget";
import { HistoryItemTooLargeError } from "../remote/server/historyReadBudget";
import { LegacyReadTooLargeError } from "../remote/server/legacyReadErrors";
import { DatabaseReadUnavailableError, type DatabaseReadFailure } from "./databaseReadProtocol";

export function encodeDatabaseReadFailure(error: unknown): DatabaseReadFailure {
  if (error instanceof LegacyReadTooLargeError)
    return { kind: "legacy-too-large", body: error.body };
  if (error instanceof HistoryItemTooLargeError)
    return { kind: "history-too-large", body: error.body };
  if (error instanceof CatalogItemTooLargeError)
    return { kind: "catalog-too-large", body: error.body };
  if (error instanceof CatalogCursorError)
    return { kind: "catalog-cursor", resource: error.kind, message: error.message };
  if (error instanceof HistoryCursorError)
    return { kind: "history-cursor", message: error.message };
  if (error instanceof RemoteHttpError)
    return {
      kind: "http",
      code: error.code,
      status: error.status,
      message: error.message,
      ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
    };
  return error instanceof Error
    ? {
        kind: "error",
        name: error.name,
        message: error.message,
        ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}),
      }
    : { kind: "error", name: "Error", message: String(error) };
}

export function decodeDatabaseReadFailure(error: DatabaseReadFailure): Error {
  switch (error.kind) {
    case "legacy-too-large":
      return new LegacyReadTooLargeError(error.body);
    case "history-too-large":
      return new HistoryItemTooLargeError(error.body);
    case "catalog-too-large":
      return new CatalogItemTooLargeError(error.body);
    case "catalog-cursor":
      return new CatalogCursorError(error.resource, error.message);
    case "history-cursor":
      return new HistoryCursorError(error.message);
    case "http":
      return new RemoteHttpError(error.code, error.message, error.status, error.retryAfterMs);
    case "error": {
      if (error.code === "SQLITE_BUSY" || error.code === "SQLITE_LOCKED")
        return new DatabaseReadUnavailableError(
          "Database read is temporarily locked. Retry shortly.",
        );
      const result = new Error(error.message);
      result.name = error.name;
      return Object.assign(result, error.code ? { code: error.code } : {});
    }
  }
}
