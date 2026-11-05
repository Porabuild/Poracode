import type { ForgeActivityAction } from "@/shared/remote/protocol/forgeActivity";

export type { ForgeActivityAction };

/** One forge-changing operation found in an agent's command or tool call. */
export interface ForgeCommandActivity {
  readonly action: ForgeActivityAction;
  /** Head/source branch named explicitly by the command (`--head`, `-s`, ...). */
  readonly branch?: string;
}
