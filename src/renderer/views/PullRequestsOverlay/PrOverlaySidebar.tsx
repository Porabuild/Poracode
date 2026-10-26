import { ArrowLeft, GitPullRequest, PanelLeft, PanelLeftClose } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { SidebarButton } from "@/renderer/components/common";
import {
  gitReviewColumnClass,
  sidebarFooterNavClass,
  sidebarIconRailFooterClass,
} from "@/renderer/components/layout/sidebarChrome";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { openPullRequestEntry } from "./list/openPullRequestEntry";
import { PrListPanel } from "./list/PrListPanel";
import { PrStateIcon } from "./list/PrListRow";
import { filterAndSortEntries, groupEntries, pullRequestEntryKey } from "./list/prListModel";
import type { PrListController } from "./list/usePrListController";

/** The review list as the overlay's left column, with the standard collapse rail and footer. */
export function PrOverlaySidebar(props: {
  controller: PrListController;
  selectedKey: string | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { isCollapsed, collapse, expand } = useSidebar();
  const { controller } = props;
  const railGroups = isCollapsed
    ? groupEntries(
        filterAndSortEntries(controller.data.entries, {
          query: "",
          filters: controller.filters,
          sort: controller.sort,
          accountKey: controller.data.accountKey,
        }),
      )
    : null;
  const railSections = railGroups
    ? [railGroups.authored, railGroups.reviewing, railGroups.others].filter(
        (entries) => entries.length > 0,
      )
    : [];
  return (
    <div className="relative h-full">
      {isCollapsed ? (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pb-1 pl-2 pt-0">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {railSections.length === 0 ? (
              <SidebarButton
                iconOnly
                icon={<GitPullRequest className="size-4" />}
                label={t`Pull requests`}
                isActive
              />
            ) : (
              railSections.map((entries, index) => (
                <div key={index} className="space-y-0.5">
                  {index > 0 ? (
                    <div aria-hidden className="my-1 ml-1 h-px w-6 bg-border/60" />
                  ) : null}
                  {entries.map((entry) => {
                    const key = pullRequestEntryKey(entry);
                    const selected = props.selectedKey === key;
                    return (
                      <SidebarButton
                        key={key}
                        iconOnly
                        icon={<PrStateIcon entry={entry.summary.pr} />}
                        label={`#${entry.summary.pr.number} ${entry.summary.pr.title}`}
                        isActive={selected}
                        isCurrentPage={selected}
                        onPress={() => openPullRequestEntry(entry)}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className={sidebarIconRailFooterClass}>
            <SidebarButton
              iconOnly
              icon={<ArrowLeft className="size-4" />}
              label={t`Return to app`}
              onPress={props.onClose}
            />
            <SidebarButton
              iconOnly
              icon={<PanelLeft className="size-4" />}
              label={t`Show sidebar`}
              onPress={expand}
            />
          </div>
        </div>
      ) : null}
      <div
        className={`${gitReviewColumnClass("overlay")} transition-opacity duration-150 ${
          isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"
        }`}
      >
        <div className="min-h-0 flex-1">
          <PrListPanel
            controller={props.controller}
            hideTitle
            selectedKey={props.selectedKey}
            onOpen={openPullRequestEntry}
          />
        </div>
        <div className={sidebarFooterNavClass}>
          <SidebarButton
            icon={<ArrowLeft className="size-4" />}
            label={t`Return to app`}
            onPress={props.onClose}
          />
          <SidebarButton
            icon={<PanelLeftClose className="size-4" />}
            label={t`Hide sidebar`}
            onPress={collapse}
          />
        </div>
      </div>
    </div>
  );
}
