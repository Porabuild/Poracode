import { z } from "zod";
import { ptyJobNonceSchema } from "./ptyJobOwner";

// Private supervisor/broker IPC, captured with the supervisor build. Raw PTY
// bytes use separate standard pipes and can never impersonate control frames.
export const PTY_BROKER_PROTOCOL_VERSION = 1;
export const PTY_BROKER_CONTROL_MAX_BYTES = 1024 * 1024;
export const PTY_BROKER_INPUT_MAX_BYTES = 4 * 1024 * 1024;
export const PTY_BROKER_INPUT_MAX_CHUNKS = 4096;

const size = z.int().positive().max(65_535);
const decimal = z
  .string()
  .regex(/^[1-9][0-9]*$/u)
  .max(20);
const base = { version: z.literal(PTY_BROKER_PROTOCOL_VERSION), nonce: ptyJobNonceSchema };
export const ptyBrokerLaunchSchema = z.strictObject({
  command: z.string().min(1).max(32_767),
  args: z.array(z.string().max(32_767)).max(4096),
  options: z.strictObject({
    name: z.string().max(128),
    cols: size,
    rows: size,
    cwd: z.string().max(32_767),
    env: z.record(z.string().max(32_767), z.string().max(32_767)),
    handleFlowControl: z.boolean().optional(),
    flowControlPause: z.string().max(128).optional(),
    flowControlResume: z.string().max(128).optional(),
    encoding: z.literal("utf8").optional(),
  }),
});
export type PtyBrokerLaunch = z.infer<typeof ptyBrokerLaunchSchema>;
export const ptyBrokerRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("prove"),
    operationId: decimal,
    creationTicks: decimal,
    bootstrapId: z.uuid(),
  }),
  z.strictObject({ ...base, kind: z.literal("start"), launch: ptyBrokerLaunchSchema }),
  z.strictObject({ ...base, kind: z.literal("resize"), cols: size, rows: size }),
  z.strictObject({ ...base, kind: z.literal("clear") }),
  z.strictObject({ ...base, kind: z.literal("pause") }),
  z.strictObject({ ...base, kind: z.literal("resume") }),
  z.strictObject({ ...base, kind: z.literal("flow-control"), enabled: z.boolean() }),
]);
export type PtyBrokerRequest = z.infer<typeof ptyBrokerRequestSchema>;
export const ptyBrokerReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("ready"),
    pid: z.int().positive(),
    bootstrapId: z.uuid(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("proof"),
    pid: z.int().positive(),
    bootstrapId: z.uuid(),
    operationId: decimal,
    creationTicks: decimal,
  }),
  z.strictObject({
    ...base,
    kind: z.literal("started"),
    pid: z.int().positive(),
    cols: size,
    rows: size,
  }),
  z.strictObject({
    ...base,
    kind: z.literal("exited"),
    exitCode: z.int(),
    signal: z.int().optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("error"),
    code: z.enum(["protocol", "launch", "control", "transport"]),
  }),
]);
export type PtyBrokerReply = z.infer<typeof ptyBrokerReplySchema>;
