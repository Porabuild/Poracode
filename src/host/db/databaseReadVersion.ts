// Read-only worker messages are internal to one installed runtime. Reject a
// stale worker before opening its connection. Database migrations and the
// optional public search capability are versioned separately.
// v2 adds the bounded conversation-search reads and revisioned index batches.
// v3 carries bounded preview snapshots and generated-preview notifications.
// Profile rollup operations are additive: older workers reject unknown names
// before reads, while persisted usage and public profile response shapes stay valid.
export const DATABASE_READ_WORKER_PROTOCOL_VERSION = 3 as const;

// Loading dependencies changed, but v3 messages and old-artifact refusal stay valid.
