import { z } from "zod";

// Reuse validators, never parsed settings. Rebuilding these schemas for every
// field/root migration allocates parser state even when the document is valid.
export const settingsUnknownRecordSchema = z.record(z.string(), z.unknown());
export const settingsStringListSchema = z.array(z.string());
