import { threadGroupColor } from "@/shared/browserMcpThread";
import { browserTabGroupSchema, type BrowserTabGroupInfo } from "@/shared/ipc";

const AGENT_GROUP_ID = "group-agent";
const AGENT_GROUP_TITLE = "Poracode";
const AGENT_GROUP_COLOR = "purple" as const;

interface GroupableTab {
  tabId: string;
}

export class BrowserTabGroups {
  private groups: BrowserTabGroupInfo[] = [];
  /** tabId -> groupId. The tab's group membership (kept off BrowserTab). */
  private readonly tabGroupOf = new Map<string, string>();

  restore(groups: unknown): void {
    this.tabGroupOf.clear();
    this.groups = Array.isArray(groups)
      ? groups.map(parsePersistedGroup).filter((g): g is BrowserTabGroupInfo => g !== null)
      : [];
  }

  serialize(): BrowserTabGroupInfo[] | undefined {
    return this.groups.length > 0 ? this.snapshot() : undefined;
  }

  snapshot(): BrowserTabGroupInfo[] {
    return this.groups.map((g) => ({ ...g }));
  }

  groupIdForTab(tabId: string): string | undefined {
    return this.tabGroupOf.get(tabId);
  }

  hasGroup(groupId: string): boolean {
    return this.groups.some((g) => g.id === groupId);
  }

  assignRestoredTab(tabId: string, groupId: string): boolean {
    if (!this.hasGroup(groupId)) return false;
    const previous = this.tabGroupOf.get(tabId);
    this.tabGroupOf.set(tabId, groupId);
    return previous !== groupId;
  }

  assignAgentTab(
    tabs: GroupableTab[],
    tabId: string,
    threadId: string | undefined,
    threadTitle: string | undefined,
  ): boolean {
    return this.assignTabToGroup(tabs, tabId, this.ensureThreadGroup(threadId, threadTitle));
  }

  /** Assign a tab to a group, keeping the group's members contiguous. */
  assignTabToGroup(tabs: GroupableTab[], tabId: string, groupId: string): boolean {
    if (!tabs.some((t) => t.tabId === tabId) || !this.hasGroup(groupId)) return false;
    const previous = this.tabGroupOf.get(tabId);
    this.tabGroupOf.set(tabId, groupId);
    const members = tabs.filter(
      (t) => t.tabId !== tabId && this.tabGroupOf.get(t.tabId) === groupId,
    );
    if (members.length === 0) return previous !== groupId;
    const from = tabs.findIndex((t) => t.tabId === tabId);
    const [moved] = tabs.splice(from, 1);
    if (!moved) return previous !== groupId;
    const lastMemberId = members[members.length - 1]!.tabId;
    const to = tabs.findIndex((t) => t.tabId === lastMemberId) + 1;
    tabs.splice(to, 0, moved);
    return previous !== groupId || from !== to;
  }

  /** Drop groups that no longer have any member tabs. */
  pruneEmptyGroups(): boolean {
    const knownGroups = new Set(this.groups.map((g) => g.id));
    let changed = false;
    for (const [tabId, groupId] of this.tabGroupOf) {
      if (!knownGroups.has(groupId)) {
        this.tabGroupOf.delete(tabId);
        changed = true;
      }
    }
    const used = new Set(this.tabGroupOf.values());
    const before = this.groups.length;
    this.groups = this.groups.filter((g) => used.has(g.id));
    return changed || this.groups.length !== before;
  }

  setCollapsed(groupId: string, collapsed: boolean): boolean {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group || group.collapsed === collapsed) return false;
    group.collapsed = collapsed;
    return true;
  }

  /** Remove a group and detach all its tabs (the tabs themselves stay open). */
  ungroup(groupId: string): boolean {
    let changed = false;
    for (const [tabId, gid] of this.tabGroupOf) {
      if (gid === groupId) {
        this.tabGroupOf.delete(tabId);
        changed = true;
      }
    }
    const before = this.groups.length;
    this.groups = this.groups.filter((g) => g.id !== groupId);
    return changed || this.groups.length !== before;
  }

  rename(groupId: string, title: string): boolean {
    const group = this.groups.find((g) => g.id === groupId);
    const next = title.trim().slice(0, 60);
    if (!group || !next || group.title === next) return false;
    group.title = next;
    return true;
  }

  setColor(groupId: string, color: BrowserTabGroupInfo["color"]): boolean {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group || group.color === color) return false;
    group.color = color;
    return true;
  }

  tabIdsInGroup(groupId: string): string[] {
    return [...this.tabGroupOf.entries()]
      .filter(([, gid]) => gid === groupId)
      .map(([tabId]) => tabId);
  }

  moveTabToTargetGroup(tabId: string, targetTabId: string): boolean {
    const targetGroupId = this.tabGroupOf.get(targetTabId);
    const previous = this.tabGroupOf.get(tabId);
    let changed = false;
    if (targetGroupId && this.hasGroup(targetGroupId)) {
      if (previous !== targetGroupId) {
        this.tabGroupOf.set(tabId, targetGroupId);
        changed = true;
      }
    } else if (this.tabGroupOf.delete(tabId)) {
      changed = true;
    }
    return this.pruneEmptyGroups() || changed;
  }

  removeTab(tabId: string): boolean {
    const changed = this.tabGroupOf.delete(tabId);
    return this.pruneEmptyGroups() || changed;
  }

  /** Find/create the agent ("Poracode") group and return its id. */
  private ensureAgentGroup(): string {
    if (!this.groups.some((g) => g.id === AGENT_GROUP_ID)) {
      this.groups.push({
        id: AGENT_GROUP_ID,
        title: AGENT_GROUP_TITLE,
        color: AGENT_GROUP_COLOR,
        collapsed: false,
      });
    }
    return AGENT_GROUP_ID;
  }

  /**
   * Find/create the tab group owned by `threadId`, named after the thread's
   * task. The renderer resolves the live thread title for display, so `title`
   * here is only the initial/fallback label. Falls back to the shared
   * "Poracode" group when the thread id is missing.
   */
  private ensureThreadGroup(threadId: string | undefined, title: string | undefined): string {
    if (!threadId) return this.ensureAgentGroup();
    const id = `group-thread-${threadId}`;
    const existing = this.groups.find((g) => g.id === id);
    const label = title?.trim().slice(0, 60) || AGENT_GROUP_TITLE;
    if (existing) {
      // Backfill a better label once the task title is known.
      if (title?.trim() && existing.title === AGENT_GROUP_TITLE) existing.title = label;
      return id;
    }
    this.groups.push({
      id,
      title: label,
      color: threadGroupColor(threadId),
      collapsed: false,
      threadId,
    });
    return id;
  }
}

function parsePersistedGroup(value: unknown): BrowserTabGroupInfo | null {
  const parsed = browserTabGroupSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
