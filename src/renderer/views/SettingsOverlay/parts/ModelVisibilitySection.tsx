import { useDeferredValue, useEffect, useState } from "react";
import { Button, Popover } from "@heroui/react";
import { Check, Minus, Search } from "lucide-react";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import {
  buildProviderModelItems,
  statusToMenuProvider,
  type ProviderModelMenuProvider,
  type ProviderModelItem,
} from "@/renderer/components/common/ProviderModelMenu";
import { capabilitiesForPresentation } from "@/renderer/components/thread/threadComposerOptions";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  modelVisibilityKey,
  providerLabelForPresentation,
  providerMenuKey,
  providerVisibilityKey,
} from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";

type SubGroupState = "all" | "some" | "none";

interface ModelEntry {
  providerKey: string;
  modelId: string;
}

function modelVisibilityProviders(
  agents: ReturnType<typeof getSettingsInstalledAgents>,
): ProviderModelMenuProvider[] {
  return agents.flatMap((agent) => {
    if (agent.kind !== "cursor") return [statusToMenuProvider(agent)];

    const supported = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
    return supported
      .map((presentationMode): ProviderModelMenuProvider => {
        const provider: ProviderModelMenuProvider = {
          kind: agent.kind,
          label: agent.label,
          presentationMode,
          ...(agent.icon ? { icon: agent.icon } : {}),
          modelPickerKey: providerMenuKey({ kind: agent.kind, presentationMode }),
          hiddenModelsKey: modelVisibilityKey(agent.kind, presentationMode),
          capabilities: capabilitiesForPresentation(agent.capabilities, presentationMode),
        };
        return {
          ...provider,
          label: providerLabelForPresentation(provider),
        };
      })
      .filter((provider) => provider.capabilities.models.some((model) => model.id !== "auto"));
  });
}

function GroupCheckIcon(props: { state: SubGroupState; className?: string }) {
  if (props.state === "some") {
    return <Minus className={`size-3 shrink-0 text-foreground ${props.className ?? ""}`} />;
  }
  return (
    <Check
      className={`size-3 shrink-0 transition-opacity ${
        props.state === "all" ? "opacity-100 text-foreground" : "opacity-0"
      } ${props.className ?? ""}`}
    />
  );
}

function ModelVisibilityRow(props: {
  item: ProviderModelItem;
  isVisible: boolean;
  groupState?: SubGroupState;
  indent?: boolean;
  onToggleModel: (providerKey: string, modelId: string) => void;
  onToggleGroup: (headerId: string) => void;
}) {
  const { item, isVisible, groupState, indent, onToggleModel, onToggleGroup } = props;

  if (item.type === "header-provider") {
    const state = groupState ?? "all";
    const handleToggle = () => onToggleGroup(item.id);
    return (
      <div
        role="option"
        aria-selected={state === "all"}
        aria-checked={state === "all" ? "true" : state === "none" ? "false" : "mixed"}
        tabIndex={0}
        className="lightcode-menu-item group mx-1.5 mb-1 mt-2 flex h-8 cursor-default items-center gap-2 border-b border-border bg-overlay px-2 text-sm font-semibold text-foreground first:mt-0"
        onClick={handleToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleToggle();
          }
        }}
      >
        <GroupCheckIcon state={state} className="size-3.5" />
        <ProviderIcon
          kind={item.providerKind}
          {...(item.providerIcon ? { icon: item.providerIcon } : {})}
          tone="active"
          className="size-3.5"
        />
        <span className="min-w-0 truncate">{item.label}</span>
      </div>
    );
  }

  if (item.type === "header-sub") {
    const state = groupState ?? "all";
    const handleToggle = () => onToggleGroup(item.id);
    return (
      <div
        role="option"
        aria-selected={state === "all"}
        aria-checked={state === "all" ? "true" : state === "none" ? "false" : "mixed"}
        tabIndex={0}
        className="lightcode-menu-item group mx-1.5 flex h-6 cursor-default items-center pl-4 pr-2 text-[10px] font-normal italic tracking-normal text-muted/60"
        onClick={handleToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleToggle();
          }
        }}
      >
        <GroupCheckIcon state={state} />
        <span className="ml-1 min-w-0 truncate">{item.label}</span>
      </div>
    );
  }

  if (item.type === "header-plain") {
    return null;
  }

  const labelParts = item.label.split(" · ");
  const name = labelParts[0] ?? item.label;
  const hint = labelParts.length > 1 ? labelParts.slice(1).join(" · ") : undefined;
  const mutedHint = [hint, item.contextDescription].filter(Boolean).join(" · ");

  return (
    <div
      role="option"
      aria-selected={isVisible}
      tabIndex={0}
      className={`lightcode-menu-item group mx-1.5 flex h-7 cursor-default items-center text-foreground ${
        indent ? "pl-4" : ""
      }`}
      onClick={() => onToggleModel(item.hiddenModelsKey, item.modelId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleModel(item.hiddenModelsKey, item.modelId);
        }
      }}
    >
      <Check
        className={`size-3 shrink-0 transition-opacity ${isVisible ? "opacity-100" : "opacity-0"}`}
      />
      <span className="ml-1 flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate">{name}</span>
        {mutedHint ? (
          <span className="shrink-0 text-[10px] leading-none text-muted/60">· {mutedHint}</span>
        ) : null}
      </span>
      {item.subProviderLabel ? (
        <span className="ml-auto shrink-0 truncate text-[10px] text-muted/70">
          {item.subProviderLabel}
        </span>
      ) : null}
    </div>
  );
}

export function ModelVisibilitySection() {
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const hiddenModels = useSharedSettings((s) => s.hiddenModels);
  const setHiddenModels = useSharedSettings((s) => s.setHiddenModels);

  const installedAgents = getSettingsInstalledAgents(agentStatuses, wslAgentStatuses);
  const providers = modelVisibilityProviders(installedAgents);

  const allModels: ModelEntry[] = [];
  for (const provider of providers) {
    const providerKey = providerVisibilityKey(provider);
    for (const model of provider.capabilities.models) {
      if (model.id === "auto") continue;
      allModels.push({ providerKey, modelId: model.id });
    }
  }

  const hiddenByProvider = new Map<string, Set<string>>();
  for (const provider of providers) {
    const providerKey = providerVisibilityKey(provider);
    hiddenByProvider.set(providerKey, new Set(hiddenModels[providerKey] ?? []));
  }

  const totalCount = allModels.length;
  const visibleCount = allModels.filter(
    (m) => !(hiddenByProvider.get(m.providerKey)?.has(m.modelId) ?? false),
  ).length;

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  const items = isOpen
    ? buildProviderModelItems({ providers, search: deferredSearch }).filter(
        (item) => !(item.type === "model" && item.modelId === "auto"),
      )
    : [];

  const groupModelEntries = new Map<string, ModelEntry[]>();
  {
    let activeProviderHeaderId: string | null = null;
    let activeSubHeader: string | null = null;
    for (const item of items) {
      if (item.type === "header-provider") {
        activeProviderHeaderId = item.id;
        activeSubHeader = null;
        if (!groupModelEntries.has(item.id)) groupModelEntries.set(item.id, []);
      } else if (item.type === "header-sub") {
        activeSubHeader = item.id;
        if (!groupModelEntries.has(item.id)) groupModelEntries.set(item.id, []);
      } else if (item.type === "header-plain") {
        activeSubHeader = null;
      } else if (item.type === "model") {
        const entry: ModelEntry = { providerKey: item.hiddenModelsKey, modelId: item.modelId };
        if (activeProviderHeaderId) {
          groupModelEntries.get(activeProviderHeaderId)?.push(entry);
        }
        if (activeSubHeader) {
          groupModelEntries.get(activeSubHeader)?.push(entry);
        }
      }
    }
  }

  const groupStates = new Map<string, SubGroupState>();
  for (const [headerId, entries] of groupModelEntries) {
    if (entries.length === 0) {
      groupStates.set(headerId, "all");
      continue;
    }
    const hiddenIn = entries.filter(
      (e) => hiddenByProvider.get(e.providerKey)?.has(e.modelId) ?? false,
    ).length;
    groupStates.set(
      headerId,
      hiddenIn === 0 ? "all" : hiddenIn === entries.length ? "none" : "some",
    );
  }

  function toggleModel(providerKey: string, modelId: string) {
    const current = new Set(hiddenByProvider.get(providerKey) ?? []);
    if (current.has(modelId)) current.delete(modelId);
    else current.add(modelId);
    setHiddenModels(providerKey, [...current]);
  }

  function toggleGroup(headerId: string) {
    const entries = groupModelEntries.get(headerId);
    if (!entries || entries.length === 0) return;
    const state = groupStates.get(headerId) ?? "all";
    const hideAll = state === "all";
    const byProvider = new Map<string, Set<string>>();
    for (const entry of entries) {
      let set = byProvider.get(entry.providerKey);
      if (!set) {
        set = new Set(hiddenByProvider.get(entry.providerKey) ?? []);
        byProvider.set(entry.providerKey, set);
      }
      if (hideAll) set.add(entry.modelId);
      else set.delete(entry.modelId);
    }
    for (const [providerKey, set] of byProvider) {
      setHiddenModels(providerKey, [...set]);
    }
  }

  function setAllHidden(hideAll: boolean) {
    const byProvider = new Map<string, Set<string>>();
    for (const provider of providers) byProvider.set(providerVisibilityKey(provider), new Set());
    if (hideAll) {
      for (const model of allModels) {
        byProvider.get(model.providerKey)?.add(model.modelId);
      }
    }
    for (const [providerKey, set] of byProvider) {
      setHiddenModels(providerKey, [...set]);
    }
  }

  if (providers.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Visible models</p>
        <p className="text-xs text-muted">
          Hide models you don&apos;t use from the model picker across every provider.
        </p>
      </div>
      <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger>
          <Button variant="secondary" size="sm" className="min-w-[5rem] tabular-nums">
            {visibleCount} / {totalCount}
          </Button>
        </Popover.Trigger>
        <Popover.Content placement="bottom end" className="w-96 p-0">
          <Popover.Dialog className="flex max-h-[32rem] flex-col overflow-hidden !p-0">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-3.5 shrink-0 text-muted" />
              <input
                aria-label="Search models"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
                placeholder="Search models..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted/80">
              <span className="tabular-nums">
                {visibleCount} of {totalCount} visible
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-foreground/70 hover:text-foreground"
                  onClick={() => setAllHidden(false)}
                >
                  Show all
                </button>
                <span className="text-muted/40">·</span>
                <button
                  type="button"
                  className="text-foreground/70 hover:text-foreground"
                  onClick={() => setAllHidden(true)}
                >
                  Hide all
                </button>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="px-3 py-3 text-center text-sm text-muted">No models found</div>
            ) : (
              <div
                role="listbox"
                aria-label="Visible models"
                aria-multiselectable="true"
                className="lightcode-menu no-scrollbar max-h-[26rem] overflow-y-auto py-1.5"
              >
                {(() => {
                  let underSub = false;
                  return items.map((item) => {
                    if (item.type === "header-provider" || item.type === "header-plain") {
                      underSub = false;
                    } else if (item.type === "header-sub") {
                      underSub = true;
                    }
                    const isVisible =
                      item.type === "model"
                        ? !(hiddenByProvider.get(item.hiddenModelsKey)?.has(item.modelId) ?? false)
                        : false;
                    const headerId =
                      item.type === "header-provider" || item.type === "header-sub"
                        ? item.id
                        : undefined;
                    const indent = item.type === "model" && underSub;
                    return (
                      <ModelVisibilityRow
                        key={item.id}
                        item={item}
                        isVisible={isVisible}
                        {...(headerId ? { groupState: groupStates.get(headerId) ?? "all" } : {})}
                        {...(indent ? { indent: true } : {})}
                        onToggleModel={toggleModel}
                        onToggleGroup={toggleGroup}
                      />
                    );
                  });
                })()}
              </div>
            )}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}
