export class RemoteClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RemoteClientError";
  }
}

export function isUnauthorizedRemoteError(error: unknown): error is RemoteClientError {
  return error instanceof RemoteClientError && (error.status === 401 || error.status === 403);
}

export function isRemoteTransportFailure(error: unknown): boolean {
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return true;
  if (
    error instanceof RemoteClientError &&
    (error.status === 0 || error.status === 502 || error.status === 504)
  ) {
    return true;
  }
  return error instanceof Error && error.cause !== undefined
    ? isRemoteTransportFailure(error.cause)
    : false;
}
