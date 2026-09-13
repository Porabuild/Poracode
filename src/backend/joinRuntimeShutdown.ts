/** Start every stop immediately, then join all admitted work even after a failure. */
export function joinRuntimeShutdown(
  stops: readonly (() => void | Promise<void>)[],
  message = "Backend runtime work did not shut down cleanly.",
): Promise<void> {
  const work = stops.map((stop) => {
    try {
      return Promise.resolve(stop());
    } catch (error) {
      return Promise.reject(error);
    }
  });
  return Promise.allSettled(work).then((results) => {
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason as unknown] : [],
    );
    if (errors.length) throw new AggregateError(errors, message);
  });
}
