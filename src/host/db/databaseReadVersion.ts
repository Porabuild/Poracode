// Read-only worker messages are internal to one installed runtime. Reject a
// stale worker before opening its connection. Database migrations and the
// optional public search capability are versioned separately.
// v2 adds the bounded conversation-search reads and revisioned index batches.
// v3 carries bounded preview snapshots and generated-preview notifications.
export const DATABASE_READ_WORKER_PROTOCOL_VERSION = 3 as const;

// Loading dependencies changed, but v3 messages and old-artifact refusal stay valid.
