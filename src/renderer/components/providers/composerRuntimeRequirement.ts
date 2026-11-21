import type { MessageDescriptor } from "@lingui/core";
import type { AgentStatus, ThreadPresentationMode } from "@/shared/contracts";
import { lookupProviderRegistration } from "./providerRegistry";

/** A missing, independently installable runtime that blocks this presentation. */
export interface ComposerRuntimeRequirement {
  description: MessageDescriptor;
  installLabel: MessageDescriptor;
  registryAgentId: string;
}

type Resolver = (
  status: AgentStatus,
  presentation: ThreadPresentationMode,
) => ComposerRuntimeRequirement | undefined;
const requirements = new Map<string, Resolver>();

export function registerComposerRuntimeRequirement(kind: string, resolver: Resolver): void {
  requirements.set(kind, resolver);
}

export function composerRuntimeRequirement(
  status: AgentStatus | undefined,
  presentation: ThreadPresentationMode,
): ComposerRuntimeRequirement | undefined {
  return status
    ? lookupProviderRegistration(requirements, status.kind)?.(status, presentation)
    : undefined;
}
