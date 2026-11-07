import { useRef } from "react";
import type { PrReviewThread } from "@/shared/contracts";
import { usePrFlow } from "../detail/prFlow";
import type { PrViewedState } from "../viewed/prViewedFiles";
import type { ChangeEntry } from "./changesModel";
import { FileDiffCard, type DiffViewOptions } from "./FileDiffCard";
import type { ReviewDraftComment } from "./prReviewDraftStore";
import type { useDiffNavigation } from "./useDiffNavigation";

const NONE: readonly never[] = [];

/** The column of file cards (scrollable, or flowing in the page scroll). Every card builds its own diff when it nears the viewport. */
export function ChangesDiffList(props: {
  entries: readonly ChangeEntry[];
  options: DiffViewOptions;
  navigation: ReturnType<typeof useDiffNavigation>;
  viewStates: ReadonlyMap<string, PrViewedState> | null;
  onToggleViewed: ((path: string) => void) | null;
  viewedDisabled: boolean;
  viewedLabel: string;
  threadsByPath: ReadonlyMap<string, readonly PrReviewThread[]>;
  draftsByPath: ReadonlyMap<string, readonly ReviewDraftComment[]>;
  draftKey: string;
  headSha: string | undefined;
  commentsEnabled: boolean;
}) {
  const { entries, navigation, viewStates } = props;
  const { flow, scrollRoot: pageRoot } = usePrFlow();
  const ownRoot = useRef<HTMLDivElement | null>(null);
  const scrollRoot = flow ? pageRoot : ownRoot;
  return (
    <div
      ref={flow ? undefined : ownRoot}
      className={flow ? "px-2 pb-4 pt-2" : "h-full min-h-0 overflow-y-auto px-4 pb-3 pt-3"}
    >
      <div className="space-y-4">
        {entries.map((entry) => (
          <FileDiffCard
            key={entry.file.path}
            entry={entry}
            options={props.options}
            collapsed={navigation.isCollapsed(entry)}
            onToggleCollapsed={navigation.toggleCollapsed}
            loaded={navigation.loaded.has(entry.file.path)}
            onLoad={navigation.load}
            viewState={viewStates?.get(entry.file.path) ?? "unread"}
            onToggleViewed={props.onToggleViewed}
            viewedDisabled={props.viewedDisabled}
            viewedLabel={props.viewedLabel}
            threads={props.threadsByPath.get(entry.file.path) ?? NONE}
            drafts={props.draftsByPath.get(entry.file.path) ?? NONE}
            draftKey={props.draftKey}
            headSha={props.headSha}
            commentsEnabled={props.commentsEnabled}
            scrollRoot={scrollRoot}
            registerElement={navigation.registerElement}
            onBuilt={navigation.onBuilt}
          />
        ))}
      </div>
    </div>
  );
}
